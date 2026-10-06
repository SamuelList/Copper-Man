import type { PlayerInput } from '@core/session/types';

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
  'KeyC',
  'ShiftLeft',
  'ShiftRight',
]);

/**
 * Turns the keyboard into world-space `PlayerInput`. Movement is screen-relative (rotated into
 * the fixed camera's frame). Held actions are polled; one-shot actions (ability, crouch toggle,
 * pause) are captured on keydown so a quick tap is never lost between frames. Gamepad/touch can
 * be merged in here without the simulation knowing.
 */
export class InputController {
  private readonly held = new Set<string>();
  private abilityQueued = false;
  private pauseQueued = false;
  private crouching = false;

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
    if (e.code === 'KeyC') this.crouching = !this.crouching;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  private onBlur = () => {
    this.held.clear();
  };

  private down(...codes: string[]) {
    return codes.some((c) => this.held.has(c));
  }

  read(basis: ScreenBasis): PlayerInput {
    const sx = Number(this.down('KeyD', 'ArrowRight')) - Number(this.down('KeyA', 'ArrowLeft'));
    const sy = Number(this.down('KeyW', 'ArrowUp')) - Number(this.down('KeyS', 'ArrowDown'));
    const moveX = sx * basis.screenRight.x + sy * basis.screenUp.x;
    const moveY = sx * basis.screenRight.y + sy * basis.screenUp.y;
    const ability = this.abilityQueued;
    this.abilityQueued = false;
    return {
      moveX,
      moveY,
      sprint: this.down('ShiftLeft', 'ShiftRight'),
      interact: this.down('KeyE', 'Space'),
      ability,
      crouch: this.crouching,
    };
  }

  /** True once per Esc press. */
  pausePressed(): boolean {
    const pressed = this.pauseQueued;
    this.pauseQueued = false;
    return pressed;
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }
}
