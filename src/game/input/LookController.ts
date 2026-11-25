import { useInputMode } from '@state/inputMode';
import { virtualInput } from '@state/virtualInput';

/** Radians turned per pixel of mouse movement. */
const MOUSE_SENSITIVITY = 0.0023;
/** Radians turned per CSS pixel of a finger dragged across the look area. */
const TOUCH_SENSITIVITY = 0.0055;

/**
 * Looking around in first person. A click on the game captures the mouse (pointer lock), after
 * which moving it turns your head; where the browser won't lock the pointer, dragging with the
 * button held does the same. Touch drags come from the HUD's look area by way of
 * `virtualInput`. The game turns with the arrow keys too, so none of this is required.
 */
export class LookController {
  private enabled = false;
  private dx = 0;
  private dy = 0;
  private dragging: number | null = null;
  /** We let go of the mouse ourselves (pausing, switching view), so it isn't the player's Esc. */
  private releasing = false;

  /**
   * @param onEscape The player pressed Esc to free the mouse. Browsers swallow that key press,
   *   so this is the only sign of it.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onEscape: () => void,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  /** Turn mouse look on (first person) or off (and give the mouse back). */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.release();
  }

  /** Ask the browser for the mouse. Only works shortly after a click or key press. */
  capture() {
    if (!this.enabled || this.locked || !this.canvas.requestPointerLock) return;
    try {
      // Older browsers return nothing here; newer ones a promise that rejects when refused.
      const asked = this.canvas.requestPointerLock() as Promise<void> | undefined;
      asked?.catch?.(() => {});
    } catch {
      // Not allowed right now (sandboxed frame, too soon after Esc): dragging still works.
    }
  }

  /** Give the mouse back (the pause menu needs it). */
  release() {
    this.dragging = null;
    if (!this.locked) return;
    this.releasing = true;
    document.exitPointerLock();
  }

  /** Look movement since the last call: radians to the right and radians up. */
  take(): { x: number; y: number } {
    const touch = virtualInput.takeLook();
    const look = {
      x: this.dx * MOUSE_SENSITIVITY + touch.x * TOUCH_SENSITIVITY,
      y: -(this.dy * MOUSE_SENSITIVITY + touch.y * TOUCH_SENSITIVITY),
    };
    this.dx = 0;
    this.dy = 0;
    return look;
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled || e.pointerType === 'touch') return;
    this.dragging = e.pointerId;
    this.capture();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.enabled || e.pointerType === 'touch') return;
    if (!this.locked && this.dragging !== e.pointerId) return;
    this.dx += e.movementX;
    this.dy += e.movementY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.dragging === e.pointerId) this.dragging = null;
  };

  private onLockChange = () => {
    const locked = this.locked;
    useInputMode.getState().setMouseLook(locked);
    if (locked) {
      this.releasing = false;
      return;
    }
    const byPlayer = !this.releasing;
    this.releasing = false;
    if (byPlayer && this.enabled) this.onEscape();
  };

  dispose() {
    this.release();
    useInputMode.getState().setMouseLook(false);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
  }
}
