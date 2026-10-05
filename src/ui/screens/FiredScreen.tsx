import { CHARACTERS } from '@core/content/characters';
import { NPCS } from '@core/content/npcs';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { Button, Panel } from '../components';
import { money } from '../format';
import styles from './screens.module.css';

export function FiredScreen() {
  const go = useAppStore((s) => s.go);
  const { day, totalEarned, characterId, reset } = useCareerStore();
  const name = CHARACTERS.find(characterId ?? '')?.name ?? 'You';

  return (
    <main className={[styles.screen, styles.center].join(' ')}>
      <h1
        className={[styles.title, styles.fired].join(' ')}
        style={{ background: 'none', color: 'var(--bad)' }}
      >
        FIRED
      </h1>
      <p className={styles.subtitle}>
        &quot;Three strikes, {name}. Clean out your locker.&quot; — {NPCS.boss.name}
      </p>
      <Panel style={{ width: 'min(380px, 100%)' }}>
        <dl className={styles.statsGrid}>
          <dt>Days on the job</dt>
          <dd>{day}</dd>
          <dt>Total scrap sold</dt>
          <dd style={{ color: 'var(--good)' }}>{money(totalEarned)}</dd>
        </dl>
      </Panel>
      <div className={styles.actions}>
        <Button
          variant="primary"
          onClick={() => {
            reset();
            go('characterSelect');
          }}
        >
          Find a new job
        </Button>
      </div>
    </main>
  );
}
