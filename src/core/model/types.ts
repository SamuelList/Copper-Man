/**
 * Shared domain types. Content (characters, fixtures, upgrades…) is data-driven and keyed by
 * string ids so new entries can be added — or later loaded from JSON — without touching code.
 */

export type MetalId = 'copper' | 'brass' | 'aluminum' | 'steel';
export type Trade = 'plumbing' | 'hvac';
export type FixtureType = Trade | 'free';
export type StatLevel = 1 | 2 | 3;
export type UpgradeCategory =
  'boots' | 'tools' | 'bag' | 'keys' | 'gloves' | 'clipboard' | 'radio' | 'contract';

export interface Vec2 {
  x: number;
  y: number;
}

export interface TilePos {
  col: number;
  row: number;
}

/** Axis-aligned box in simulation pixels. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * How much floor an object really covers, in tiles. Wall-anchored objects sit with their back
 * against the neighbouring wall: `w` runs along the wall, `d` is how far they stick out.
 * Centre-anchored objects are `w` (map x) by `d` (map y) around the tile centre.
 */
export interface Footprint {
  w: number;
  d: number;
  anchor: 'wall' | 'center';
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
  /** Waist-high fixtures hide a crouching worker. */
  cover: 'low' | 'none';
  footprint: Footprint;
  color: number;
  /** Technical fixtures need gear or experience before they can be stripped. */
  requires?: Requirement;
}

/**
 * What it takes to use something: a minimum worker level and/or a minimum owned tier in some
 * gear categories (e.g. `{ gear: { tools: 2 } }` = Pocket Plyers or better).
 */
export interface Requirement {
  level?: number;
  gear?: Partial<Record<UpgradeCategory, number>>;
}

/** Non-interactive furniture. Tall props block sight; low props are cover. */
export interface PropDef {
  id: string;
  name: string;
  glyph: string;
  height: 'tall' | 'low';
  footprint: Footprint;
  color: number;
}

/**
 * Everything gear and skills can change. `…Mult` fields multiply together; the rest add up.
 * Detection multipliers below 1 make you harder to notice.
 */
export interface Modifiers {
  /** Walk + sprint speed. */
  speedMult?: number;
  /** Extra sprint stamina, seconds. */
  staminaBonus?: number;
  staminaRegenMult?: number;
  scrapRateMult?: number;
  /** Extra bag capacity, scrap units. */
  capacityBonus?: number;
  /** Seconds off door unlock time. */
  unlockReduction?: number;
  /** How fast anyone notices you, overall. */
  noticeMult?: number;
  /** How fast anyone notices you scrapping. */
  scrapNoticeMult?: number;
  /** How fast anyone notices you carrying scrap. */
  carryNoticeMult?: number;
  /** How quickly a detection meter drains once you're out of view. */
  decayMult?: number;
  /** 0..1: how much better darkness hides you. */
  darkBonus?: number;
  crouchSpeedMult?: number;
  /** Extra footstep-hearing range, tiles. */
  hearingBonus?: number;
  saleMult?: number;
  /** Fraction off hardware-store prices. */
  shopDiscount?: number;
  /** Fixture recharge time (below 1 = faster). */
  rechargeMult?: number;
  shiftBonusSeconds?: number;
  extraHearts?: number;
  /** Catches per shift that end in a talking-to instead of a warning. */
  catchForgiveness?: number;
}

export interface UpgradeDef {
  id: string;
  category: UpgradeCategory;
  /** 1-based; tiers must be bought in order and the highest owned tier applies. */
  tier: number;
  name: string;
  description: string;
  cost: number;
  effect: Modifiers;
}

/** Single-use gadgets bought between shifts and used with a hotkey/button during one. */
export interface ConsumableDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  maxStack: number;
  /** Keyboard key that uses it. */
  hotkey: string;
  icon: string;
}

export interface SkillTreeDef {
  id: string;
  name: string;
  blurb: string;
  color: number;
}

export interface SkillDef {
  id: string;
  tree: string;
  /** Row in its tree, from 1 (root) downward. */
  tier: number;
  name: string;
  description: string;
  /** Skill points to unlock. */
  cost: number;
  /** Unlocked once ANY of these is owned (empty = tree root). */
  requires: string[];
  effect: Modifiers;
}

export interface NpcDef {
  id: string;
  name: string;
  speed: StatLevel;
  awareness: StatLevel;
}

/** How a student behaves. Students get one at random each shift; their look gives it away. */
export interface PersonalityDef {
  id: string;
  name: string;
  /** One line for the player: what to expect from them. */
  blurb: string;
  /** Relative chance of being picked. */
  weight: number;
  /** Multipliers on the base student vision cone and how fast they notice. */
  sight: { rangeMult: number; fovMult: number; fillMult: number };
  /** Also snitches on a worker carrying scrap (most only care about scrapping). */
  snitchesOnCarrying: boolean;
  /** Chance a full meter actually becomes a snitch (the class clown may just laugh). */
  snitchChance: number;
  /** Also tells nearby teachers, not just the boss. */
  tellsTeachers: boolean;
  /** 'stay' barely moves, 'room' wanders the room, 'roam' drifts out into the halls. */
  wander: 'stay' | 'room' | 'roam';
  speedMult: number;
  idleSeconds: NumRange;
  /** Dozes off for part of the time (blind while asleep): fraction of the time awake. */
  awakeFraction?: number;
  /** Visual tell for the renderer. */
  look: 'plain' | 'sash' | 'phone' | 'propeller' | 'glasses' | 'sleepy';
}

/** A teacher. Content colours describe their outfit for the renderer. */
export interface TeacherDef {
  id: string;
  name: string;
  /** Multiplies how fast they notice you. */
  strictness: number;
  speedMult: number;
  outfit: {
    shirt: number;
    pants: number;
    hair?: number;
    bald?: boolean;
    cap?: number;
    tie?: number;
    glasses?: boolean;
  };
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
  staminaRegenMult: number;
  scrapRateMult: number;
  bagCapacity: number;
  unlockSeconds: number;
  /** Crouch-walk speed as a fraction of walking speed. */
  crouchSpeedFactor: number;
  noticeMult: number;
  scrapNoticeMult: number;
  carryNoticeMult: number;
  decayMult: number;
  darkBonus: number;
  /** Footstep hearing range, pixels. */
  hearingRange: number;
  saleMult: number;
  shopDiscount: number;
  rechargeMult: number;
  shiftSeconds: number;
  maxWarnings: number;
  catchForgiveness: number;
  /** Highest owned tier per gear category (0 = none), for technical requirements. */
  gearTiers: Record<UpgradeCategory, number>;
}

export type BagContents = Record<MetalId, number>;

export interface Bag {
  capacity: number;
  contents: BagContents;
}
