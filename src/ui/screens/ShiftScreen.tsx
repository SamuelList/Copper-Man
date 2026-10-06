import { DEFAULT_LEVEL_ID, LEVELS } from '@core/level/levels';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { randomSeed } from '@core/util/rng';
import { GameView } from '@game/GameView';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { useShiftStore } from '@state/shiftStore';
import { useCallback, useState } from 'react';
import { Button, Kbd, Panel } from '../components';
import { Hud } from '../hud/Hud';
import styles from './screens.module.css';

function PauseOverlay() {
  const setPaused = useShiftStore((s) => s.setPaused);
  const controller = useShiftStore((s) => s.controller);
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
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', margin: 0 }}>
          <Kbd>WASD</Kbd> move · <Kbd>Shift</Kbd> sprint · <Kbd>E</Kbd> interact · <Kbd>C</Kbd>{' '}
          crouch · <Kbd>Q</Kbd> ability · <Kbd>Wheel</Kbd> zoom · <Kbd>Esc</Kbd> pause
        </p>
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
