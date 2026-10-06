/** One rung of the quality ladder. */
export interface QualityLevel {
  /** Render resolution as a multiple of CSS pixels. */
  ratio: number;
  /** Studio reflections on metal and glass. */
  reflections: boolean;
  /** Real-time shadow map size; 0 = no real-time shadows. */
  shadows: number;
}

/** Best first. */
export const QUALITY: readonly QualityLevel[] = [
  { ratio: 2, reflections: true, shadows: 2048 },
  { ratio: 1.75, reflections: true, shadows: 2048 },
  { ratio: 1.5, reflections: true, shadows: 2048 },
  { ratio: 1.25, reflections: true, shadows: 1024 },
  { ratio: 1, reflections: true, shadows: 1024 },
  { ratio: 1, reflections: false, shadows: 1024 },
  { ratio: 1, reflections: false, shadows: 0 },
  { ratio: 0.75, reflections: false, shadows: 0 },
];

/** Below this frame rate (two samples in a row), step down a level rather than stutter. */
const TARGET_FPS = 45;
/** Lowest level that still has reflections and shadows. */
const KEEP_EFFECTS_LEVEL = 4;
/** Below this, effects go too (above it, only resolution drops). */
const STRUGGLING_FPS = 28;
/** Below this, skip straight to the lowest level. */
const DESPERATE_FPS = 20;
/** Seconds per frame-rate sample. */
const WINDOW = 1.5;
/** Samples ignored at the start while shaders compile and textures upload. */
const WARMUP = 2;

/**
 * Dynamic quality. Feed it every frame's duration; it watches the frame rate and, when the device
 * can't keep up (an older phone, a huge screen), steps down the ladder: fewer pixels first, then
 * no reflections, then no shadows. It only ever steps down, needs two slow samples in a row (one
 * hiccup never costs quality for the whole shift), and keeps effects on a phone that is merely
 * capped at 30 fps by low-power mode.
 */
export class QualityGovernor {
  level: number;
  private frames = 0;
  private seconds = 0;
  private slow = 0;
  private warmup = WARMUP;

  constructor(devicePixelRatio: number) {
    this.level = Math.max(
      0,
      QUALITY.findIndex((q) => q.ratio <= devicePixelRatio),
    );
  }

  get current(): QualityLevel {
    return QUALITY[this.level]!;
  }

  /** Record a frame; returns the new level when quality should drop, else null. */
  sample(frameSeconds: number): number | null {
    if (frameSeconds >= 5) return null; // a pause or a background tab, not a slow device
    this.frames++;
    this.seconds += frameSeconds;
    if (this.seconds < WINDOW) return null;
    const fps = this.frames / this.seconds;
    this.frames = 0;
    this.seconds = 0;
    if (this.warmup > 0) {
      this.warmup--;
      return null;
    }
    const last = QUALITY.length - 1;
    if (this.level >= last) return null;
    this.slow = fps < TARGET_FPS ? this.slow + 1 : 0;
    if (this.slow < 2) return null;
    this.slow = 0;
    const floor = fps < STRUGGLING_FPS ? last : KEEP_EFFECTS_LEVEL;
    const next = Math.min(fps < DESPERATE_FPS ? last : this.level + 1, floor);
    if (next <= this.level) return null;
    this.level = next;
    return next;
  }
}
