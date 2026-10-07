import { CONSUMABLES } from '@core/content/consumables';
import type { PlayerInput } from '@core/session/types';
import { virtualInput } from '@state/virtualInput';

/** Ground-plane basis of the screen, so "W" walks toward the top of the screen. */
export interface ScreenBasis {
  screenUp: { x: number; y: number };
  screenRight: { x: number; y: number };
}

const GAME_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyQ',
  'ShiftLeft',
  'ShiftRight',
  'Digit1',
  'Digit2',
  'Digit3',
]);

/** Gadget hotkeys: Digit1 → the consumable whose hotkey is '1', and so on. */
const GADGET_KEYS = new Map(CONSUMABLES.all.map((c) => [`Digit${c.hotkey}`, c.id]));

/** Joystick dead zone and the deflection that reaches full walking speed. */
const STICK_DEAD = 0.12;
const STICK_FULL = 0.55;

/**
 * Turns the keyboard and the on-screen touch controls into world-space `PlayerInput`. Movement is
 * screen-relative (rotated into the fixed camera's frame). Held actions are polled; one-shot
 * actions (ability, gadgets, pause) are queued on keydown or tap so a quick press
 * is never lost between frames.
 */
export class InputController {
  private readonly held = new Set<string>();
  private abilityQueued = false;
  private pauseQueued = false;
  private useQueued: string | null = null;

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    // Let buttons and form fields keep their own keys (Space/Enter on the pause menu).
    const onControl = el && ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if (e.code === 'Escape') {
      if (!e.repeat) this.pauseQueued = true;
      return;
    }
    if (onControl) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.held.add(e.code);
    if (e.code === 'KeyQ') this.abilityQueued = true;
    const gadget = GADGET_KEYS.get(e.code);
    if (gadget) this.useQueued = gadget;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
    virtualInput.reset();
  };

  private down(...codes: string[]) {
    return codes.some((c) => this.held.has(c));
  }

  read(basis: ScreenBasis): PlayerInput {
    for (const action of virtualInput.drain()) {
      if (action.type === 'ability') this.abilityQueued = true;
      else this.useQueued = action.id;
    }
    let sx = Number(this.down('KeyD', 'ArrowRight')) - Number(this.down('KeyA', 'ArrowLeft'));
    let sy = Number(this.down('KeyW', 'ArrowUp')) - Number(this.down('KeyS', 'ArrowDown'));
    if (sx === 0 && sy === 0) {
      // Analog stick: ease off for a slow walk; full speed from about half way out.
      const mag = Math.hypot(virtualInput.stickX, virtualInput.stickY);
      if (mag > STICK_DEAD) {
        const speed = Math.min(1, (mag - STICK_DEAD) / (STICK_FULL - STICK_DEAD));
        sx = (virtualInput.stickX / mag) * speed;
        sy = (virtualInput.stickY / mag) * speed;
      }
    }
    const moveX = sx * basis.screenRight.x + sy * basis.screenUp.x;
    const moveY = sx * basis.screenRight.y + sy * basis.screenUp.y;
    const ability = this.abilityQueued;
    const use = this.useQueued;
    this.abilityQueued = false;
    this.useQueued = null;
    return {
      moveX,
      moveY,
      sprint: this.down('ShiftLeft', 'ShiftRight') || virtualInput.sprint,
      interact: this.down('KeyE', 'Space') || virtualInput.interact,
      ability,
      use,
    };
  }

  /** True once per Esc press. */
  pausePressed(): boolean {
    const pressed = this.pauseQueued;
    this.pauseQueued = false;
    return pressed;
  }

  dispose() {
    virtualInput.reset();
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
