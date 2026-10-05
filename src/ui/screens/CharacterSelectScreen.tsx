import { ABILITIES } from '@core/content/abilities';
import { CHARACTERS } from '@core/content/characters';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { useState, type CSSProperties } from 'react';
import { Button, StatBar } from '../components';
import { css } from '../format';
import styles from './screens.module.css';

const TRADE_LABEL = { plumbing: 'Plumber', hvac: 'HVAC tech' } as const;

export function CharacterSelectScreen() {
  const [selected, setSelected] = useState<string>(CHARACTERS.all[0]!.id);
  const startCareer = useCareerStore((s) => s.startCareer);
  const { go, startShift } = useAppStore();
  const chosen = CHARACTERS.get(selected);

  const hire = () => {
    startCareer(selected);
    startShift();
  };

  return (
    <main className={styles.screen}>
      <h1 className={styles.heading}>Pick your worker</h1>
      <p className={styles.subtitle} style={{ margin: '0.25rem auto 0' }}>
        Stats are Speed, Repair and Carry. Matching your trade to a fixture speeds up scrapping.
      </p>
      <div className={styles.cards} role="radiogroup" aria-label="Characters">
        {CHARACTERS.all.map((c) => {
          const ability = c.abilityId ? ABILITIES.get(c.abilityId) : null;
          const accent = css(c.color);
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected === c.id}
              className={[styles.charCard, selected === c.id && styles.charSelected]
                .filter(Boolean)
                .join(' ')}
              style={{ '--accent': accent } as CSSProperties}
              onClick={() => setSelected(c.id)}
              onDoubleClick={hire}
            >
              <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
                <div className={styles.avatar} aria-hidden />
                <div>
                  <h2 className={styles.charName}>{c.name}</h2>
                  <span className={styles.tag}>
                    {c.trade ? TRADE_LABEL[c.trade] : 'General labor'}
                  </span>
                </div>
              </div>
              <p className={styles.tagline}>{c.tagline}</p>
              <StatBar label="Speed" value={c.stats.speed} color={accent} />
              <StatBar label="Repair" value={c.stats.repair} color={accent} />
              <StatBar label="Carry" value={c.stats.carry} color={accent} />
              <div className={styles.ability}>
                {ability ? (
                  <>
                    <strong>
                      {ability.name} {ability.kind === 'active' ? '(Q)' : '(passive)'}
                    </strong>
                    {ability.description}
                  </>
                ) : (
                  <>
                    <strong>No special ability</strong>
                    Biggest bag in the crew — fewer trips to the van.
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => go('title')}>
          Back
        </Button>
        <Button variant="primary" onClick={hire}>
          Hire {chosen.name} &amp; clock in
        </Button>
      </div>
    </main>
  );
}
