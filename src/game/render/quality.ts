/** One rung of the quality ladder. */
export interface QualityLevel {
  /** Render resolution as a multiple of CSS pixels. */
  ratio: number;
  /** Studio reflections on metal and glass. */
  reflections: boolean;
  /**
   * How sharp real-time shadows are (the size of a square shadow map over the standard area;
   * see `World.setShadows`); 0 = no real-time shadows.
   */
  shadows: number;
  /**
   * Post-processing (see PostFX). 2: everything. 1: bloom, grading and anti-aliasing, without
   * ambient occlusion or lens effects. 0: none, drawn straight to the screen (jagged edges and
   * all: the smoothing is part of the chain).
   */
  effects: 0 | 1 | 2;
  /** The floor reflects the room (the scene is drawn a second time, mirrored). */
  mirror: boolean;
}

/**
 * Best first. This ladder is for a computer, where the first thing to run short is usually
 * the graphics card's fill rate on a large screen: pixels go first, effects last.
 */
export const QUALITY: readonly QualityLevel[] = [
  { ratio: 2, reflections: true, shadows: 2048, effects: 2, mirror: true },
  { ratio: 1.75, reflections: true, shadows: 2048, effects: 2, mirror: true },
  { ratio: 1.5, reflections: true, shadows: 2048, effects: 2, mirror: true },
  { ratio: 1.25, reflections: true, shadows: 1024, effects: 2, mirror: true },
  { ratio: 1, reflections: true, shadows: 1024, effects: 2, mirror: true },
  { ratio: 1, reflections: true, shadows: 1024, effects: 1, mirror: false },
  { ratio: 1, reflections: false, shadows: 1024, effects: 1, mirror: false },
  { ratio: 1, reflections: false, shadows: 0, effects: 0, mirror: false },
  { ratio: 0.75, reflections: false, shadows: 0, effects: 0, mirror: false },
];

/**
 * The ladder for a phone. There the first thing to run short is usually not pixels but draw
 * calls (each one is work on a single slow core, and a message to the browser's graphics
 * process), and with them heat and battery. So the mirrored floor, which draws the room a
 * second time, is what goes first, and sharpness is kept until that hasn't been enough.
 * Shadows are half as sharp throughout: on a screen that small it doesn't show.
 */
export const PHONE_QUALITY: readonly QualityLevel[] = [
  { ratio: 2, reflections: true, shadows: 1024, effects: 2, mirror: true },
  { ratio: 2, reflections: true, shadows: 1024, effects: 2, mirror: false },
  { ratio: 1.5, reflections: true, shadows: 1024, effects: 2, mirror: false },
  { ratio: 1.5, reflections: true, shadows: 1024, effects: 1, mirror: false },
  { ratio: 1.25, reflections: true, shadows: 1024, effects: 1, mirror: false },
  { ratio: 1, reflections: false, shadows: 1024, effects: 1, mirror: false },
  { ratio: 1, reflections: false, shadows: 0, effects: 0, mirror: false },
  { ratio: 0.75, reflections: false, shadows: 0, effects: 0, mirror: false },
];

/**
 * The frame rates that matter, as shares of the best the screen will show (60 a second on
 * most, 30 on a phone in Low Power Mode). Below the first (two samples in a row) a level is
 * given up rather than stutter.
 */
const TARGET = 0.75;
/** Below this share, effects go too (above it, only resolution drops). */
const STRUGGLING = 0.47;
/** Below this, skip straight to the lowest level. */
const DESPERATE = 0.33;
/** Seconds per frame-rate sample. */
const WINDOW = 1.5;
/** Samples ignored at the start while shaders compile and textures upload. */
const WARMUP = 2;
/** The share of a sample's frames, slowest first, left out of it: a hitch isn't a frame rate. */
const HITCHES = 0.1;

/**
 * The frame rate to aim for on a screen the browser refreshes `hz` times a second: all of it
 * up to 60, and no more than that on a faster one.
 */
const paceFor = (hz: number) => (hz <= 40 ? 30 : hz < 56 ? 50 : 60);

/** Frames a second over a run of frame times, leaving out its few slowest. */
function steadyRate(frames: number[]): number {
  frames.sort((a, b) => a - b);
  const kept = Math.max(1, Math.ceil(frames.length * (1 - HITCHES)));
  let seconds = 0;
  for (let i = 0; i < kept; i++) seconds += frames[i]!;
  return kept / seconds;
}

/** Where a governor ended up, for the next one to start from. */
export interface Settled {
  level: number;
  /** The frame rate it was holding out for (a level given up at 60 says nothing at 30). */
  pace: number;
}

export interface GovernorOptions {
  /** The ladder to climb down (the computer's unless told otherwise). */
  ladder?: readonly QualityLevel[];
  /**
   * The browser is drawing without a graphics card (a software rasteriser). Nothing extra is
   * affordable there, so start at the bottom instead of crawling down to it.
   */
  software?: boolean;
  /**
   * Where the governor before this one ended up (the previous shift), if it adapted at all.
   * This one starts a single level better than that: it doesn't stutter its way down from the
   * top again, and a phone that was only hot or busy earns quality back a shift at a time.
   */
  last?: Settled | null;
  /**
   * How many frames a second the browser delivers when the page is easy to draw (see
   * `state/displayRate`). A phone in Low Power Mode is held to 30: that is then full speed,
   * not a reason to give anything up.
   */
  displayHz?: number;
}

/** Is WebGL being drawn on the CPU (SwiftShader, llvmpipe…) rather than a graphics card? */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  return /swiftshader|llvmpipe|softpipe|software/i.test(name);
}

/**
 * Dynamic quality. Feed it every frame's duration; it watches the frame rate and, when the device
 * can't keep up (an older phone, a huge screen), steps down the ladder: fewer pixels first, then
 * no mirrored floors and lighter post-processing, no reflections, and finally no shadows or
 * post-processing at all. It only ever steps down, needs two slow samples in a row (one hiccup
 * never costs quality for the whole shift), and measures against what the screen is actually
 * being refreshed at, so a phone the system holds to 30 frames a second keeps everything.
 */
export class QualityGovernor {
  level: number;
  private readonly frames: number[] = [];
  private seconds = 0;
  private slow = 0;
  private warmup = WARMUP;
  private pinned = false;
  private pace: number;
  private readonly ladder: readonly QualityLevel[];
  /** Lowest level that still has every effect: where a device that is only a little slow stops. */
  private readonly keepEffects: number;

  constructor(devicePixelRatio: number, options: GovernorOptions = {}) {
    this.ladder = options.ladder ?? QUALITY;
    this.keepEffects = this.ladder.reduce((last, q, i) => (q.effects === 2 ? i : last), 0);
    const sharpest = Math.max(
      0,
      this.ladder.findIndex((q) => q.ratio <= devicePixelRatio),
    );
    const bottom = this.ladder.length - 1;
    this.pace = paceFor(options.displayHz ?? 60);
    const last = options.last?.pace === this.pace ? options.last.level : 0;
    this.level = options.software ? bottom : Math.min(bottom, Math.max(sharpest, last - 1));
  }

  /** What to hand to the next governor, or null if this one was pinned rather than adapting. */
  get settled(): Settled | null {
    return this.pinned ? null : { level: this.level, pace: this.pace };
  }

  get current(): QualityLevel {
    return this.ladder[this.level]!;
  }

  /** Hold one level and stop adapting (screenshots, benchmarks, software renderers). */
  pin(level: number) {
    this.level = Math.max(0, Math.min(this.ladder.length - 1, Math.round(level)));
    this.pinned = true;
  }

  /** The screen's refresh rate has been measured again (see `GovernorOptions.displayHz`). */
  setDisplayRate(hz: number) {
    const pace = paceFor(hz);
    if (pace === this.pace) return;
    this.pace = pace;
    this.slow = 0;
  }

  /**
   * Record a frame that was drawn while the game was being played (not a paused or hidden
   * one); returns the new level when quality should drop, else null.
   */
  sample(frameSeconds: number): number | null {
    if (this.pinned) return null;
    if (frameSeconds >= 5) return null; // a pause or a background tab, not a slow device
    this.frames.push(frameSeconds);
    this.seconds += frameSeconds;
    if (this.seconds < WINDOW) return null;
    const fps = steadyRate(this.frames);
    this.frames.length = 0;
    this.seconds = 0;
    if (this.warmup > 0) {
      this.warmup--;
      return null;
    }
    // Clearly faster than the screen was thought to manage: it was measured too low (a browser
    // runs an embedded page at half rate until it's touched).
    if (fps > this.pace * 1.3) this.pace = 60;
    const last = this.ladder.length - 1;
    if (this.level >= last) return null;
    this.slow = fps < TARGET * this.pace ? this.slow + 1 : 0;
    if (this.slow < 2) return null;
    this.slow = 0;
    const floor = fps < STRUGGLING * this.pace ? last : this.keepEffects;
    const next = Math.min(fps < DESPERATE * this.pace ? last : this.level + 1, floor);
    if (next <= this.level) return null;
    this.level = next;
    // The change itself costs a slow frame or two (render targets are rebuilt): don't count it.
    this.warmup = 1;
    return next;
  }
}
