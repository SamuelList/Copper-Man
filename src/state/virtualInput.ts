/** One-shot actions from on-screen buttons. */
export type VirtualAction = { type: 'ability' } | { type: 'use'; id: string };

/**
 * On-screen controls (the touch joystick and HUD buttons) write here, and the game's input
 * controller merges it with the keyboard every frame. Plain mutable state rather than a store:
 * it changes on every pointer move and nothing needs to re-render because of it.
 */
export const virtualInput = {
  /** Joystick in screen space, -1..1 on each axis (+y is up the screen). */
  stickX: 0,
  stickY: 0,
  /** Sprint button held. */
  sprint: false,
  /** Interact button held. */
  interact: false,
  /** Look drag since the game last read it, in CSS pixels (first person). */
  lookX: 0,
  lookY: 0,
  queue: [] as VirtualAction[],

  press(action: VirtualAction) {
    this.queue.push(action);
  },

  /** A finger dragged across the look area. */
  look(dx: number, dy: number) {
    this.lookX += dx;
    this.lookY += dy;
  },

  /** Take the look drag built up since the last call. */
  takeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  },

  /** Take every queued action (once). */
  drain(): VirtualAction[] {
    const actions = this.queue;
    this.queue = [];
    return actions;
  },

  reset() {
    this.stickX = 0;
    this.stickY = 0;
    this.sprint = false;
    this.interact = false;
    this.lookX = 0;
    this.lookY = 0;
    this.queue = [];
  },
};
