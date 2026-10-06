import { METAL_IDS, METALS } from '@core/content/metals';
import { xpToNext } from '@core/systems/progression';
import { useAppStore } from '@state/appStore';
import { careerStats, useCareerStore } from '@state/careerStore';
import { Button, Hearts, LevelBadge, Panel } from '../components';
import { money, units } from '../format';
import styles from './screens.module.css';

const END_LABEL = {
  time: 'Shift whistle blew',
  clockOut: 'Clocked out early',
  fired: 'Fired',
} as const;

export function ShiftSummaryScreen() {
  const go = useAppStore((s) => s.go);
  const career = useCareerStore();
  const { lastSummary: s, cash, warnings, level, xp, skillPoints, lastLevelsGained } = career;
  if (!s) return null;
  const maxHearts = careerStats(career).maxWarnings;

  return (
    <main className={[styles.screen, styles.center].join(' ')}>
      <h1 className={styles.heading}>Day {s.day} complete</h1>
      <p className={styles.subtitle} style={{ margin: '0.25rem 0 1rem' }}>
        {END_LABEL[s.endedBy]}
      </p>
      <Panel style={{ width: 'min(440px, 100%)' }}>
        <div className={styles.big}>+{money(s.earned)}</div>
        <dl className={styles.statsGrid}>
          {METAL_IDS.filter((m) => s.soldByMetal[m] > 0).map((m) => (
            <div key={m} style={{ display: 'contents' }}>
              <dt>{METALS[m].name} sold</dt>
              <dd>
                {units(s.soldByMetal[m])} × {money(METALS[m].pricePerUnit)}
              </dd>
            </div>
          ))}
          <dt>Scrap collected</dt>
          <dd>{units(s.unitsCollected)}</dd>
          <dt>Unsold scrap lost</dt>
          <dd>{units(s.unitsLost)}</dd>
          <dt>Times caught</dt>
          <dd>{s.timesCaught}</dd>
          <dt>Coworker found</dt>
          <dd>{s.coworkerFound ? 'Yes' : 'No'}</dd>
          <dt>School explored</dt>
          <dd data-testid="explored">{Math.round(s.exploredFraction * 100)}%</dd>
          {s.roomsDiscovered.length > 0 && (
            <>
              <dt>New rooms</dt>
              <dd className={styles.wrapValue}>{s.roomsDiscovered.join(', ')}</dd>
            </>
          )}
          <dt>Hearts left</dt>
          <dd>
            <Hearts warnings={warnings} max={maxHearts} />
          </dd>
          <dt>Cash on hand</dt>
          <dd style={{ color: 'var(--good)' }}>{money(cash)}</dd>
        </dl>
      </Panel>
      <Panel className={styles.xpPanel}>
        <h2>Experience</h2>
        {lastLevelsGained > 0 && (
          <div className={styles.levelUp} role="status">
            Level up! Level {level}
            <small>
              {skillPoints} skill {skillPoints === 1 ? 'point' : 'points'} to spend at the store
            </small>
          </div>
        )}
        <dl className={styles.statsGrid}>
          {s.xp.map((line) => (
            <div key={line.label} style={{ display: 'contents' }}>
              <dt>{line.label}</dt>
              <dd>+{line.amount}</dd>
            </div>
          ))}
          <dt>Total</dt>
          <dd style={{ color: 'var(--xp)' }} data-testid="xp-total">
            +{s.xpTotal} XP
          </dd>
        </dl>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.9rem' }}>
          <LevelBadge level={level} xp={xp} next={xpToNext(level)} />
        </div>
      </Panel>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => go('shop')}>
          {skillPoints > 0 ? 'Spend skill points & shop' : 'Hit the hardware store'}
        </Button>
      </div>
    </main>
  );
}
