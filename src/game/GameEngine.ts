import { TILE_SIZE } from '@core/content/balance';
import { CHARACTERS } from '@core/content/characters';
import type { Vec2 } from '@core/model/types';
import { ShiftSession } from '@core/session/ShiftSession';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { bagTotal } from '@core/systems/bag';
import { displayRate } from '@state/displayRate';
import { bossLine, custodianLine } from '@state/messages';
import { useSettings, type ViewMode } from '@state/settingsStore';
import { useShiftStore } from '@state/shiftStore';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { connectSession, type SessionBridge } from './bridge';
import { InputController } from './input/InputController';
import { LookController } from './input/LookController';
import {
  ActorView,
  LastSeenGhost,
  StatusIcon,
  type ActorPose,
  type Footfall,
  type IconKind,
} from './render/actors';
import { toWorld } from './render/coords';
import { FirstPersonCamera } from './render/firstPersonCamera';
import { FloorMirror } from './render/floorMirror';
import { FogOfWar } from './render/fogOfWar';
import { Hands } from './render/hands';
import { IsoCamera } from './render/isoCamera';
import { eyeAdaptation, LOOKS, type ViewLook } from './render/looks';
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
import { TileVisibility } from './render/occlusion';
import { PALETTE, STUDENT_SHIRTS } from './render/palette';
import { PostFX } from './render/post/PostFX';
import { isSoftwareRenderer, QualityGovernor, type Settled } from './render/quality';
import { ThreatRing, type Threat } from './render/threats';
import { WetFloors } from './render/wetFloors';
import { VisionCone } from './render/visionCones';
import { buildWorld, type World } from './render/world';

export interface EngineParams {
  config: ShiftConfig;
  onEnd(summary: ShiftSummary): void;
  /** A shift already under way, for an engine that takes over from another (see GameView). */
  session?: ShiftSession;
  /**
   * The browser took the graphics context away (phones do, from pages left in the background),
   * so this engine has drawn its last frame. The shift itself is untouched.
   */
  onContextLost?(): void;
}

/** Where the last shift's quality ended up (this page load), for the next one to start near. */
let lastQuality: Settled | null = null;

/** Fixed simulation step: deterministic and frame-rate independent. */
const STEP = 1 / 60;
/**
 * Paused, the world stands still, so it's redrawn only this often: enough to follow a turned
 * phone or a change of camera from the pause menu, and it lets a phone cool down.
 */
const PAUSED_FRAME_MS = 250;
/** Cap catch-up work after a stall (spiral-of-death guard). */
const MAX_STEPS_PER_FRAME = 8;
/** Pause before handing the summary to React so the end-of-shift banner can be read. */
const END_DELAY_MS = 1800;
/** How fast the arrow keys turn your head in first person, radians per second. */
const TURN_RATE = 2.6;
/** In first person the sun's shadows are centred this far ahead of you, tiles. */
const SHADOW_LEAD = 8;
/** How far first person looks for things to draw, pixels. */
const VIEW_RANGE = TILE_SIZE * 90;

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
 * the ShiftSession and draws whatever the session says, through either camera: the fixed
 * top-down diorama or the worker's own eyes. No game rules live here.
 */
export class GameEngine {
  readonly session: ShiftSession;
  private readonly renderer: THREE.WebGLRenderer;
  /** Post-processing chain; null where the device can't render to floating-point targets. */
  private readonly post: PostFX | null;
  /** The grade in use: each view has its own. */
  private look: ViewLook = { ...LOOKS.iso };
  /** Draws what the floor reflects. */
  private readonly mirror = new FloorMirror();
  private readonly scene = new THREE.Scene();
  private readonly iso = new IsoCamera();
  private readonly eyes = new FirstPersonCamera();
  /** First person: your own hands, and who's noticing you from where. */
  private readonly hands: Hands;
  private readonly threats = new ThreatRing();
  /** How fast the view is turning this frame, radians per second. */
  private turning = { x: 0, y: 0 };
  private readonly mouse: LookController;
  /** Tiles the eyes could see, for skipping scenery behind walls in first person. */
  private readonly seen: TileVisibility;
  private mode: ViewMode = 'iso';
  private readonly unwatchSettings: () => void;
  /** The mouse was ours when the game paused: take it back on resume. */
  private recapture = false;
  /** Where the worker was one simulation step ago (the eyes glide between steps). */
  private stepFrom: Vec2;
  /** 0..1: eased "you are being chased", for the red pulse at the edge of the screen. */
  private danger = 0;
  /** Exposure multiplier, easing toward what the light where you stand calls for. */
  private adapted = 1;
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
  private readonly quality: QualityGovernor;
  private accumulator = 0;
  private pendingAbility = false;
  private pendingUse: string | null = null;
  private endTimer: number | undefined;
  private destroyed = false;
  /** The graphics context is gone: nothing more can be drawn through this renderer. */
  private lost = false;
  /** When the last frame was drawn (ms, the loop's clock). */
  private drawnAt = -Infinity;
  /** The host changed size since the canvas was last fitted to it. */
  private resizePending = false;
  /** What the canvas was last fitted to (CSS pixels and pixel ratio). */
  private fitted = { w: 0, h: 0, ratio: 0 };
  private readonly contextLost: (() => void) | undefined;

  constructor(
    private readonly host: HTMLElement,
    params: EngineParams,
  ) {
    this.session = params.session ?? new ShiftSession(params.config);
    this.contextLost = params.onContextLost;
    const { level } = this.session;
    this.stepFrom = { ...this.session.player.pos };

    this.renderer = new THREE.WebGLRenderer({
      // The scene is drawn into the post chain's own targets and smoothed there (FXAA); a
      // multisampled canvas would only hold a full-screen copy, at four times the memory.
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.quality = new QualityGovernor(window.devicePixelRatio, {
      software: isSoftwareRenderer(this.renderer.getContext()),
      last: lastQuality,
      displayHz: displayRate.hz,
    });
    this.renderer.setPixelRatio(this.quality.current.ratio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);
    this.post = PostFX.supported(this.renderer) ? new PostFX(this.renderer) : null;
    this.scene.background = new THREE.Color(PALETTE.background);
    // Soft studio reflections so metal, chrome and glass read as shiny.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const studio = new RoomEnvironment();
    this.envMap = pmrem.fromScene(studio, 0.04).texture;
    studio.dispose();
    pmrem.dispose();
    this.scene.environment = this.envMap;

    const shading = createWorldShading(level.cols, level.rows);
    this.kit = new MaterialKit(shading);
    this.world = buildWorld(this.scene, this.session, this.kit, this.renderer);
    this.fog = new FogOfWar(level.cols, level.rows, this.session.explored);
    shading.uFogMap.value = this.fog.texture;
    this.mirror.hide(...this.world.underfoot);
    this.seen = new TileVisibility(this.session.grid);
    // An unlocked door lets the light through, and you can see past it.
    this.session.events.on('door:unlocked', () => {
      this.world.lights.bake();
      this.seen.invalidate();
      this.fog.invalidate();
    });

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

    // What's held in front of the eyes rides on their camera.
    this.hands = new Hands(this.kit, character.color);
    this.eyes.camera.add(this.hands.root, this.threats.group);
    this.scene.add(this.eyes.camera);
    // World matrices are brought up to date by hand, once a frame (see draw). Left to itself
    // three redoes every one of them for each pass that draws the scene (the mirror, then the
    // view), the merged scenery that never moves included.
    this.scene.matrixAutoUpdate = false;
    this.scene.matrixWorldAutoUpdate = false;
    this.mouse = new LookController(this.renderer.domElement, () => {
      // Esc freed the mouse; the browser kept the key press to itself, so pause here.
      this.recapture = true;
      if (this.session.status === 'running') useShiftStore.getState().setPaused(true);
    });
    this.setView(useSettings.getState().view);
    this.unwatchSettings = useSettings.subscribe((settings) => {
      if (settings.view !== this.mode) this.setView(settings.view);
    });

    // Only noted here and applied in the loop: resizing a canvas blanks it, so it has to happen
    // just before a frame is drawn (never after one), and a burst of these, as a phone turns,
    // should cost one reallocation of every render target rather than one each.
    this.resizeObserver = new ResizeObserver(() => {
      this.resizePending = true;
    });
    this.resizeObserver.observe(host);
    this.applyQuality();
    // Anything that takes the player's eyes off the game pauses it. A phone going to the home
    // screen, another app or the lock screen hides the page without ever blurring the window.
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);

    if (debugHooksEnabled()) {
      (window as unknown as { __copper?: unknown }).__copper = {
        session: this.session,
        engine: this,
        view: () => ({ mode: this.mode, yaw: this.eyes.yaw, pitch: this.eyes.pitch }),
        /** Hold the renderer at one quality level (0 is best) instead of adapting. */
        quality: (level: number) => {
          this.quality.pin(level);
          this.applyQuality();
        },
      };
    }

    this.iso.follow(
      toWorld(this.session.player.pos.x),
      toWorld(this.session.player.pos.y),
      0,
      true,
    );
    // The world took a while to build; the first frame's time starts now, not back then.
    this.last = performance.now();
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

  /** Switch between the top-down diorama and the worker's own eyes. */
  private setView(mode: ViewMode) {
    this.mode = mode;
    const firstPerson = mode === 'fps';
    this.look = { ...LOOKS[mode] };
    this.world.setFirstPerson(firstPerson);
    this.seen.invalidate();
    if (!firstPerson) this.world.cull(null);
    this.mouse.setEnabled(firstPerson);
    if (firstPerson) this.eyes.face(this.session.player.facing);
    this.hands.root.visible = firstPerson;
    this.threats.group.visible = firstPerson;
    // You don't see your own body from behind your own eyes, but it still casts its shadow.
    this.showBody(!firstPerson);
    // Show the new view at once, even from the pause menu.
    this.drawnAt = -Infinity;
  }

  /** Draw the worker's body, or leave only its shadow. */
  private showBody(visible: boolean) {
    this.player.root.traverse((o) => {
      const material = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!material) return;
      material.colorWrite = visible;
      material.depthWrite = visible;
    });
  }

  /** In first person, could someone standing there be seen? (Any tile they overlap is in view.) */
  private inSight(pos: Vec2): boolean {
    const x = toWorld(pos.x);
    const z = toWorld(pos.y);
    return this.seen.anyIn(x - 0.3, z - 0.3, x + 0.3, z + 0.3);
  }

  /** The pause menu and the end of the shift need the mouse back; take it again afterwards. */
  private shareMouse(needed: boolean) {
    if (needed) {
      if (this.mouse.locked) {
        this.recapture = true;
        this.mouse.release();
      }
    } else if (this.recapture) {
      this.recapture = false;
      this.mouse.capture();
    }
  }

  /** Dynamic quality: render less when the device can't keep up (see QualityGovernor). */
  private applyQuality() {
    const q = this.quality.current;
    this.renderer.setPixelRatio(q.ratio);
    this.scene.environment = q.reflections ? this.envMap : null;
    this.world.setShadows(q.shadows);
    if (q.effects !== 0) this.post?.setLevel(q.effects);
    this.resize();
  }

  private onBlur = () => {
    if (this.session.status === 'running') useShiftStore.getState().setPaused(true);
  };

  private onVisibility = () => {
    if (document.hidden) this.onBlur();
  };

  private onContextLost = () => {
    this.lost = true;
    this.onBlur();
    this.contextLost?.();
  };

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    const ratio = this.renderer.getPixelRatio();
    if (w === this.fitted.w && h === this.fitted.h && ratio === this.fitted.ratio) return;
    this.fitted = { w, h, ratio };
    this.renderer.setSize(w, h);
    this.iso.resize(w, h);
    this.eyes.resize(w, h);
    const buffer = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.post?.setSize(buffer.x, buffer.y);
    this.mirror.setSize(buffer.x, buffer.y);
    // A resized canvas is blank until it's drawn again, paused or not.
    this.drawnAt = -Infinity;
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this.loop);
    const raw = (now - this.last) / 1000;
    const dt = Math.min(0.25, raw);
    this.last = now;

    const store = useShiftStore.getState();
    const running = this.session.status === 'running';
    if (this.input.pausePressed() && running) store.togglePause();
    if (this.input.viewPressed() && running) useSettings.getState().toggleView();
    const paused = useShiftStore.getState().paused;
    const firstPerson = this.mode === 'fps';
    this.shareMouse(paused || !running);
    // Always drained, so a drag made while paused doesn't spin you round on resume.
    const turned = this.mouse.take();
    this.turning = { x: 0, y: 0 };
    if (!paused) {
      if (firstPerson && running) {
        const dx = turned.x + this.input.turn() * TURN_RATE * dt;
        this.eyes.turn(dx, turned.y);
        if (dt > 0) this.turning = { x: dx / dt, y: turned.y / dt };
      }
      const input = this.input.read(firstPerson ? this.eyes.basis : this.iso, firstPerson);
      // Where you look is where you face, throw and reach.
      if (firstPerson) input.aim = this.eyes.yaw;
      // One-shot actions wait for the next simulation step (a fast display can draw a frame
      // without stepping), then fire exactly once.
      this.pendingAbility ||= input.ability;
      this.pendingUse = input.use ?? this.pendingUse;
      this.accumulator = Math.min(this.accumulator + dt, STEP * MAX_STEPS_PER_FRAME);
      while (this.accumulator >= STEP) {
        this.stepFrom = { ...this.session.player.pos };
        this.session.tick(STEP, { ...input, ability: this.pendingAbility, use: this.pendingUse });
        this.pendingAbility = false;
        this.pendingUse = null;
        this.accumulator -= STEP;
      }
    }

    if (this.resizePending) {
      this.resizePending = false;
      this.resize();
    }
    const idle = paused && running;
    // Paused frames cost next to nothing, so they show what rate the screen is really being
    // refreshed at (it changes: Low Power Mode, a phone running hot).
    if (idle) displayRate.sample(raw * 1000);
    this.quality.setDisplayRate(displayRate.hz);
    // Only frames that were drawn for play say how well the device is keeping up.
    if (!idle && !this.lost && this.quality.sample(raw) !== null) this.applyQuality();
    const sinceDrawn = now - this.drawnAt;
    if (!this.lost && (!idle || sinceDrawn >= PAUSED_FRAME_MS)) {
      this.draw(idle ? Math.min(0.25, sinceDrawn / 1000) : dt, now / 1000);
      this.drawnAt = now;
    }
    this.bridge.publish(now);
  };

  private draw(dt: number, time: number) {
    const s = this.session;
    const p = s.player;
    const px = toWorld(p.pos.x);
    const pz = toWorld(p.pos.y);
    const firstPerson = this.mode === 'fps';

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
      // Over the worker's head; from behind their eyes, over what they're working on.
      if (firstPerson) {
        this.progress.sprite.position.set(
          toWorld(active.target.pos.x),
          1.05,
          toWorld(active.target.pos.y),
        );
      } else this.progress.sprite.position.set(px, 1.55, pz);
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
    this.iso.follow(px, pz, dt, firstPerson);
    if (firstPerson) {
      // Glide between simulation steps (unless the worker was just escorted somewhere else).
      const alpha = Math.min(1, this.accumulator / STEP);
      const jumped = Math.hypot(p.pos.x - this.stepFrom.x, p.pos.y - this.stepFrom.y) > TILE_SIZE;
      const from = jumped ? p.pos : this.stepFrom;
      const forward = this.eyes.basis.screenUp;
      const right = this.eyes.basis.screenRight;
      const walkSpeed = Math.max(1, Math.hypot(p.vel.x, p.vel.y));
      this.eyes.update(
        toWorld(from.x + (p.pos.x - from.x) * alpha),
        toWorld(from.y + (p.pos.y - from.y) * alpha),
        dt,
        {
          sprinting: p.sprinting,
          strafe: p.moving ? (p.vel.x * right.x + p.vel.y * right.y) / walkSpeed : 0,
        },
      );
      this.hands.update({
        ...this.eyes.gait,
        working: !!active,
        turnX: this.turning.x,
        turnY: this.turning.y,
        time,
        dt,
      });
      const noticing: Threat[] = [
        { pos: boss.pos, level: boss.detection, alarmed: boss.mode === 'chase' },
        ...s.students.map((st) => ({
          pos: st.pos,
          level: st.detection,
          alarmed: st.mode === 'alarmed',
        })),
        ...s.teachers.map((t) => ({
          pos: t.pos,
          level: t.detection,
          alarmed: t.mode === 'confront',
        })),
      ];
      if (c) noticing.push({ pos: c.pos, level: c.detection, alarmed: c.mode === 'radio' });
      this.threats.update(p.pos, this.eyes.yaw, s.status === 'running' ? noticing : [], time);
      // Shadows where you're looking, not behind you.
      this.world.update(px + forward.x * SHADOW_LEAD, pz + forward.y * SHADOW_LEAD, time);
      if (this.seen.update(p.pos, VIEW_RANGE)) this.world.cull(this.seen);
    } else {
      this.world.update(px, pz, time);
      this.fog.update(s);
    }
    this.world.walls.update(px, pz, this.iso.toCamera, this.iso.screenRight, dt, !firstPerson);

    const chased = s.status === 'running' && boss.mode === 'chase' ? 1 : 0;
    this.danger += (chased - this.danger) * Math.min(1, dt * 4);
    // Eyes take a moment to adjust to a darker or brighter room.
    const adaptTo = eyeAdaptation(s.playerLight, this.look.adaptation);
    this.adapted += (adaptTo - this.adapted) * Math.min(1, dt * 1.6);
    const camera = firstPerson ? this.eyes.camera : this.iso.camera;
    const { effects, mirror } = this.quality.current;
    // Everything is where it will be drawn: one pass over the scene's matrices for all passes.
    this.scene.updateMatrixWorld();
    if (this.post && mirror) {
      // The floor's reflection, drawn first. It's the one place you see yourself in first person.
      if (firstPerson) this.showBody(true);
      this.mirror.render(this.renderer, this.scene, camera);
      if (firstPerson) this.showBody(false);
      this.world.reflect(this.mirror.texture, this.mirror.matrix, this.look.mirror);
      // That pass drew this frame's shadows already.
      this.renderer.shadowMap.autoUpdate = false;
    } else this.world.reflect(null, this.mirror.matrix, 0);
    if (this.post && effects > 0) {
      const pulse = this.danger * (0.2 + 0.1 * Math.sin(time * 7));
      const exposure = this.look.exposure * this.adapted;
      this.post.render(this.scene, camera, this.look, time, pulse, exposure);
    } else {
      this.renderer.toneMappingExposure = this.look.exposure * this.adapted;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, camera);
    }
    this.renderer.shadowMap.autoUpdate = true;
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
    // Top-down, the fog of war hides whoever is out of sight. In first person walls do that
    // already; the check only saves drawing people who are behind one.
    const visible = this.mode === 'fps' ? this.inSight(pose.pos) : s.isVisibleToPlayer(pose.pos);
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
    lastQuality = this.quality.settled ?? lastQuality;
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.endTimer);
    this.resizeObserver.disconnect();
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.unwatchSettings();
    this.mouse.dispose();
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
    this.post?.dispose();
    this.mirror.dispose();
    this.threats.dispose();
    this.world.dispose();
    // Hand the context and its memory back now rather than whenever the canvas is garbage
    // collected: every shift makes a new one, and a phone allows only a few at a time. (Disposed
    // first, so three isn't listening for a loss it would try to recover from; shrunk, because
    // that is what releases the drawing buffer at once.)
    const canvas = this.renderer.domElement;
    this.renderer.dispose();
    canvas.width = 1;
    canvas.height = 1;
    if (!this.renderer.getContext().isContextLost()) this.renderer.forceContextLoss();
    canvas.remove();
    const w = window as unknown as { __copper?: { engine?: unknown } };
    if (w.__copper?.engine === this) delete w.__copper;
  }
}
