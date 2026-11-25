import { useEffect } from 'react';

/**
 * Keep the screen on while `active`. A phone dims and locks after as little as thirty seconds
 * without a touch, and hiding in a dark room until the boss has passed is exactly that.
 *
 * The browser lets go of the lock whenever the page is hidden, so it's asked for again when the
 * page comes back. Where there is no such thing, or it's refused (Low Power Mode, a frame
 * that isn't allowed it), nothing happens.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let asking = false;
    let done = false;

    const ask = () => {
      if (done || asking || lock || document.visibilityState !== 'visible') return;
      asking = true;
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          asking = false;
          if (done) return void sentinel.release().catch(() => {});
          lock = sentinel;
          sentinel.addEventListener('release', () => {
            if (lock === sentinel) lock = null;
          });
        },
        () => {
          asking = false;
        },
      );
    };

    ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', ask);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}
