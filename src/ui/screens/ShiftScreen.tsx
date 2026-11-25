import { DEFAULT_LEVEL_ID, LEVELS } from '@core/level/levels';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { randomSeed } from '@core/util/rng';
import { GameView } from '@game/GameView';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { useInputMode } from '@state/inputMode';
import { useSettings } from '@state/settingsStore';
import { useShiftStore } from '@state/shiftStore';
import { useCallback, useState } from 'react';
import { Button, Kbd, Panel } from '../components';
import { ViewSwitch } from '../components/ViewSwitch';
import { useWakeLock } from '../hooks/useWakeLock';
import { Hud } from '../hud/Hud';
import styles from './screens.module.css';

function PauseOverlay() {
  const setPaused = useShiftStore((s) => s.setPaused);
  const controller = useShiftStore((s) => s.controller);
  const touch = useInputMode((s) => s.mode === 'touch');
  const firstPerson = useSettings((s) => s.view === 'fps');
  return (
    <div className={styles.overlay} role="dialog" aria-label="Paused">
      <Panel className={styles.pauseBox}>
        <h2 className={styles.heading}>Paused</h2>
        <Button variant="primary" onClick={() => setPaused(false)} autoFocus>
          Resume
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setPaused(false);
            controller?.clockOut();
          }}
        >
          Clock out early
        </Button>
        <ViewSwitch fill />
        {touch ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
            Drag on the left to walk. Hold 🏃 to sprint and ✋ to scrap, unlock and sell. Tap
            gadgets to use them.
            {firstPerson && ' Drag on the right to look around.'}
          </p>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
            <Kbd>WASD</Kbd> move · <Kbd>Shift</Kbd> sprint · <Kbd>E</Kbd> interact · <Kbd>Q</Kbd>{' '}
            ability · <Kbd>1</Kbd>-<Kbd>3</Kbd> gadgets · <Kbd>V</Kbd> view · <Kbd>Esc</Kbd> pause
            {firstPerson && (
              <>
                <br />
                Click the game to look with the mouse, or turn with <Kbd>←</Kbd> <Kbd>→</Kbd>
              </>
            )}
          </p>
        )}
      </Panel>
    </div>
  );
}

/**
 * Shown while the school is being built (and again if the graphics have to be started over):
 * the page can't respond for that moment, and a frozen menu would look like a crash.
 */
function LoadingCover({ done, again }: { done: boolean; again: boolean }) {
  const [gone, setGone] = useState(false);
  if (gone && done) return null;
  return (
    <div
      className={styles.loading}
      data-done={done}
      role="status"
      aria-live="polite"
      onTransitionEnd={() => setGone(done)}
    >
      {!done && (
        <>
          <span className={styles.spinner} aria-hidden />
          {again ? 'One moment…' : 'Clocking in…'}
        </>
      )}
    </div>
  );
}

export function ShiftScreen() {
  const go = useAppStore((s) => s.go);
  const applyShiftResult = useCareerStore((s) => s.applyShiftResult);
  const paused = useShiftStore((s) => s.paused);
  const over = useShiftStore((s) => s.result !== null);
  // Lying low takes patience; the phone shouldn't lock while the player waits.
  useWakeLock(!paused && !over);
  /** Is there a picture yet, and has there been one before (this is a restart)? */
  const [view, setView] = useState({ ready: false, shown: false });
  const onReady = useCallback(
    (ready: boolean) => setView((v) => ({ ready, shown: v.shown || ready })),
    [],
  );

  // Built once per mount (App keys this screen by shift), so the game never restarts mid-shift.
  const [config] = useState<ShiftConfig>(() => {
    const career = useCareerStore.getState();
    return {
      level: LEVELS.get(DEFAULT_LEVEL_ID),
      characterId: career.characterId ?? 'dalton',
      ownedUpgrades: [...career.ownedUpgrades],
      skills: [...career.skills],
      inventory: { ...career.inventory },
      workerLevel: career.level,
      explored: career.explored[DEFAULT_LEVEL_ID],
      day: career.day,
      warnings: career.warnings,
      seed: randomSeed(),
    };
  });

  const onShiftEnd = useCallback(
    (summary: ShiftSummary) => {
      applyShiftResult(summary);
      go(summary.fired ? 'fired' : 'summary');
    },
    [applyShiftResult, go],
  );

  return (
    <div className={styles.shift}>
      <GameView
        config={config}
        onShiftEnd={onShiftEnd}
        onReady={onReady}
        className={styles.gameHost}
      />
      <Hud />
      {paused && <PauseOverlay />}
      <LoadingCover done={view.ready} again={view.shown} />
    </div>
  );
}
