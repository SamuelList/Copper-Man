import { UPGRADE_CATEGORIES, UPGRADES } from '../content/upgrades';
import type { Requirement, UpgradeCategory } from '../model/types';

export interface Qualifications {
  /** Worker (career) level. */
  level: number;
  /** Highest owned tier per gear category. */
  gearTiers: Readonly<Record<UpgradeCategory, number>>;
}

/**
 * Why the worker can't do this yet, or null if they can. Names the exact item to buy (or the
 * level to reach), so the prompt doubles as a shopping list.
 */
export function unmetRequirement(req: Requirement | undefined, q: Qualifications): string | null {
  if (!req) return null;
  for (const [category, tier] of Object.entries(req.gear ?? {}) as [UpgradeCategory, number][]) {
    if ((q.gearTiers[category] ?? 0) >= tier) continue;
    const item = UPGRADES.all.find((u) => u.category === category && u.tier === tier);
    const name = item?.name ?? `${UPGRADE_CATEGORIES[category].name} tier ${tier}`;
    return `Needs ${name}`;
  }
  if (req.level !== undefined && q.level < req.level)
    return `Too technical: reach level ${req.level}`;
  return null;
}
