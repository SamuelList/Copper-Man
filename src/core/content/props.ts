import type { PropDef } from '../model/types';
import { createRegistry } from './registry';

/**
 * Furniture that shapes stealth: tall props break line of sight, low props are cover for a
 * crouching worker. Placed in maps by glyph like fixtures, but can't be scrapped.
 */
export const PROPS = createRegistry<PropDef>('prop', [
  {
    id: 'lockers',
    name: 'Lockers',
    glyph: 'O',
    height: 'tall',
    footprint: { w: 0.96, d: 0.5, anchor: 'wall' },
    color: 0x5c7a99,
  },
  {
    id: 'boiler',
    name: 'Boiler',
    glyph: 'B',
    height: 'tall',
    footprint: { w: 0.98, d: 0.98, anchor: 'center' },
    color: 0x8d3b2a,
  },
  {
    id: 'shelf',
    name: 'Supply Shelf',
    glyph: 'h',
    height: 'tall',
    footprint: { w: 0.94, d: 0.5, anchor: 'wall' },
    color: 0x8a7a5c,
  },
  {
    id: 'table',
    name: 'Table',
    glyph: 't',
    height: 'low',
    footprint: { w: 0.98, d: 0.98, anchor: 'center' },
    color: 0x9c7b5b,
  },
  {
    id: 'bench',
    name: 'Bench',
    glyph: 'b',
    height: 'low',
    footprint: { w: 0.98, d: 0.56, anchor: 'wall' },
    color: 0x6d5a4a,
  },
  {
    id: 'planter',
    name: 'Planter',
    glyph: 'p',
    height: 'low',
    footprint: { w: 0.7, d: 0.7, anchor: 'center' },
    color: 0x4f7a3a,
  },
]);

export const propByGlyph = (glyph: string) => PROPS.all.find((p) => p.glyph === glyph);
