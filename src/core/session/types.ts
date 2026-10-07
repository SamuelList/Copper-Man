import type { BossMode, BossRemark } from '../ai/bossBrain';
import type { LevelDef } from '../level/types';
import type { ScrapQuality } from '../systems/scrapping';
import type { Bag, BagContents, Box, FixtureDef, MetalId, TilePos, Vec2 } from '../model/types';

export interface ShiftConfig {
  level: LevelDef;
  characterId: string;
  ownedUpgrades: readonly string[];
  /** Learned skill ids. */
  skills?: readonly string[];
  /** Gadgets brought along: id → count. */
  inventory?: Readonly<Record<string, number>>;
  day: number;
  /** Warnings carried in from previous shifts. */
  warnings: number;
  seed: number;
  durationSeconds?: number;
  /** Career level (technical fixtures need experience). */
  workerLevel?: number;
  /** Tiles already explored on this level (see systems/exploration). */
  explored?: string;
}

/** One frame of player intent, produced by whatever input device is in use. */
export interface PlayerInput {
  moveX: number;
  moveY: number;
  sprint: boolean;
  /** Held. */
  interact: boolean;
  /** Pressed this frame. */
  ability: boolean;
  /** Gadget used this frame (consumable id). */
  use?: string | null;
}

export interface PlayerState {
  pos: Vec2;
  facing: number;
  moving: boolean;
  sprinting: boolean;
  stamina: number;
  staminaDelay: number;
  /** Seconds of post-catch protection remaining. */
  grace: number;
  abilityActive: number;
  abilityCooldown: number;
  /** Seconds of free sprinting left (energy drink). */
  boost: number;
  /** Actual velocity this tick, pixels per second. */
  vel: Vec2;
}

export interface FixtureState {
  id: string;
  def: FixtureDef;
  tile: TilePos;
  /** Hitbox (pixels): what you bump into and reach for. */
  box: Box;
  /** Centre of the hitbox. */
  pos: Vec2;
  rechargeLeft: number;
  rechargeTotal: number;
  /** Mr. Gravy has already spotted that this one was stripped. */
  noticed: boolean;
}

export interface DoorState {
  id: string;
  tile: TilePos;
  locked: boolean;
  /** Needs the Master Key (or bolt cutters). */
  security: boolean;
}

export interface CoworkerState {
  tile: TilePos;
  pos: Vec2;
  box: Box;
  found: boolean;
}

export type InteractionKind = 'fixture' | 'door' | 'van' | 'coworker';

export interface InteractionTarget {
  kind: InteractionKind;
  id: string;
  label: string;
  verb: string;
  duration: number;
  enabled: boolean;
  reason?: string;
  pos: Vec2;
}

export type ShiftStatus = 'running' | 'ended';
export type ShiftEndReason = 'time' | 'fired' | 'clockOut';

export interface ShiftSummary {
  /** Level played (exploration is saved per level). */
  levelId: string;
  day: number;
  endedBy: ShiftEndReason;
  fired: boolean;
  warnings: number;
  earned: number;
  unitsSold: number;
  soldByMetal: BagContents;
  unitsCollected: number;
  /** Unsold scrap lost when the shift ended. */
  unitsLost: number;
  timesCaught: number;
  coworkerFound: boolean;
  maxEscalation: number;
  /** XP earned, line by line (includes end-of-shift bonuses). */
  xp: XpLine[];
  xpTotal: number;
  /** Gadgets left over (carry back into the career inventory). */
  inventory: Record<string, number>;
  /** The level's explored tiles after this shift (save it for next time). */
  explored: string;
  exploredFraction: number;
  /** Rooms seen for the first time this shift. */
  roomsDiscovered: string[];
}

export interface XpLine {
  label: string;
  amount: number;
}

export interface ShiftEvents {
  'scrap:collected': {
    fixtureId: string;
    fixtureName: string;
    metal: MetalId;
    amount: number;
    overflow: number;
    /** How the pull went (botched jobs yield nothing but still leave the fixture stripped). */
    quality: ScrapQuality;
    fraction: number;
  };
  'scrap:sold': { units: number; value: number; contents: BagContents };
  'fixture:recharged': { fixtureId: string };
  'door:unlocked': { doorId: string; by: 'player' | 'boss' };
  'player:caught': { warnings: number; fired: boolean; confiscated: number };
  'player:excused': Record<string, never>;
  'boss:mode': { mode: BossMode; previous: BossMode };
  'boss:escalated': { level: number };
  'student:alert': { studentId: string; personality: string; pos: Vec2 };
  /** Their meter filled, but they just laughed it off (class clown). */
  'student:laughed': { studentId: string; personality: string };
  'teacher:report': { teacherId: string; name: string; pos: Vec2 };
  /** Something Mr. Gravy says out loud; `detail` names what he found. */
  'boss:remark': { remark: BossRemark; pos: Vec2; detail?: string };
  'room:discovered': { roomId: string; name: string };
  /** The head custodian is kneeling at a stripped fixture. */
  'custodian:inspecting': { fixtureName: string; pos: Vec2 };
  /** He looked, grumbled, and let it go. */
  'custodian:shrug': { fixtureName: string; pos: Vec2 };
  /** He radioed Mr. Gravy about a stripped fixture or about you. */
  'custodian:report': {
    name: string;
    about: 'fixture' | 'player';
    fixtureName?: string;
    pos: Vec2;
  };
  /** Walked on a wet floor. */
  'player:squeak': { pos: Vec2 };
  'coworker:found': { warnings: number };
  'ability:activated': { abilityId: string };
  'ability:ready': { abilityId: string };
  'shift:ended': ShiftSummary;
  'xp:gained': { amount: number; reason: string };
  'gadget:used': { id: string; pos: Vec2 };
  'gadget:failed': { id: string; reason: string };
  'noise:made': { pos: Vec2 };
  'player:talkedOut': { confiscated: number };
}

export interface PromptSnapshot {
  kind: InteractionKind;
  label: string;
  verb: string;
  enabled: boolean;
  reason?: string;
  progress: number;
}

export interface AbilitySnapshot {
  id: string;
  name: string;
  kind: 'active' | 'passive';
  active: number;
  duration: number;
  cooldown: number;
  cooldownMax: number;
}

/** Everything the HUD needs, cheap to copy. */
export interface ShiftSnapshot {
  status: ShiftStatus;
  day: number;
  timeLeft: number;
  duration: number;
  warnings: number;
  maxWarnings: number;
  earned: number;
  bag: Bag;
  roomName: string;
  prompt: PromptSnapshot | null;
  stamina: number;
  staminaMax: number;
  ability: AbilitySnapshot | null;
  bossMode: BossMode;
  /** Highest detection meter among NPCs watching the player (0..1). */
  detection: number;
  escalation: number;
  suspicious: boolean;
  grace: number;
  /** Light level where the player stands (0 dark..1 lit). */
  light: number;
  /** XP earned so far this shift. */
  xp: number;
  inventory: Record<string, number>;
  /** Seconds of free sprint left from an energy drink. */
  boost: number;
}
