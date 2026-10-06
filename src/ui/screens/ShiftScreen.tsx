import { DEFAULT_LEVEL_ID, LEVELS } from '@core/level/levels';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { randomSeed } from '@core/util/rng';
import { GameView } from '@game/GameView';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { useInputMode } from '@state/inputMode';
import { useShiftStore } from '@state/shiftStore';
import { useCallback, useState } from 'react';
import { Button, Kbd, Panel } from '../components';
import { Hud } from '../hud/Hud';
import styles from './screens.module.css';

function PauseOverlay() {
  const setPaused = useShiftStore((s) => s.setPaused);
  const controller = useShiftStore((s) => s.controller);
  const touch = useInputMode((s) => s.mode === 'touch');
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
        {touch ? (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
            Drag on the left to walk; push to the edge to sprint. Hold ✋ to scrap, unlock and sell.
            Tap gadgets to use them.
          </p>
        ) : (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
            <Kbd>WASD</Kbd> move · <Kbd>Shift</Kbd> sprint · <Kbd>E</Kbd> interact · <Kbd>C</Kbd>{' '}
            crouch · <Kbd>Q</Kbd> ability · <Kbd>1</Kbd>-<Kbd>3</Kbd> gadgets · <Kbd>Esc</Kbd> pause
          </p>
        )}
      </Panel>
    </div>
  );
}

export function ShiftScreen() {
  const go = useAppStore((s) => s.go);
  const applyShiftResult = useCareerStore((s) => s.applyShiftResult);
  const paused = useShiftStore((s) => s.paused);

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
      <GameView config={config} onShiftEnd={onShiftEnd} className={styles.gameHost} />
      <Hud />
      {paused && <PauseOverlay />}
    </div>
  );
}
