import { CHARACTERS } from '@core/content/characters';
import { ShiftSession } from '@core/session/ShiftSession';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { bagTotal } from '@core/systems/bag';
import { useShiftStore } from '@state/shiftStore';
import * as THREE from 'three';
import { connectSession, type SessionBridge } from './bridge';
import { InputController } from './input/InputController';
import { ActorView, LastSeenGhost, StatusIcon } from './render/actors';
import { toWorld } from './render/coords';
import { FogOfWar } from './render/fogOfWar';
import { IsoCamera } from './render/isoCamera';
import { Dial, floorRing, Sparks, textSprite } from './render/markers';
import { createWorldShading, MaterialKit } from './render/materials';
import { buildBoss, buildStudent, buildWorker, disposeModelCache } from './render/models';
import { PALETTE, STUDENT_SHIRTS } from './render/palette';
import { VisionCone } from './render/visionCones';
import { buildWorld, type World } from './render/world';

export interface EngineParams {
  config: ShiftConfig;
  onEnd(summary: ShiftSummary): void;
}

/** Fixed simulation step: deterministic and frame-rate independent. */
const STEP = 1 / 60;
/** Cap catch-up work after a stall (spiral-of-death guard). */
const MAX_STEPS_PER_FRAME = 8;
/** Pause before handing the summary to React so the end-of-shift banner can be read. */
const END_DELAY_MS = 1800;

interface NpcViews {
  actor: ActorView;
  icon: StatusIcon;
  ghost: LastSeenGhost;
  cone: VisionCone;
  heard: THREE.Mesh;
}

/** `?debug` exposes the live session on `window.__copper` for e2e tests and tinkering. */
const debugHooksEnabled = () =>
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

/**
 * Owns the renderer, scene and loop for one shift. A thin adapter: it feeds input and time into
 * the ShiftSession and draws whatever the session says. No game rules live here.
 */
export class GameEngine {
  readonly session: ShiftSession;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly iso = new IsoCamera();
  private readonly kit: MaterialKit;
  private readonly world: World;
  private readonly fog: FogOfWar;
  private readonly input = new InputController();
  private readonly bridge: SessionBridge;
  private readonly player: ActorView;
  private readonly boss: NpcViews;
  private readonly students: NpcViews[];
  private readonly focusRing = floorRing(0.5, 0.6, PALETTE.focus);
  private readonly progress = new Dial('#ffb74d');
  private readonly recharge = new Map<string, Dial>();
  private readonly zzz = textSprite('z Z z', '#d1c4e9', 0.45, '#311b92');
  private readonly sparks = new Sparks();
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private last = performance.now();
  private accumulator = 0;
  private endTimer: number | undefined;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    params: EngineParams,
  ) {
    this.session = new ShiftSession(params.config);
    const { level } = this.session;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(PALETTE.background);

    const shading = createWorldShading(level.cols, level.rows);
    this.kit = new MaterialKit(shading);
    this.world = buildWorld(this.scene, this.session, this.kit);
    this.fog = new FogOfWar(level.cols, level.rows);
    shading.uLightMap.value = this.world.lightMap;
    shading.uFogMap.value = this.fog.texture;

    const character = CHARACTERS.get(this.session.character.id);
    this.player = new ActorView(buildWorker(this.kit, character.color, true), this.scene);
    this.boss = this.npcViews(
      new ActorView(buildBoss(this.kit), this.scene),
      PALETTE.ghostBoss,
      1.25,
    );
    this.students = this.session.students.map((_, i) =>
      this.npcViews(
        new ActorView(
          buildStudent(this.kit, STUDENT_SHIRTS[i % STUDENT_SHIRTS.length]!),
          this.scene,
        ),
        PALETTE.ghostStudent,
        0.85,
      ),
    );

    this.scene.add(this.focusRing, this.progress.sprite, this.zzz, this.sparks.points);

    this.bridge = connectSession(this.session, (summary) => {
      this.endTimer = window.setTimeout(() => params.onEnd(summary), END_DELAY_MS);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    host.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('blur', this.onBlur);

    if (debugHooksEnabled()) {
      (window as unknown as { __copper?: unknown }).__copper = {
        session: this.session,
        engine: this,
      };
    }

    this.iso.follow(
      toWorld(this.session.player.pos.x),
      toWorld(this.session.player.pos.y),
      0,
      true,
    );
    this.frame = requestAnimationFrame(this.loop);
  }

  private npcViews(actor: ActorView, ghostColor: number, height: number): NpcViews {
    const cone = new VisionCone();
    this.scene.add(cone.group);
    const heard = floorRing(0.35, 0.45, ghostColor, true);
    this.scene.add(heard);
    return {
      actor,
      icon: new StatusIcon(this.scene),
      ghost: new LastSeenGhost(this.scene, ghostColor, height),
      cone,
      heard,
    };
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.iso.zoomBy(e.deltaY > 0 ? -1 : 1);
  };

  private onBlur = () => {
    if (this.session.status === 'running') useShiftStore.getState().setPaused(true);
  };

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.iso.resize(w, h);
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    const store = useShiftStore.getState();
    if (this.input.pausePressed() && this.session.status === 'running') store.togglePause();
    if (!useShiftStore.getState().paused) {
      const input = this.input.read(this.iso);
      this.accumulator = Math.min(this.accumulator + dt, STEP * MAX_STEPS_PER_FRAME);
      let first = true;
      while (this.accumulator >= STEP) {
        // Edge-triggered actions fire on the first sub-step only.
        this.session.tick(STEP, first ? input : { ...input, ability: false });
        this.accumulator -= STEP;
        first = false;
      }
    }

    this.draw(dt, now / 1000);
    this.bridge.publish(now);
  };

  private draw(dt: number, time: number) {
    const s = this.session;
    const p = s.player;
    const px = toWorld(p.pos.x);
    const pz = toWorld(p.pos.y);

    // Player.
    this.player.sync(p, dt);
    const carrying = bagTotal(s.bag) > 0;
    if (this.player.model.sack) this.player.model.sack.visible = carrying;
    const blink = p.grace > 0 ? (Math.floor(time * 8) % 2 === 0 ? 0.35 : 0.9) : 1;
    const opacity = p.abilityActive > 0 ? 0.45 : blink;
    this.player.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && 'opacity' in mat) {
        mat.transparent = opacity < 1;
        mat.opacity = opacity;
      }
    });

    // NPCs: hidden by the fog of war unless in your line of sight.
    const boss = s.boss;
    const bossIcon =
      boss.mode === 'chase' ? '!' : boss.mode === 'patrol' || boss.mode === 'return' ? '' : '?';
    this.syncNpc(
      this.boss,
      { pos: boss.pos, facing: boss.facing, moving: boss.path.length > 0 },
      s.bossCone(),
      VisionCone.bossColor(boss.mode),
      bossIcon,
      1.55,
      dt,
      time,
    );
    s.students.forEach((st, i) => {
      const icon = st.mode === 'alarmed' ? '!' : st.detection > 0.05 ? '?' : '';
      const color = st.mode === 'alarmed' ? PALETTE.coneChase : PALETTE.coneStudent;
      this.syncNpc(
        this.students[i]!,
        { pos: st.pos, facing: st.facing, moving: st.mode === 'wander' },
        s.studentCone(st),
        color,
        icon,
        1.1,
        dt,
        time,
      );
    });

    // Interactions.
    const target = s.currentTarget;
    this.focusRing.visible = !!target;
    if (target) {
      this.focusRing.position.set(toWorld(target.pos.x), 0.04, toWorld(target.pos.y));
      const mat = this.focusRing.material as THREE.MeshBasicMaterial;
      mat.color.setHex(target.enabled ? PALETTE.focus : PALETTE.focusDisabled);
      mat.opacity = target.enabled ? 0.55 + Math.sin(time * 6) * 0.25 : 0.35;
    }
    const active = s.interaction;
    this.progress.sprite.visible = !!active;
    if (active) {
      this.progress.set(active.elapsed / active.target.duration);
      this.progress.sprite.position.set(px, 1.55, pz);
      if (active.target.kind === 'fixture' && Math.random() < dt * 30) {
        this.sparks.emit(toWorld(active.target.pos.x), 0.5, toWorld(active.target.pos.y), 2);
      }
    }
    this.sparks.update(dt);

    for (const f of s.fixtures) {
      let dial = this.recharge.get(f.id);
      if (f.rechargeLeft > 0) {
        if (!dial) {
          dial = new Dial('#90a4ae', 0.34, 'pie');
          dial.sprite.position.set(toWorld(f.pos.x), 1.05, toWorld(f.pos.y));
          this.recharge.set(f.id, dial);
          this.scene.add(dial.sprite);
        }
        dial.sprite.visible = true;
        dial.set(1 - f.rechargeLeft / f.rechargeTotal);
      } else if (dial) {
        dial.sprite.visible = false;
      }
    }

    for (const door of this.world.doors) {
      const state = s.doors.find((d) => d.id === door.id);
      const target01 = state && !state.locked ? 1 : 0;
      door.open += (target01 - door.open) * Math.min(1, dt * 5);
      door.leaf.rotation.y = -door.open * Math.PI * 0.55;
    }

    const cw = s.coworker;
    this.zzz.visible = !cw.found;
    this.zzz.position.set(
      toWorld(cw.pos.x) + 0.2,
      0.75 + Math.sin(time * 1.5) * 0.08,
      toWorld(cw.pos.y),
    );

    // Camera, cutaway, fog.
    this.iso.follow(px, pz, dt);
    this.world.walls.update(px, pz, this.iso.toCamera, this.iso.screenRight, dt);
    this.fog.update(s);

    this.renderer.render(this.scene, this.iso.camera);
  }

  private syncNpc(
    v: NpcViews,
    pose: { pos: { x: number; y: number }; facing: number; moving: boolean },
    cone: Parameters<VisionCone['update']>[2],
    coneColor: number,
    icon: '' | '!' | '?',
    iconHeight: number,
    dt: number,
    time: number,
  ) {
    const s = this.session;
    const visible = s.isVisibleToPlayer(pose.pos);
    v.actor.sync(pose, dt);
    v.actor.root.visible = visible;
    v.cone.group.visible = visible;
    if (visible) v.cone.update(s.grid, s.grid.sightCorners, cone, coneColor, 1);
    v.icon.sync(pose.pos, icon, iconHeight, time, visible || icon === '!');
    v.ghost.sync(pose.pos, visible, dt);

    // Footsteps you can hear through walls.
    const heard = !visible && s.canHear(pose.pos);
    v.heard.visible = heard;
    if (heard) {
      const pulse = (time * 1.4) % 1;
      v.heard.position.set(toWorld(pose.pos.x), 0.05, toWorld(pose.pos.y));
      v.heard.scale.setScalar(0.6 + pulse * 1.4);
      (v.heard.material as THREE.MeshBasicMaterial).opacity = (1 - pulse) * 0.6;
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.endTimer);
    this.resizeObserver.disconnect();
    this.host.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    this.input.dispose();
    this.bridge.dispose();
    this.session.events.clear();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const m of mats) {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      }
    });
    disposeModelCache();
    this.kit.dispose();
    this.fog.dispose();
    this.world.floorTexture.dispose();
    this.world.lightMap.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    const w = window as unknown as { __copper?: { engine?: unknown } };
    if (w.__copper?.engine === this) delete w.__copper;
  }
}
