import { displayRate } from '@state/displayRate';
import { useEffect } from 'react';

/**
 * While `active` (the menus, where a frame costs next to nothing), time the browser's animation
 * frames so the game knows what rate the screen is really being refreshed at before a shift
 * starts. See `state/displayRate`.
 */
export function useDisplayRateProbe(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (last > 0) displayRate.sample(now - last);
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A touch can change the rate (see `displayRate.forget`), so measure again after one.
    const touched = () => displayRate.forget();
    window.addEventListener('pointerdown', touched, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', touched, { capture: true });
    };
  }, [active]);
}
