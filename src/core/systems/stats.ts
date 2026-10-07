import { BALANCE, TILE_SIZE } from '../content/balance';
import { SKILLS } from '../content/skills';
import { UPGRADE_CATEGORIES, UPGRADES } from '../content/upgrades';
import type {
  CharacterDef,
  EffectiveStats,
  Modifiers,
  UpgradeCategory,
  UpgradeDef,
} from '../model/types';

/** Highest owned tier per category — tiers replace each other rather than stack. */
export function activeUpgrades(
  owned: readonly string[],
): Partial<Record<UpgradeCategory, UpgradeDef>> {
  const active: Partial<Record<UpgradeCategory, UpgradeDef>> = {};
  for (const id of owned) {
    const def = UPGRADES.find(id);
    if (!def) continue; // tolerate stale ids from old saves
    const current = active[def.category];
    if (!current || def.tier > current.tier) active[def.category] = def;
  }
  return active;
}

const MULTIPLIED = new Set<keyof Modifiers>([
  'speedMult',
  'staminaRegenMult',
  'scrapRateMult',
  'noticeMult',
  'scrapNoticeMult',
  'carryNoticeMult',
  'decayMult',
  'noiseMult',
  'saleMult',
  'rechargeMult',
]);

/** Fold a list of modifiers together: `…Mult` fields multiply, everything else adds. */
export function combineModifiers(list: readonly Modifiers[]): Required<Modifiers> {
  const out: Record<string, number> = {};
  for (const key of [
    'speedMult',
    'staminaBonus',
    'staminaRegenMult',
    'scrapRateMult',
    'capacityBonus',
    'unlockReduction',
    'noticeMult',
    'scrapNoticeMult',
    'carryNoticeMult',
    'decayMult',
    'darkBonus',
    'noiseMult',
    'hearingBonus',
    'saleMult',
    'shopDiscount',
    'rechargeMult',
    'shiftBonusSeconds',
    'extraHearts',
    'catchForgiveness',
    'efficiency',
    'salvage',
    'noBotch',
  ] as (keyof Modifiers)[]) {
    out[key] = MULTIPLIED.has(key) ? 1 : 0;
  }
  for (const m of list) {
    for (const [key, value] of Object.entries(m) as [keyof Modifiers, number][]) {
      if (value === undefined) continue;
      out[key] = MULTIPLIED.has(key) ? out[key]! * value : out[key]! + value;
    }
  }
  return out as Required<Modifiers>;
}

/** Everything a worker brings to a shift: base stats + best gear in each category + skills. */
export function deriveStats(
  character: CharacterDef,
  ownedUpgrades: readonly string[],
  skills: readonly string[] = [],
): EffectiveStats {
  const active = activeUpgrades(ownedUpgrades);
  const gear = Object.values(active).map((u) => u.effect);
  const learned = skills.map((id) => SKILLS.find(id)?.effect).filter((e) => e !== undefined);
  const m = combineModifiers([...gear, ...learned]);
  const walkSpeed = BALANCE.player.walkSpeed[character.stats.speed] * m.speedMult;
  return {
    walkSpeed,
    sprintSpeed: walkSpeed * BALANCE.player.sprintMult,
    staminaSeconds: BALANCE.player.staminaSeconds + m.staminaBonus,
    staminaRegenMult: m.staminaRegenMult,
    scrapRateMult: m.scrapRateMult,
    bagCapacity: BALANCE.bag.capacityByCarry[character.stats.carry] + m.capacityBonus,
    unlockSeconds: Math.max(
      BALANCE.doors.minUnlockSeconds,
      BALANCE.doors.baseUnlockSeconds - m.unlockReduction,
    ),
    noticeMult: m.noticeMult,
    scrapNoticeMult: m.scrapNoticeMult,
    carryNoticeMult: m.carryNoticeMult,
    decayMult: m.decayMult,
    darkBonus: Math.min(1, m.darkBonus),
    noiseMult: m.noiseMult,
    hearingRange: BALANCE.npc.hearingRange + m.hearingBonus * TILE_SIZE,
    saleMult: m.saleMult,
    shopDiscount: Math.min(0.9, m.shopDiscount),
    rechargeMult: m.rechargeMult,
    shiftSeconds: BALANCE.shift.durationSeconds + m.shiftBonusSeconds,
    maxWarnings: BALANCE.warnings.max + m.extraHearts,
    catchForgiveness: m.catchForgiveness,
    efficiency: m.efficiency,
    salvage: m.salvage,
    noBotch: m.noBotch > 0,
    gearTiers: Object.fromEntries(
      Object.keys(UPGRADE_CATEGORIES).map((c) => [c, active[c as UpgradeCategory]?.tier ?? 0]),
    ) as Record<UpgradeCategory, number>,
  };
}
