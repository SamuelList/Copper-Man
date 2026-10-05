import { emptyContents, METAL_IDS } from '../content/metals';
import type { Bag, MetalId } from '../model/types';
import { round2 } from '../util/math';

export const createBag = (capacity: number): Bag => ({ capacity, contents: emptyContents() });

export const bagTotal = (bag: Bag) =>
  round2(METAL_IDS.reduce((sum, m) => sum + bag.contents[m], 0));

export const bagFree = (bag: Bag) => round2(Math.max(0, bag.capacity - bagTotal(bag)));

export const isBagFull = (bag: Bag) => bagFree(bag) <= 0;

export interface AddResult {
  bag: Bag;
  added: number;
  /** Scrap that didn't fit and was left behind. */
  overflow: number;
}

export function addToBag(bag: Bag, metal: MetalId, amount: number): AddResult {
  const added = round2(Math.min(amount, bagFree(bag)));
  return {
    bag: { ...bag, contents: { ...bag.contents, [metal]: round2(bag.contents[metal] + added) } },
    added,
    overflow: round2(amount - added),
  };
}

export const emptyBag = (bag: Bag): Bag => ({ ...bag, contents: emptyContents() });
