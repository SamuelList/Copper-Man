import type { BagContents, MetalDef, MetalId } from '../model/types';

/** Value order from the design board: copper > brass > aluminum > steel. */
export const METALS: Record<MetalId, MetalDef> = {
  copper: { id: 'copper', name: 'Copper', pricePerUnit: 40, color: 0xd9822b },
  brass: { id: 'brass', name: 'Brass', pricePerUnit: 25, color: 0xd4af37 },
  aluminum: { id: 'aluminum', name: 'Aluminum', pricePerUnit: 15, color: 0xb8c4cc },
  steel: { id: 'steel', name: 'Steel', pricePerUnit: 6, color: 0x707a84 },
};

export const METAL_IDS = Object.keys(METALS) as MetalId[];

export const emptyContents = (): BagContents => ({ copper: 0, brass: 0, aluminum: 0, steel: 0 });
