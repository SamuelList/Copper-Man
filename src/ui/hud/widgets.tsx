import { useInputMode } from '@state/inputMode';
import { useSettings, VIEW_NAMES, type ViewMode } from '@state/settingsStore';
import { useShiftStore } from '@state/shiftStore';
import { useEffect, useRef, useState } from 'react';
import { Kbd } from '../components';
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
      data-action="pause"
      onClick={() => setPaused(true)}
      disabled={!running}
      aria-label="Pause"
    >
      <span aria-hidden className={styles.pauseIcon} />
    </button>
  );
}

/** An eye for first person, a little diorama block for top-down. */
function ViewIcon({ view }: { view: ViewMode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      {view === 'fps' ? (
        <>
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        </>
      ) : (
        <path d="M12 3l9 5v8l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v8" />
      )}
    </svg>
  );
}

/** Switches camera. It shows the view you'd switch to; `V` does the same on a keyboard. */
export function ViewButton({ showKey = false }: { showKey?: boolean }) {
  const view = useSettings((s) => s.view);
  const toggle = useSettings((s) => s.toggleView);
  const next: ViewMode = view === 'iso' ? 'fps' : 'iso';
  const label = `Switch to ${VIEW_NAMES[next].toLowerCase()} view`;
  return (
    <button
      type="button"
      className={styles.pause}
      data-action="view"
      onClick={(e) => {
        toggle();
        // Hand the keyboard straight back to the game.
        e.currentTarget.blur();
      }}
      aria-label={label}
      title={showKey ? `${label} (V)` : label}
      data-testid="view-toggle"
    >
      <ViewIcon view={next} />
      {showKey && <span className={styles.keyHint}>V</span>}
    </button>
  );
}

/** First person: a dot in the middle of the screen that lights up on something you can use. */
export function Crosshair() {
  const state = useShiftStore((s) => {
    const prompt = s.snapshot?.prompt;
    return !prompt ? 'idle' : prompt.enabled ? 'ready' : 'blocked';
  });
  return (
    <div className={styles.crosshair} data-state={state} data-testid="crosshair" aria-hidden />
  );
}

/** First person on a desktop, before the mouse is captured: how to look around. */
export function LookHint() {
  const mouseLook = useInputMode((s) => s.mouseLook);
  const running = useShiftStore((s) => s.snapshot?.status === 'running');
  if (mouseLook || !running) return null;
  return (
    <div className={styles.lookHint} data-testid="look-hint">
      Click to look around with the mouse · <Kbd>←</Kbd> <Kbd>→</Kbd> turn too
    </div>
  );
}
