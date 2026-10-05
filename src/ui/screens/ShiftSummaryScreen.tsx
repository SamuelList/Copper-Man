import { BALANCE } from '@core/content/balance';
import { METAL_IDS, METALS } from '@core/content/metals';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { Button, Panel } from '../components';
import { money, units } from '../format';
import styles from './screens.module.css';

const END_LABEL = {
  time: 'Shift whistle blew',
  clockOut: 'Clocked out early',
  fired: 'Fired',
} as const;

export function ShiftSummaryScreen() {
  const go = useAppStore((s) => s.go);
  const { lastSummary: s, cash, warnings } = useCareerStore();
  if (!s) return null;
  const hearts = BALANCE.warnings.max - warnings;

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
          <dt>Hearts left</dt>
          <dd style={{ color: 'var(--bad)' }}>{'♥'.repeat(hearts) || '—'}</dd>
          <dt>Cash on hand</dt>
          <dd style={{ color: 'var(--good)' }}>{money(cash)}</dd>
        </dl>
      </Panel>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => go('shop')}>
          Hit the hardware store
        </Button>
      </div>
    </main>
  );
}
