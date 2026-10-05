import { METAL_IDS, METALS } from '../content/metals';
import type { BagContents } from '../model/types';

/** Cash value of scrap when sold at the van. */
export function saleValue(contents: BagContents): number {
  return Math.round(METAL_IDS.reduce((sum, m) => sum + contents[m] * METALS[m].pricePerUnit, 0));
}
