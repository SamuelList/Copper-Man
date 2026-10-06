import { CHARACTERS } from '@core/content/characters';
import { CONSUMABLES } from '@core/content/consumables';
import { SKILL_TREES, skillsInTree } from '@core/content/skills';
import { UPGRADE_CATEGORIES, upgradesInCategory } from '@core/content/upgrades';
import type { SkillDef, UpgradeCategory } from '@core/model/types';
import { canLearn, xpToNext } from '@core/systems/progression';
import { canBuyConsumable, canPurchase, discounted, type PurchaseCheck } from '@core/systems/shop';
import { useAppStore } from '@state/appStore';
import { careerStats, useCareerStore } from '@state/careerStore';
import { useEffect, useState, type CSSProperties } from 'react';
import { Button, Hearts, LevelBadge, Panel, Tabs } from '../components';
import { css, money, pct, units } from '../format';
import styles from './screens.module.css';

const CATEGORY_ORDER: UpgradeCategory[] = [
  'boots',
  'tools',
  'bag',
  'keys',
  'gloves',
  'clipboard',
  'radio',
  'contract',
];

const REASON_LABEL: Record<Exclude<PurchaseCheck, { ok: true }>['reason'], string> = {
  owned: 'Owned',
  locked: 'Buy previous tier first',
  funds: 'Not enough cash',
  full: 'Fully stocked',
  unknown: '',
};

type Tab = 'gear' | 'gadgets' | 'skills';

/** Between shifts: spend cash on gear and gadgets, and skill points on the three trees. */
export function ShopScreen() {
  const startShift = useAppStore((s) => s.startShift);
  const go = useAppStore((s) => s.go);
  const career = useCareerStore();
  const { cash, day, warnings, characterId, level, xp, skillPoints } = career;
  const character = CHARACTERS.find(characterId ?? '');
  const [tab, setTab] = useState<Tab>(() => (skillPoints > 0 ? 'skills' : 'gear'));
  useEffect(() => {
    if (!character) go('title');
  }, [character, go]);
  if (!character) return null;
  const stats = careerStats(career);

  return (
    <main className={[styles.screen, styles.hub].join(' ')}>
      <h1 className={styles.heading}>Hardware Store</h1>
      <div className={styles.wallet}>
        <span className={styles.walletCash} data-testid="cash">
          {money(cash)}
        </span>
        <Hearts warnings={warnings} max={stats.maxWarnings} />
        <LevelBadge level={level} xp={xp} next={xpToNext(level)} points={skillPoints} />
      </div>
      <div className={styles.statLine}>
        <span>
          {character.name}: <strong>{Math.round(stats.walkSpeed)}</strong> speed
        </span>
        <span>
          <strong>{stats.staminaSeconds.toFixed(1)}s</strong> sprint
        </span>
        <span>
          <strong>×{stats.scrapRateMult.toFixed(2)}</strong> scrap rate
        </span>
        <span>
          <strong>{units(stats.bagCapacity)}</strong> bag
        </span>
        <span>
          <strong>{stats.unlockSeconds}s</strong> unlock
        </span>
        {stats.noticeMult < 1 && (
          <span>
            <strong>{pct(stats.noticeMult)}</strong> noticed
          </span>
        )}
        {stats.saleMult > 1 && (
          <span>
            <strong>{pct(stats.saleMult)}</strong> sale price
          </span>
        )}
        {stats.shopDiscount > 0 && (
          <span>
            <strong>-{Math.round(stats.shopDiscount * 100)}%</strong> prices
          </span>
        )}
      </div>

      <Tabs<Tab>
        label="Store sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'gear', label: 'Gear' },
          { id: 'gadgets', label: 'Gadgets' },
          {
            id: 'skills',
            label: (
              <>
                Skills
                {skillPoints > 0 && <span className={styles.tabBadge}>{skillPoints}</span>}
              </>
            ),
          },
        ]}
      />

      <div className={styles.tabBody}>
        {tab === 'gear' && <GearTab discount={stats.shopDiscount} />}
        {tab === 'gadgets' && <GadgetsTab discount={stats.shopDiscount} />}
        {tab === 'skills' && <SkillsTab />}
      </div>

      <div className={styles.stickyActions}>
        <Button variant="ghost" onClick={() => go('title')}>
          Menu
        </Button>
        <Button variant="primary" onClick={startShift} className={styles.clockIn}>
          Clock in for Day {day}
        </Button>
      </div>
    </main>
  );
}

function Price({ cost, discount }: { cost: number; discount: number }) {
  const price = discounted(cost, discount);
  return (
    <span style={{ color: 'var(--good)' }}>
      {price < cost && <s className={styles.oldPrice}>{money(cost)}</s>}
      {money(price)}
    </span>
  );
}

function GearTab({ discount }: { discount: number }) {
  const { cash, ownedUpgrades, purchase } = useCareerStore();
  return (
    <div className={styles.shopGrid}>
      {CATEGORY_ORDER.map((cat) => (
        <Panel key={cat} className={styles.category}>
          <h3>{UPGRADE_CATEGORIES[cat].name}</h3>
          <p>{UPGRADE_CATEGORIES[cat].blurb}</p>
          {upgradesInCategory(cat).map((u) => {
            const check = canPurchase(u.id, ownedUpgrades, cash, discount);
            const owned = ownedUpgrades.includes(u.id);
            return (
              <div
                key={u.id}
                className={[styles.item, owned && styles.itemOwned].filter(Boolean).join(' ')}
              >
                <div className={styles.itemHead}>
                  <span>{u.name}</span>
                  {!owned && <Price cost={u.cost} discount={discount} />}
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
  );
}

function GadgetsTab({ discount }: { discount: number }) {
  const { cash, inventory, buyConsumable } = useCareerStore();
  return (
    <>
      <p className={styles.tabIntro}>
        One-use tricks for the next shift. Tap them on the HUD (or press 1, 2, 3). Whatever you
        don&apos;t use, you keep.
      </p>
      <div className={styles.shopGrid}>
        {CONSUMABLES.all.map((c) => {
          const have = inventory[c.id] ?? 0;
          const check = canBuyConsumable(c.id, inventory, cash, discount);
          return (
            <Panel key={c.id} className={styles.gadget}>
              <div className={styles.gadgetIcon} aria-hidden>
                {c.icon}
              </div>
              <div className={styles.itemHead}>
                <span>{c.name}</span>
                <Price cost={c.cost} discount={discount} />
              </div>
              <div className={styles.itemDesc}>{c.description}</div>
              <div className={styles.stock} aria-label={`${have} of ${c.maxStack} owned`}>
                {Array.from({ length: c.maxStack }, (_, i) => (
                  <span key={i} className={i < have ? styles.stockOn : undefined} />
                ))}
              </div>
              <Button
                size="small"
                variant={check.ok ? 'primary' : 'default'}
                disabled={!check.ok}
                onClick={() => buyConsumable(c.id)}
                aria-label={`Buy ${c.name}`}
              >
                {check.ok ? 'Buy' : REASON_LABEL[check.reason]}
              </Button>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function SkillsTab() {
  const skillPoints = useCareerStore((s) => s.skillPoints);
  return (
    <>
      <p className={styles.tabIntro}>
        Every level earns a skill point. Scrap, sell, open doors and finish shifts for XP.{' '}
        <strong>{skillPoints > 0 ? `${skillPoints} to spend.` : 'No points to spend yet.'}</strong>
      </p>
      <div className={styles.trees}>
        {SKILL_TREES.all.map((tree) => {
          const skills = skillsInTree(tree.id);
          const tiers = [...new Set(skills.map((s) => s.tier))].sort((a, b) => a - b);
          return (
            <Panel
              key={tree.id}
              className={styles.tree}
              style={{ '--tree': css(tree.color) } as CSSProperties}
            >
              <h3>{tree.name}</h3>
              <p>{tree.blurb}</p>
              {tiers.map((tier) => (
                <div key={tier} className={styles.tier}>
                  {skills
                    .filter((s) => s.tier === tier)
                    .map((s) => (
                      <SkillNode key={s.id} skill={s} />
                    ))}
                </div>
              ))}
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function SkillNode({ skill }: { skill: SkillDef }) {
  const { skills, skillPoints, learnSkill } = useCareerStore();
  const owned = skills.includes(skill.id);
  const check = canLearn(skill.id, skills, skillPoints);
  const locked = !check.ok && check.reason === 'locked';
  const state = owned ? 'owned' : check.ok ? 'ready' : locked ? 'locked' : 'waiting';
  return (
    <button
      type="button"
      className={[styles.skill, styles[`skill_${state}`]].join(' ')}
      disabled={!check.ok}
      onClick={() => learnSkill(skill.id)}
      aria-label={`${skill.name}: ${skill.description}`}
      aria-pressed={owned}
    >
      <span className={styles.skillHead}>
        <span>{skill.name}</span>
        <span className={styles.skillCost}>
          {owned ? '✓' : locked ? '🔒' : `${skill.cost} pt${skill.cost > 1 ? 's' : ''}`}
        </span>
      </span>
      <span className={styles.skillDesc}>{skill.description}</span>
    </button>
  );
}
