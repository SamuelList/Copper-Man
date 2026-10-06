import { METAL_IDS, METALS } from '../content/metals';
import type { BagContents } from '../model/types';

/** Cash value of scrap when sold at the van (`mult` from gear/skills). */
export function saleValue(contents: BagContents, mult = 1): number {
  return Math.round(
    METAL_IDS.reduce((sum, m) => sum + contents[m] * METALS[m].pricePerUnit, 0) * mult,
  );
}
