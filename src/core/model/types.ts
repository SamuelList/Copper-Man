/**
 * Shared domain types. Content (characters, fixtures, upgrades…) is data-driven and keyed by
 * string ids so new entries can be added — or later loaded from JSON — without touching code.
 */

export type MetalId = 'copper' | 'brass' | 'aluminum' | 'steel';
export type Trade = 'plumbing' | 'hvac';
export type FixtureType = Trade | 'free';
export type StatLevel = 1 | 2 | 3;
export type UpgradeCategory = 'boots' | 'tools' | 'bag' | 'keys';

export interface Vec2 {
  x: number;
  y: number;
}

export interface TilePos {
  col: number;
  row: number;
}

export interface NumRange {
  min: number;
  max: number;
}

export interface MetalDef {
  id: MetalId;
  name: string;
  /** Cash per scrap unit when sold at the van. */
  pricePerUnit: number;
  color: number;
}

export interface CharacterStats {
  speed: StatLevel;
  repair: StatLevel;
  carry: StatLevel;
}

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  color: number;
  stats: CharacterStats;
  /** Matching trade grants a bigger repair bonus on fixtures of that type. */
  trade: Trade | null;
  abilityId: string | null;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'very high';

export interface FixtureDef {
  id: string;
  name: string;
  /** Single ASCII glyph used by the level format. */
  glyph: string;
  type: FixtureType;
  metal: MetalId;
  /** Scrap units yielded per strip (rolled uniformly in range). */
  yield: NumRange;
  /** Seconds before the fixture can be stripped again. */
  recharge: NumRange;
  /** Seconds to strip for a baseline worker (see BALANCE.scrapping). */
  workSeconds: number;
  risk: RiskLevel;
  color: number;
}

export interface UpgradeEffect {
  /** Multiplies walk + sprint speed. */
  speedMult?: number;
  /** Extra sprint stamina in seconds. */
  staminaBonus?: number;
  /** Multiplies scrapping speed. */
  scrapRateMult?: number;
  /** Extra bag capacity in scrap units. */
  capacityBonus?: number;
  /** Seconds removed from door unlock time. */
  unlockReduction?: number;
}

export interface UpgradeDef {
  id: string;
  category: UpgradeCategory;
  /** 1-based; tiers must be bought in order and the highest owned tier applies. */
  tier: number;
  name: string;
  description: string;
  cost: number;
  effect: UpgradeEffect;
}

export interface NpcDef {
  id: string;
  name: string;
  speed: StatLevel;
  awareness: StatLevel;
}

/** Signals that can make the player look suspicious to NPCs. */
export type SuspicionSignal = 'carrying' | 'scrapping';

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  kind: 'active' | 'passive';
  durationSeconds: number;
  cooldownSeconds: number;
  /** Strategy hook: does this ability hide the given signal right now? */
  conceals: (signal: SuspicionSignal, active: boolean) => boolean;
}

export interface EffectiveStats {
  walkSpeed: number;
  sprintSpeed: number;
  staminaSeconds: number;
  scrapRateMult: number;
  bagCapacity: number;
  unlockSeconds: number;
}

export type BagContents = Record<MetalId, number>;

export interface Bag {
  capacity: number;
  contents: BagContents;
}
