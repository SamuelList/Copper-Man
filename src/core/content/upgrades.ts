import type { UpgradeCategory, UpgradeDef } from '../model/types';
import { createRegistry } from './registry';

export const UPGRADE_CATEGORIES: Record<UpgradeCategory, { name: string; blurb: string }> = {
  boots: { name: 'Boots', blurb: 'Improve speed / sprint' },
  tools: { name: 'Tools', blurb: 'Improve scrapping rate' },
  bag: { name: 'Bags', blurb: 'Improve copper capacity' },
  keys: { name: 'Keys', blurb: 'Improve door unlock speed' },
};

/** Tiered upgrades from the design board. Within a category, the highest owned tier applies. */
export const UPGRADES = createRegistry<UpgradeDef>('upgrade', [
  {
    id: 'cowboy-boots',
    category: 'boots',
    tier: 1,
    name: 'Cowboy Boots',
    description: '+10% move speed, +0.5s sprint.',
    cost: 60,
    effect: { speedMult: 1.1, staminaBonus: 0.5 },
  },
  {
    id: 'super-cool-cowboy-boots',
    category: 'boots',
    tier: 2,
    name: 'Super Cool Cowboy Boots',
    description: '+20% move speed, +1s sprint.',
    cost: 160,
    effect: { speedMult: 1.2, staminaBonus: 1 },
  },
  {
    id: 'just-tens-cowboy-boots',
    category: 'boots',
    tier: 3,
    name: 'Just-Tens Cowboy Boots',
    description: '+30% move speed, +1.5s sprint.',
    cost: 340,
    effect: { speedMult: 1.3, staminaBonus: 1.5 },
  },
  {
    id: 'ten-in-one-screwdriver',
    category: 'tools',
    tier: 1,
    name: 'Ten-in-One Screwdriver',
    description: 'Scrap 20% faster.',
    cost: 80,
    effect: { scrapRateMult: 1.2 },
  },
  {
    id: 'pocket-plyers',
    category: 'tools',
    tier: 2,
    name: 'Pocket Plyers with Holster',
    description: 'Scrap 40% faster.',
    cost: 190,
    effect: { scrapRateMult: 1.4 },
  },
  {
    id: 'milt-wakee-drill',
    category: 'tools',
    tier: 3,
    name: 'Milt-Wakee Drill/Driver',
    description: 'Scrap 70% faster.',
    cost: 400,
    effect: { scrapRateMult: 1.7 },
  },
  {
    id: 'cardboard-box',
    category: 'bag',
    tier: 1,
    name: 'Cardboard Box',
    description: '+0.5 scrap capacity.',
    cost: 50,
    effect: { capacityBonus: 0.5 },
  },
  {
    id: 'backpack',
    category: 'bag',
    tier: 2,
    name: 'Backpack',
    description: '+1 scrap capacity.',
    cost: 150,
    effect: { capacityBonus: 1 },
  },
  {
    id: 'rolling-cart',
    category: 'bag',
    tier: 3,
    name: 'Rolling Cart',
    description: '+2 scrap capacity.',
    cost: 320,
    effect: { capacityBonus: 2 },
  },
  {
    id: 'efficient-key-ring',
    category: 'keys',
    tier: 1,
    name: 'Efficient Key Ring',
    description: 'Unlock doors 1s faster.',
    cost: 90,
    effect: { unlockReduction: 1 },
  },
  {
    id: 'master-key',
    category: 'keys',
    tier: 2,
    name: 'Master Key',
    description: 'Unlock doors 2s faster.',
    cost: 220,
    effect: { unlockReduction: 2 },
  },
]);

export const upgradesInCategory = (category: UpgradeCategory) =>
  UPGRADES.all.filter((u) => u.category === category).sort((a, b) => a.tier - b.tier);
