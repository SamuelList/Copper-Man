import { CONSUMABLES } from '../content/consumables';
import { UPGRADES } from '../content/upgrades';

export type PurchaseCheck =
  | { ok: true; price: number }
  | { ok: false; reason: 'owned' | 'locked' | 'funds' | 'full' | 'unknown' };

/** Price after any discount (skills), rounded to whole dollars. */
export const discounted = (cost: number, discount = 0) =>
  Math.max(1, Math.round(cost * (1 - discount)));

/** Gear tiers must be bought in order, once, with enough cash. */
export function canPurchase(
  upgradeId: string,
  owned: readonly string[],
  cash: number,
  discount = 0,
): PurchaseCheck {
  const def = UPGRADES.find(upgradeId);
  if (!def) return { ok: false, reason: 'unknown' };
  if (owned.includes(upgradeId)) return { ok: false, reason: 'owned' };
  if (def.tier > 1) {
    const prev = UPGRADES.all.find((u) => u.category === def.category && u.tier === def.tier - 1);
    if (prev && !owned.includes(prev.id)) return { ok: false, reason: 'locked' };
  }
  const price = discounted(def.cost, discount);
  if (cash < price) return { ok: false, reason: 'funds' };
  return { ok: true, price };
}

/** Gadgets stack up to a limit. */
export function canBuyConsumable(
  id: string,
  inventory: Readonly<Record<string, number>>,
  cash: number,
  discount = 0,
): PurchaseCheck {
  const def = CONSUMABLES.find(id);
  if (!def) return { ok: false, reason: 'unknown' };
  if ((inventory[id] ?? 0) >= def.maxStack) return { ok: false, reason: 'full' };
  const price = discounted(def.cost, discount);
  if (cash < price) return { ok: false, reason: 'funds' };
  return { ok: true, price };
}
