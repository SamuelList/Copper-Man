/** One-shot actions from on-screen buttons. */
export type VirtualAction = { type: 'ability' } | { type: 'crouch' } | { type: 'use'; id: string };

/**
 * On-screen controls (the touch joystick and HUD buttons) write here, and the game's input
 * controller merges it with the keyboard every frame. Plain mutable state rather than a store:
 * it changes on every pointer move and nothing needs to re-render because of it.
 */
export const virtualInput = {
  /** Joystick in screen space, -1..1 on each axis (+y is up the screen). */
  stickX: 0,
  stickY: 0,
  /** Stick pushed to the rim: sprint. */
  sprint: false,
  /** Interact button held. */
  interact: false,
  queue: [] as VirtualAction[],

  press(action: VirtualAction) {
    this.queue.push(action);
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
    this.queue = [];
  },
};
