import { useShiftStore } from '@state/shiftStore';
import { useEffect, useRef, useState } from 'react';
import styles from './hud.module.css';

/** XP earned this shift; pops briefly whenever it goes up. */
export function XpCounter() {
  const xp = useShiftStore((s) => s.snapshot?.xp ?? 0);
  const last = useRef(xp);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (xp > last.current) {
      const gained = xp - last.current;
      setPop(gained);
      const t = setTimeout(() => setPop(0), 900);
      last.current = xp;
      return () => clearTimeout(t);
    }
    last.current = xp;
  }, [xp]);
  return (
    <div className={styles.xp} data-testid="shift-xp">
      {pop > 0 && <span className={styles.xpPop}>+{pop}</span>}★ {xp} XP
    </div>
  );
}

export function PauseButton() {
  const setPaused = useShiftStore((s) => s.setPaused);
  const running = useShiftStore((s) => s.snapshot?.status === 'running');
  return (
    <button
      type="button"
      className={styles.pause}
      onClick={() => setPaused(true)}
      disabled={!running}
      aria-label="Pause"
    >
      <span aria-hidden className={styles.pauseIcon} />
    </button>
  );
}
