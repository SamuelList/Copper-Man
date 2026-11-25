import type { ViewMode } from '@state/settingsStore';
import type { PostLook } from './post/PostFX';

/** How a view is finished: its grade, and how much the floor shows of the room above it. */
export interface ViewLook extends PostLook {
  /** Strength of the floor's reflections. */
  mirror: number;
}

/**
 * The grade for each view. Top-down is a lit miniature: crisp in the middle, softly out of
 * focus toward the top and bottom of the screen. First person is closer and moodier, with a
 * heavier vignette and a touch of lens fringing.
 */
export const LOOKS: Record<ViewMode, ViewLook> = {
  iso: {
    exposure: 1.06,
    bloom: 1.1,
    bloomThreshold: 0.95,
    ao: 0.9,
    aoRadius: 0.55,
    saturation: 1.1,
    contrast: 1.06,
    vignette: 0.3,
    tilt: 2.2,
    aberration: 0,
    grain: 0.02,
    shadowTint: [0.95, 0.99, 1.07],
    highlightTint: [1.04, 1.01, 0.96],
    mirror: 1.6,
  },
  fps: {
    exposure: 1.12,
    bloom: 1.2,
    bloomThreshold: 0.95,
    ao: 0.85,
    aoRadius: 0.45,
    saturation: 1.1,
    contrast: 1.1,
    vignette: 0.4,
    tilt: 0,
    aberration: 0.006,
    grain: 0.026,
    shadowTint: [0.94, 0.99, 1.08],
    highlightTint: [1.05, 1.01, 0.95],
    mirror: 0.8,
  },
};
