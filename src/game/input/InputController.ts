import type { PlayerInput } from '@core/session/types';
import Phaser from 'phaser';

type HeldKeys = Record<
  'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'sprint' | 'interact' | 'interactAlt',
  Phaser.Input.Keyboard.Key
>;

/**
 * Turns raw devices into action-level `PlayerInput`. Keyboard today; gamepad/touch can be
 * merged in here without the simulation knowing.
 *
 * Held actions are polled; one-shot actions (ability, pause) are captured from keydown events
 * so a quick tap is never lost between frames.
 */
export class InputController {
  private readonly keys: HeldKeys;
  private abilityQueued = false;
  private pauseQueued = false;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP,
      down: K.DOWN,
      left: K.LEFT,
      right: K.RIGHT,
      w: K.W,
      a: K.A,
      s: K.S,
      d: K.D,
      sprint: K.SHIFT,
      interact: K.E,
      interactAlt: K.SPACE,
    }) as HeldKeys;
    kb.addCapture([K.Q, K.ESC]);
    kb.on('keydown-Q', () => (this.abilityQueued = true));
    kb.on('keydown-ESC', () => (this.pauseQueued = true));
  }

  read(): PlayerInput {
    const k = this.keys;
    const x = Number(k.right.isDown || k.d.isDown) - Number(k.left.isDown || k.a.isDown);
    const y = Number(k.down.isDown || k.s.isDown) - Number(k.up.isDown || k.w.isDown);
    const ability = this.abilityQueued;
    this.abilityQueued = false;
    return {
      moveX: x,
      moveY: y,
      sprint: k.sprint.isDown,
      interact: k.interact.isDown || k.interactAlt.isDown,
      ability,
    };
  }

  /** True once per Esc press. */
  pausePressed(): boolean {
    const pressed = this.pauseQueued;
    this.pauseQueued = false;
    return pressed;
  }
}
