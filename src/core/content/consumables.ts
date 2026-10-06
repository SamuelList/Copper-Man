import type { ConsumableDef } from '../model/types';
import { createRegistry } from './registry';

/** Single-use gadgets. Stock up at the hardware store; use them during a shift with 1/2/3. */
export const CONSUMABLES = createRegistry<ConsumableDef>('consumable', [
  {
    id: 'energy-drink',
    name: 'Energy Drink',
    description: 'Full stamina, and sprinting is free for a few seconds.',
    cost: 20,
    maxStack: 3,
    hotkey: '1',
    icon: '⚡',
  },
  {
    id: 'whoopee-cushion',
    name: 'Whoopee Cushion',
    description: 'Toss it ahead of you. Mr. Gravy goes to see who made that noise.',
    cost: 30,
    maxStack: 3,
    hotkey: '2',
    icon: '💨',
  },
  {
    id: 'bolt-cutters',
    name: 'Bolt Cutters',
    description: 'Snip a locked door open instantly.',
    cost: 40,
    maxStack: 2,
    hotkey: '3',
    icon: '✂️',
  },
]);
