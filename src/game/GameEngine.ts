import { TILE_SIZE } from '@core/content/balance';
import { CHARACTERS } from '@core/content/characters';
import { ShiftSession } from '@core/session/ShiftSession';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { bagTotal } from '@core/systems/bag';
import { bossLine, custodianLine } from '@state/messages';
import { useShiftStore } from '@state/shiftStore';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { connectSession, type SessionBridge } from './bridge';
import { InputController } from './input/InputController';
import {
  ActorView,
  LastSeenGhost,
  StatusIcon,
  type ActorPose,
  type Footfall,
  type IconKind,
} from './render/actors';
import { toWorld } from './render/coords';
import { FogOfWar } from './render/fogOfWar';
import { IsoCamera } from './render/isoCamera';
import {
  Dial,
  DustPuffs,
  floorRing,
  PopFx,
  Sparks,
  SpeechBubble,
  textSprite,
} from './render/markers';
import { createWorldShading, MaterialKit } from './render/materials';
import {
  buildBoss,
  buildCustodian,
  buildStudent,
  buildTeacher,
  buildWorker,
  disposeModelCache,
  disposeTextureCache,
} from './render/models';
import { PALETTE, STUDENT_SHIRTS } from './render/palette';
import { QualityGovernor } from './render/quality';
import { WetFloors } from './render/wetFloors';
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
  bubble: SpeechBubble;
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
  private readonly teachers: NpcViews[];
  private readonly custodian: NpcViews | null;
  private readonly wetFloors: WetFloors;
  /** Seconds until the custodian next mutters something while he mops. */
  private chatter = 12;
  /** Cycles through each speaker's lines so they don't repeat the same one. */
  private remarks = 0;
  private readonly focusRing = floorRing(0.5, 0.6, PALETTE.focus);
  private readonly progress = new Dial('#ffb74d');
  private readonly recharge = new Map<string, Dial>();
  private readonly zzz = textSprite('z Z z', '#d1c4e9', 0.45, '#311b92');
  private readonly sparks = new Sparks();
  private readonly dust = new DustPuffs();
  private readonly pops = new PopFx();
  private readonly envMap: THREE.Texture;
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private last = performance.now();
  private readonly quality = new QualityGovernor(window.devicePixelRatio);
  private accumulator = 0;
  private pendingAbility = false;
  private pendingUse: string | null = null;
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
    this.renderer.setPixelRatio(this.quality.current.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(PALETTE.background);
    // Soft studio reflections so metal, chrome and glass read as shiny.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.5;

    const shading = createWorldShading(level.cols, level.rows);
    this.kit = new MaterialKit(shading);
    this.world = buildWorld(this.scene, this.session, this.kit);
    this.fog = new FogOfWar(level.cols, level.rows, this.session.explored);
    shading.uLightMap.value = this.world.lightMap;
    shading.uFogMap.value = this.fog.texture;

    const character = CHARACTERS.get(this.session.character.id);
    this.player = new ActorView(buildWorker(this.kit, character.color), this.scene);
    this.boss = this.npcViews(
      new ActorView(buildBoss(this.kit), this.scene),
      PALETTE.ghostBoss,
      1.25,
    );
    this.students = this.session.students.map((st, i) =>
      this.npcViews(
        new ActorView(
          buildStudent(this.kit, STUDENT_SHIRTS[i % STUDENT_SHIRTS.length]!, st.personality.look),
          this.scene,
        ),
        PALETTE.ghostStudent,
        0.85,
      ),
    );
    this.custodian = this.session.custodian
      ? this.npcViews(
          new ActorView(buildCustodian(this.kit), this.scene),
          PALETTE.ghostCustodian,
          1.3,
        )
      : null;
    this.wetFloors = new WetFloors(this.kit);
    this.scene.add(this.wetFloors.group);
    this.teachers = this.session.teachers.map((t) =>
      this.npcViews(
        new ActorView(buildTeacher(this.kit, t.def), this.scene),
        PALETTE.ghostTeacher,
        1.2,
      ),
    );

    this.scene.add(
      this.focusRing,
      this.progress.sprite,
      this.zzz,
      this.sparks.points,
      this.dust.group,
      this.pops.group,
    );
    this.listenForGadgets();
    this.listenForSpeech();

    this.bridge = connectSession(this.session, (summary) => {
      this.endTimer = window.setTimeout(() => params.onEnd(summary), END_DELAY_MS);
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
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
    const bubble = new SpeechBubble();
    this.scene.add(heard, bubble.sprite);
    return {
      actor,
      icon: new StatusIcon(this.scene),
      ghost: new LastSeenGhost(this.scene, ghostColor, height),
      cone,
      heard,
      bubble,
    };
  }

  /** Speech bubbles: Mr. Gravy thinking out loud, teachers on the radio, students tattling. */
  private listenForSpeech() {
    const events = this.session.events;
    const n = () => this.remarks++;
    events.on('boss:remark', ({ remark, detail }) => {
      this.boss.bubble.say(
        bossLine(remark, detail, n()),
        remark === 'spotted' ? '#c62828' : undefined,
      );
    });
    events.on('teacher:report', ({ teacherId }) => {
      const i = this.session.teachers.findIndex((t) => t.id === teacherId);
      const lines = ['Mr. Gravy! Come quick!', 'I see you!', 'Stay right there!'];
      this.teachers[i]?.bubble.say(lines[n() % lines.length]!, '#6a1b9a');
    });
    events.on('student:alert', ({ studentId }) => {
      const i = this.session.students.findIndex((st) => st.id === studentId);
      const lines = ['MR. GRAVYYY!', "I'm telling!", 'Ooooh, busted!'];
      this.students[i]?.bubble.say(lines[n() % lines.length]!, '#c62828');
    });
    events.on('custodian:inspecting', () => {
      this.custodian?.bubble.say(custodianLine('inspecting', n()), '#33691e');
    });
    events.on('custodian:shrug', () => {
      this.custodian?.bubble.say(custodianLine('shrug', n()), '#33691e');
    });
    events.on('custodian:report', ({ about }) => {
      const line = custodianLine(about === 'player' ? 'reportPlayer' : 'reportFixture', n());
      this.custodian?.bubble.say(line, '#c62828');
    });
    events.on('player:squeak', ({ pos }) => {
      this.pops.pop('SQUEAK!', '#b3e5fc', 0x81d4fa, toWorld(pos.x), toWorld(pos.y));
    });
    events.on('student:laughed', ({ studentId }) => {
      const i = this.session.students.findIndex((st) => st.id === studentId);
      this.students[i]?.bubble.say('HA HA HA!', '#ef6c00');
    });
  }

  /** Comic feedback for gadgets: a "PFFT!" where the cushion lands, a "GLUG!", a "SNIP!". */
  private listenForGadgets() {
    const events = this.session.events;
    events.on('noise:made', ({ pos }) => {
      this.pops.pop('PFFT!', '#c5e1a5', 0x9ccc65, toWorld(pos.x), toWorld(pos.y));
    });
    // How a pull went, over the fixture.
    events.on('scrap:collected', ({ fixtureId, quality }) => {
      const f = this.session.fixtures.find((x) => x.id === fixtureId);
      if (!f || quality === 'clean') return;
      const x = toWorld(f.pos.x);
      const z = toWorld(f.pos.y);
      if (quality === 'botched') this.pops.pop('BOTCHED', '#ef9a9a', 0xef5350, x, z);
      else if (quality === 'bonus') {
        this.pops.pop('BONUS!', '#ffe082', 0xffca28, x, z);
        this.sparks.emit(x, 0.7, z, 18);
      } else this.pops.pop('ROUGH', '#cfd8dc', 0x90a4ae, x, z);
    });
    events.on('gadget:used', ({ id, pos }) => {
      const x = toWorld(pos.x);
      const z = toWorld(pos.y);
      if (id === 'energy-drink') this.pops.pop('GLUG!', '#80deea', 0x4dd0e1, x, z);
      if (id === 'bolt-cutters') {
        this.pops.pop('SNIP!', '#ffcc80', 0xffb74d, x, z);
        this.sparks.emit(x, 0.6, z, 14);
      }
    });
  }

  /** Dynamic quality: render less when the device can't keep up (see QualityGovernor). */
  private applyQuality() {
    const q = this.quality.current;
    this.renderer.setPixelRatio(q.ratio);
    this.scene.environment = q.reflections ? this.envMap : null;
    this.world.setShadows(q.shadows);
    this.resize();
  }

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
    const raw = (now - this.last) / 1000;
    const dt = Math.min(0.25, raw);
    this.last = now;
    if (this.quality.sample(raw) !== null) this.applyQuality();

    const store = useShiftStore.getState();
    if (this.input.pausePressed() && this.session.status === 'running') store.togglePause();
    if (!useShiftStore.getState().paused) {
      const input = this.input.read(this.iso);
      // One-shot actions wait for the next simulation step (a fast display can draw a frame
      // without stepping), then fire exactly once.
      this.pendingAbility ||= input.ability;
      this.pendingUse = input.use ?? this.pendingUse;
      this.accumulator = Math.min(this.accumulator + dt, STEP * MAX_STEPS_PER_FRAME);
      while (this.accumulator >= STEP) {
        this.session.tick(STEP, { ...input, ability: this.pendingAbility, use: this.pendingUse });
        this.pendingAbility = false;
        this.pendingUse = null;
        this.accumulator -= STEP;
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
    this.kickUpDust(
      this.player.sync(
        {
          pos: p.pos,
          facing: p.facing,
          running: p.sprinting,
          working: !!s.interaction,
        },
        dt,
      ),
    );
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
    const bossIcon: IconKind =
      boss.mode === 'chase' ? '!' : boss.mode === 'patrol' || boss.mode === 'inspect' ? '' : '?';
    this.syncNpc(
      this.boss,
      { pos: boss.pos, facing: boss.facing, running: boss.mode === 'chase' },
      s.bossCone(),
      VisionCone.bossColor(boss.mode),
      bossIcon,
      1.55,
      dt,
      time,
    );
    s.students.forEach((st, i) => {
      const asleep = st.mode === 'asleep';
      const icon: IconKind =
        st.mode === 'alarmed' ? '!' : asleep ? 'z' : st.detection > 0.05 ? '?' : '';
      const color = st.mode === 'alarmed' ? PALETTE.coneChase : PALETTE.coneStudent;
      this.syncNpc(
        this.students[i]!,
        { pos: st.pos, facing: st.facing, crouching: asleep },
        s.studentCone(st),
        color,
        icon,
        1.1,
        dt,
        time,
      );
    });
    s.teachers.forEach((t, i) => {
      const icon: IconKind =
        t.mode === 'confront' ? '!' : t.mode === 'suspicious' || t.detection > 0.05 ? '?' : '';
      const color = t.mode === 'confront' ? PALETTE.coneChase : PALETTE.coneTeacher;
      this.syncNpc(
        this.teachers[i]!,
        { pos: t.pos, facing: t.facing },
        s.teacherCone(t),
        color,
        icon,
        1.5,
        dt,
        time,
      );
    });

    const c = s.custodian;
    if (c && this.custodian) {
      const icon: IconKind =
        c.mode === 'radio' ? '!' : c.mode === 'suspicious' || c.mode === 'inspect' ? '?' : '';
      this.syncNpc(
        this.custodian,
        {
          pos: c.pos,
          facing: c.facing,
          crouching: c.mode === 'inspect',
          working: c.mode === 'mop',
        },
        s.custodianCone(c),
        c.mode === 'radio' ? PALETTE.coneChase : PALETTE.coneCustodian,
        icon,
        1.45,
        dt,
        time,
      );
      // He hums and grumbles to himself while he works.
      this.chatter -= dt;
      if (this.chatter <= 0) {
        this.chatter = 18 + Math.random() * 14;
        if (c.mode === 'mop')
          this.custodian.bubble.say(custodianLine('mopping', this.remarks++), '#33691e');
      }
    }
    this.wetFloors.update(s);

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
    this.dust.update(dt);
    this.pops.update(dt);
    // Energy drink: a fizzy trail while it lasts.
    if (p.boost > 0 && p.moving && Math.random() < dt * 20) this.dust.emit(px, pz, 0.3, 0x80deea);

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

    // Camera, cutaway, shadows, fog.
    this.iso.follow(px, pz, dt);
    this.world.update(px, pz, time);
    this.world.walls.update(px, pz, this.iso.toCamera, this.iso.screenRight, dt);
    this.fog.update(s);

    this.renderer.render(this.scene, this.iso.camera);
  }

  /** Running feet kick up dust (only where you can see it). */
  private kickUpDust(footfalls: Footfall[]) {
    for (const f of footfalls) {
      if (f.run < 0.4) continue;
      if (!this.session.isVisibleToPlayer({ x: f.x * TILE_SIZE, y: f.z * TILE_SIZE })) continue;
      this.dust.emit(f.x, f.z, f.run);
    }
  }

  private syncNpc(
    v: NpcViews,
    pose: ActorPose,
    cone: Parameters<VisionCone['update']>[2],
    coneColor: number,
    icon: IconKind,
    iconHeight: number,
    dt: number,
    time: number,
  ) {
    const s = this.session;
    const visible = s.isVisibleToPlayer(pose.pos);
    const footfalls = v.actor.sync(pose, dt);
    if (visible) this.kickUpDust(footfalls);
    v.actor.root.visible = visible;
    v.cone.group.visible = visible && cone.range > 0;
    if (visible && cone.range > 0) v.cone.update(s.grid, s.grid.sightCorners, cone, coneColor, 1);
    // You hear what they say if you can see them or they're close enough to hear.
    v.bubble.update(
      toWorld(pose.pos.x),
      iconHeight + 0.45,
      toWorld(pose.pos.y),
      dt,
      visible || s.canHear(pose.pos),
    );
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
    disposeTextureCache();
    this.envMap.dispose();
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
