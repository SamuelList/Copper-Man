import { BALANCE } from '@core/content/balance';
import { CHARACTERS } from '@core/content/characters';
import { UPGRADE_CATEGORIES, upgradesInCategory } from '@core/content/upgrades';
import type { UpgradeCategory } from '@core/model/types';
import { canPurchase } from '@core/systems/shop';
import { deriveStats } from '@core/systems/stats';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { useEffect } from 'react';
import { Button, Panel } from '../components';
import { money, units } from '../format';
import styles from './screens.module.css';

const CATEGORY_ORDER: UpgradeCategory[] = ['boots', 'tools', 'bag', 'keys'];

const REASON_LABEL = {
  owned: 'Owned',
  locked: 'Buy previous tier first',
  funds: 'Not enough cash',
  unknown: '',
};

export function ShopScreen() {
  const startShift = useAppStore((s) => s.startShift);
  const go = useAppStore((s) => s.go);
  const { cash, day, warnings, characterId, ownedUpgrades, purchase } = useCareerStore();
  const character = CHARACTERS.find(characterId ?? '');
  useEffect(() => {
    if (!character) go('title');
  }, [character, go]);
  if (!character) return null;
  const stats = deriveStats(character, ownedUpgrades);

  return (
    <main className={styles.screen}>
      <h1 className={styles.heading}>Hardware Store</h1>
      <div className={styles.wallet}>
        <span className={styles.walletCash} data-testid="cash">
          {money(cash)}
        </span>
        <span style={{ color: 'var(--bad)', fontSize: '1.3rem' }} aria-label="hearts">
          {'♥'.repeat(BALANCE.warnings.max - warnings)}
          <span style={{ opacity: 0.25 }}>{'♥'.repeat(warnings)}</span>
        </span>
      </div>
      <div className={styles.statLine} style={{ marginBottom: '1.25rem' }}>
        <span>
          {character.name}: <strong>{Math.round(stats.walkSpeed)}</strong> speed
        </span>
        <span>
          <strong>{stats.staminaSeconds.toFixed(1)}s</strong> sprint
        </span>
        <span>
          <strong>×{stats.scrapRateMult.toFixed(1)}</strong> scrap rate
        </span>
        <span>
          <strong>{units(stats.bagCapacity)}</strong> bag
        </span>
        <span>
          <strong>{stats.unlockSeconds}s</strong> unlock
        </span>
      </div>

      <div className={styles.shopGrid}>
        {CATEGORY_ORDER.map((cat) => (
          <Panel key={cat} className={styles.category}>
            <h3>{UPGRADE_CATEGORIES[cat].name}</h3>
            <p>{UPGRADE_CATEGORIES[cat].blurb}</p>
            {upgradesInCategory(cat).map((u) => {
              const check = canPurchase(u.id, ownedUpgrades, cash);
              const owned = ownedUpgrades.includes(u.id);
              return (
                <div
                  key={u.id}
                  className={[styles.item, owned && styles.itemOwned].filter(Boolean).join(' ')}
                >
                  <div className={styles.itemHead}>
                    <span>{u.name}</span>
                    <span style={{ color: 'var(--good)' }}>{money(u.cost)}</span>
                  </div>
                  <div className={styles.itemDesc}>{u.description}</div>
                  <Button
                    size="small"
                    variant={check.ok ? 'primary' : 'default'}
                    disabled={!check.ok}
                    onClick={() => purchase(u.id)}
                    aria-label={`Buy ${u.name}`}
                  >
                    {check.ok ? 'Buy' : REASON_LABEL[check.reason]}
                  </Button>
                </div>
              );
            })}
          </Panel>
        ))}
      </div>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={() => go('title')}>
          Main menu
        </Button>
        <Button variant="primary" onClick={startShift}>
          Clock in for Day {day}
        </Button>
      </div>
    </main>
  );
}
