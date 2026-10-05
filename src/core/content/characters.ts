import type { CharacterDef } from '../model/types';
import { createRegistry } from './registry';

/**
 * Playable crew from the design board. Stat levels (1–3) are converted to numbers in
 * BALANCE. Trades are an assumption — the board names plumbing/HVAC bonuses but
 * not who has which trade.
 */
export const CHARACTERS = createRegistry<CharacterDef>('character', [
  {
    id: 'dalton',
    name: 'Dalton',
    tagline: 'Quick feet, slow wrench.',
    color: 0x4caf50,
    stats: { speed: 3, repair: 2, carry: 1 },
    trade: 'hvac',
    abilityId: 'act-like-a-student',
  },
  {
    id: 'tomothy',
    name: 'Tomothy',
    tagline: 'Old, slow, and the best pipe-stripper in the district.',
    color: 0x29b6f6,
    stats: { speed: 1, repair: 3, carry: 2 },
    trade: 'plumbing',
    abilityId: 'act-like-youre-working',
  },
  {
    id: 'dunkin',
    name: 'Dunkin',
    tagline: 'Can haul a radiator under each arm. Hates paperwork.',
    color: 0xef5350,
    stats: { speed: 2, repair: 1, carry: 3 },
    trade: null,
    abilityId: null,
  },
]);
