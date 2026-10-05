import { UPGRADES } from '../content/upgrades';

export type PurchaseCheck =
  { ok: true } | { ok: false; reason: 'owned' | 'locked' | 'funds' | 'unknown' };

/** Tiers must be bought in order, once, with enough cash. */
export function canPurchase(
  upgradeId: string,
  owned: readonly string[],
  cash: number,
): PurchaseCheck {
  const def = UPGRADES.find(upgradeId);
  if (!def) return { ok: false, reason: 'unknown' };
  if (owned.includes(upgradeId)) return { ok: false, reason: 'owned' };
  if (def.tier > 1) {
    const prev = UPGRADES.all.find((u) => u.category === def.category && u.tier === def.tier - 1);
    if (prev && !owned.includes(prev.id)) return { ok: false, reason: 'locked' };
  }
  if (cash < def.cost) return { ok: false, reason: 'funds' };
  return { ok: true };
}
