import type { BossMode } from '../ai/bossBrain';
import type { LevelDef } from '../level/types';
import type { Bag, BagContents, Box, FixtureDef, MetalId, TilePos, Vec2 } from '../model/types';

export interface ShiftConfig {
  level: LevelDef;
  characterId: string;
  ownedUpgrades: readonly string[];
  day: number;
  /** Warnings carried in from previous shifts. */
  warnings: number;
  seed: number;
  durationSeconds?: number;
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
  /** Desired crouch state (the input layer handles toggling). */
  crouch: boolean;
}

export interface PlayerState {
  pos: Vec2;
  facing: number;
  moving: boolean;
  sprinting: boolean;
  crouching: boolean;
  stamina: number;
  staminaDelay: number;
  /** Seconds of post-catch protection remaining. */
  grace: number;
  abilityActive: number;
  abilityCooldown: number;
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
}

export interface DoorState {
  id: string;
  tile: TilePos;
  locked: boolean;
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
}

export interface ShiftEvents {
  'scrap:collected': {
    fixtureId: string;
    fixtureName: string;
    metal: MetalId;
    amount: number;
    overflow: number;
  };
  'scrap:sold': { units: number; value: number; contents: BagContents };
  'fixture:recharged': { fixtureId: string };
  'door:unlocked': { doorId: string; by: 'player' | 'boss' };
  'player:caught': { warnings: number; fired: boolean; confiscated: number };
  'player:excused': Record<string, never>;
  'boss:mode': { mode: BossMode; previous: BossMode };
  'boss:escalated': { level: number };
  'student:alert': { studentId: string; pos: Vec2 };
  'coworker:found': { warnings: number };
  'ability:activated': { abilityId: string };
  'ability:ready': { abilityId: string };
  'shift:ended': ShiftSummary;
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
  crouching: boolean;
  /** Light level where the player stands (0 dark..1 lit). */
  light: number;
}
