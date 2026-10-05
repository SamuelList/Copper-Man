import { TILE_SIZE } from '@core/content/balance';
import { ShiftSession } from '@core/session/ShiftSession';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { useShiftStore } from '@state/shiftStore';
import Phaser from 'phaser';
import { connectSession, type SessionBridge } from '../bridge';
import { NpcView } from '../entities/NpcView';
import { InteractionOverlay, VisionLayer } from '../entities/Overlays';
import { PlayerView } from '../entities/PlayerView';
import { CoworkerView, createVanView, DoorView, FixtureView } from '../entities/PropViews';
import { InputController } from '../input/InputController';
import { ASSETS, TEX_SCALE } from '../render/assetManifest';
import { DEPTH } from '../render/depth';
import { buildTileData } from '../render/tilemap';
import { TILESET_MARGIN, TILESET_SPACING } from '../render/textures';
import { SCENE_KEYS } from './BootScene';

export interface ShiftSceneParams {
  config: ShiftConfig;
  onEnd(summary: ShiftSummary): void;
}

export const PARAMS_KEY = 'shiftParams';

/** Pause before handing the summary to React so the end-of-shift banner can be read. */
const END_DELAY_MS = 1800;

/** Fixed simulation step: deterministic and frame-rate independent. */
const STEP = 1 / 60;
/** Cap catch-up work after a stall (spiral-of-death guard). */
const MAX_STEPS_PER_FRAME = 8;

/** `?debug` exposes the live session on `window.__copper` for e2e tests and tinkering. */
const debugHooksEnabled = () =>
  import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');

const STUDENT_TINTS = [0xffffff, 0xff8a80, 0x80d8ff, 0xb9f6ca, 0xffd180, 0xea80fc, 0xccff90];

/**
 * Thin adapter: feeds input + time into the ShiftSession and draws whatever it says.
 * No game rules live here.
 */
export class ShiftScene extends Phaser.Scene {
  private session!: ShiftSession;
  private bridge!: SessionBridge;
  private controls!: InputController;
  private player!: PlayerView;
  private boss!: NpcView;
  private students: NpcView[] = [];
  private fixtures: FixtureView[] = [];
  private doors: DoorView[] = [];
  private coworker!: CoworkerView;
  private vision!: VisionLayer;
  private overlay!: InteractionOverlay;
  private endTimer: Phaser.Time.TimerEvent | null = null;
  private accumulator = 0;

  constructor() {
    super(SCENE_KEYS.shift);
  }

  create() {
    const params = this.registry.get(PARAMS_KEY) as ShiftSceneParams;
    const session = new ShiftSession(params.config);
    this.session = session;

    this.buildMap();
    createVanView(this, session);
    this.fixtures = session.fixtures.map((f) => new FixtureView(this, f));
    this.doors = session.doors.map((d) => new DoorView(this, d));
    this.coworker = new CoworkerView(this, session.coworker);
    this.vision = new VisionLayer(this);
    this.overlay = new InteractionOverlay(this);
    this.students = session.students.map(
      (_, i) => new NpcView(this, ASSETS.student.key, STUDENT_TINTS[i % STUDENT_TINTS.length]),
    );
    this.boss = new NpcView(this, ASSETS.boss.key);
    this.player = new PlayerView(this, session.character.id);
    this.controls = new InputController(this);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, session.level.cols * TILE_SIZE, session.level.rows * TILE_SIZE);
    cam.startFollow(this.player.sprite, false, 0.12, 0.12);
    this.fitZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitZoom, this);

    this.bridge = connectSession(session, (summary) => {
      this.endTimer = this.time.delayedCall(END_DELAY_MS, () => params.onEnd(summary));
    });

    const pauseOnBlur = () => {
      if (this.session.status === 'running') useShiftStore.getState().setPaused(true);
    };
    this.game.events.on(Phaser.Core.Events.BLUR, pauseOnBlur);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bridge.dispose();
      this.endTimer?.remove();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitZoom, this);
      this.game.events.off(Phaser.Core.Events.BLUR, pauseOnBlur);
      this.session.events.clear();
    });

    if (debugHooksEnabled()) {
      (window as unknown as { __copper?: unknown }).__copper = { session, scene: this };
    }

    this.sync(0);
  }

  private buildMap() {
    const { level } = this.session;
    const texSize = TILE_SIZE * TEX_SCALE;
    const map = this.make.tilemap({
      data: buildTileData(level),
      tileWidth: texSize,
      tileHeight: texSize,
    });
    const tileset = map.addTilesetImage(
      ASSETS.tiles.key,
      ASSETS.tiles.key,
      texSize,
      texSize,
      TILESET_MARGIN,
      TILESET_SPACING,
    );
    if (!tileset) throw new Error('Failed to create tileset');
    map
      .createLayer(0, tileset, 0, 0)
      ?.setScale(1 / TEX_SCALE)
      .setDepth(DEPTH.floor);

    for (const room of level.rooms) {
      if (room.kind === 'hallway' || room.kind === 'exterior') continue;
      this.add
        .text(
          (room.rect.col + room.rect.w / 2) * TILE_SIZE,
          (room.rect.row + room.rect.h / 2) * TILE_SIZE,
          room.name.toUpperCase(),
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '28px',
            fontStyle: 'bold',
            color: '#000000',
          },
        )
        .setOrigin(0.5)
        .setScale(0.5)
        .setAlpha(0.18)
        .setDepth(DEPTH.roomLabel);
    }
  }

  private fitZoom() {
    const { width, height } = this.scale.gameSize;
    const zoom = Phaser.Math.Clamp(
      Math.min(width / (TILE_SIZE * 26), height / (TILE_SIZE * 15)),
      0.75,
      3,
    );
    this.cameras.main.setZoom(zoom);
  }

  override update(time: number) {
    const store = useShiftStore.getState();
    if (this.controls.pausePressed() && this.session.status === 'running') store.togglePause();

    const paused = useShiftStore.getState().paused;
    if (!paused) {
      const input = this.controls.read();
      // rawDelta: Phaser's `delta` is smoothed/clamped, which would let the shift clock drift
      // from real time on slow devices. The accumulator cap already guards against stalls.
      const dt = this.game.loop.rawDelta / 1000;
      this.accumulator = Math.min(this.accumulator + dt, STEP * MAX_STEPS_PER_FRAME);
      let first = true;
      while (this.accumulator >= STEP) {
        // Edge-triggered actions fire on the first sub-step only.
        this.session.tick(STEP, first ? input : { ...input, ability: false });
        this.accumulator -= STEP;
        first = false;
      }
    }
    this.sync(time);
    this.bridge.publish(time);
  }

  private sync(time: number) {
    const s = this.session;
    this.player.sync(s, time);
    const boss = s.boss;
    const bossIcon =
      boss.mode === 'chase' ? '!' : boss.mode === 'patrol' || boss.mode === 'return' ? '' : '?';
    this.boss.sync(
      {
        pos: boss.pos,
        facing: boss.facing,
        icon: bossIcon,
        iconColor: boss.mode === 'chase' ? '#ff5252' : '#ffeb3b',
      },
      time,
    );
    s.students.forEach((st, i) => {
      const icon = st.mode === 'alarmed' ? '!' : st.detection > 0.05 ? '?' : '';
      this.students[i]?.sync(
        {
          pos: st.pos,
          facing: st.facing,
          icon,
          iconColor: st.mode === 'alarmed' ? '#ff5252' : '#ffeb3b',
        },
        time,
      );
    });
    this.fixtures.forEach((f) => f.sync());
    this.doors.forEach((d) => d.sync());
    this.coworker.sync(time);
    this.vision.sync(s);
    this.overlay.sync(s, time);
  }
}
