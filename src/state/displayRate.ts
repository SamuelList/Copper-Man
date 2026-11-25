/** Frame gaps kept for the estimate, and how many it takes to trust one. */
const KEEP = 40;
const ENOUGH = 20;
/** Longer than this between frames is a stall (a tab switch, a hitch), not the screen's rhythm. */
const STALL_MS = 250;

/**
 * How often the browser is really calling requestAnimationFrame when the page is easy to draw.
 * Usually that's the screen's refresh rate, but a phone in Low Power Mode, or one that's
 * running hot, is held to half of it, and then thirty frames a second is the ceiling rather
 * than a sign of a struggling renderer. The quality governor needs to know which.
 *
 * It's fed from wherever frames are cheap (the menus, the pause screen) and read when a shift
 * starts. Plain mutable state, like `virtualInput`: nothing re-renders because of it.
 */
export const displayRate = {
  /** Frames per second; 60 until there's a measurement. */
  hz: 60,
  gaps: [] as number[],

  /** The time between two animation frames in which little was drawn, in milliseconds. */
  sample(ms: number) {
    if (!(ms > 0) || ms > STALL_MS) return;
    this.gaps.push(ms);
    if (this.gaps.length > KEEP) this.gaps.shift();
    if (this.gaps.length < ENOUGH) return;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    this.hz = Math.round(1000 / sorted[sorted.length >> 1]!);
  },

  /**
   * Start measuring afresh, keeping the last answer until there's a new one. (A tap can change
   * the rhythm: browsers run an embedded page nobody has touched yet at half rate.)
   */
  forget() {
    this.gaps = [];
  },

  reset() {
    this.hz = 60;
    this.gaps = [];
  },
};
