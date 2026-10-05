import type { StatLevel } from '../model/types';

/**
 * Every tunable number in one place. Distances are in pixels at TILE_SIZE, times in seconds.
 */
export const TILE_SIZE = 32;

const stat = <T>(m: Record<StatLevel, T>) => m;

export const BALANCE = {
  shift: {
    durationSeconds: 300,
  },
  warnings: {
    max: 3,
  },
  player: {
    radius: TILE_SIZE * 0.32,
    walkSpeed: stat({ 1: 100, 2: 122, 3: 145 }),
    sprintMult: 1.5,
    staminaSeconds: 2.5,
    staminaRegenPerSecond: 0.6,
    staminaRegenDelay: 0.75,
    reach: TILE_SIZE * 1.15,
    caughtGraceSeconds: 3,
  },
  bag: {
    capacityByCarry: stat({ 1: 1.5, 2: 2, 3: 2.5 }),
  },
  scrapping: {
    /** Added to the Repair stat when the worker's trade matches the fixture type (board: +0.5). */
    tradeMatchBonus: 0.5,
    /** Added otherwise (board: "else +0.25"). */
    tradeOtherBonus: 0.25,
    /** Effective repair at which a fixture takes exactly its `workSeconds`. */
    repairBaseline: 2.25,
    /** Speed gained/lost per point of effective repair away from the baseline. */
    ratePerRepairPoint: 0.3,
    minRate: 0.4,
  },
  doors: {
    baseUnlockSeconds: 3,
    minUnlockSeconds: 0.5,
  },
  van: {
    depositSeconds: 0.75,
  },
  coworker: {
    wakeSeconds: 1.2,
  },
  npc: {
    walkSpeed: stat({ 1: 55, 2: 78, 3: 100 }),
    turnRate: Math.PI * 2.5,
    catchRadius: TILE_SIZE * 0.7,
    vision: {
      range: stat({ 1: TILE_SIZE * 4.5, 2: TILE_SIZE * 6.5, 3: TILE_SIZE * 8 }),
      fovDegrees: stat({ 1: 70, 2: 80, 3: 95 }),
      /** Detection meter gained per second at max range (doubles up close). */
      fillRate: stat({ 1: 0.6, 2: 0.85, 3: 1.2 }),
      decayRate: 0.45,
    },
  },
  boss: {
    chaseMult: 1.6,
    investigateMult: 1.3,
    repathSeconds: 0.35,
    loseSightSeconds: 2.5,
    searchSeconds: 3.5,
    /** Escalation ("boss gets faster after x point"). */
    escalation: {
      perLevelMult: 0.1,
      timeFractions: [0.5, 0.8],
      securedScrapUnits: [3, 6],
      perDayMult: 0.04,
      maxDayBonus: 0.4,
    },
  },
  student: {
    idleSeconds: { min: 1.5, max: 4 },
    alarmSeconds: 2,
    alertCooldownSeconds: 8,
  },
} as const;
