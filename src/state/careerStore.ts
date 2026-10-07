import { CHARACTERS } from '@core/content/characters';
import type { ShiftSummary } from '@core/session/types';
import { addXp, canLearn, type SkillCheck } from '@core/systems/progression';
import { canBuyConsumable, canPurchase, type PurchaseCheck } from '@core/systems/shop';
import { deriveStats } from '@core/systems/stats';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/** Long-lived progress that survives between shifts and browser sessions. */
export interface CareerData {
  /** A career is in progress (false before the first hire and after reset). */
  active: boolean;
  characterId: string | null;
  day: number;
  cash: number;
  warnings: number;
  ownedUpgrades: string[];
  totalEarned: number;
  fired: boolean;
  lastSummary: ShiftSummary | null;
  /** Worker level (starts at 1) and XP toward the next one. */
  level: number;
  xp: number;
  /** Unspent skill points (one per level). */
  skillPoints: number;
  skills: string[];
  /** Gadgets on hand, by consumable id. */
  inventory: Record<string, number>;
  /** Levels gained by the last shift (for the summary screen). */
  lastLevelsGained: number;
  /** Explored tiles per level id (see core/systems/exploration). */
  explored: Record<string, string>;
}

export interface CareerActions {
  startCareer(characterId: string): void;
  applyShiftResult(summary: ShiftSummary): void;
  purchase(upgradeId: string): PurchaseCheck;
  buyConsumable(id: string): PurchaseCheck;
  learnSkill(skillId: string): SkillCheck;
  reset(): void;
}

export type CareerStore = CareerData & CareerActions;

export const SAVE_KEY = 'copper-man/career';
export const SAVE_VERSION = 4;

export const initialCareer = (): CareerData => ({
  active: false,
  characterId: null,
  day: 1,
  cash: 0,
  warnings: 0,
  ownedUpgrades: [],
  totalEarned: 0,
  fired: false,
  lastSummary: null,
  level: 1,
  xp: 0,
  skillPoints: 0,
  skills: [],
  inventory: {},
  lastLevelsGained: 0,
  explored: {},
});

/**
 * Upgrade old saves to the current shape. Add a step per version bump so existing players
 * never lose progress.
 */
export function migrateCareer(persisted: unknown, fromVersion: number): CareerData {
  const base = initialCareer();
  if (!persisted || typeof persisted !== 'object') return base;
  const data = { ...base, ...(persisted as Partial<CareerData>) };
  // Steps run in order, so a very old save gets every upgrade.
  if (fromVersion < 1) {
    // v0 had no upgrade list.
    data.ownedUpgrades = Array.isArray(data.ownedUpgrades) ? data.ownedUpgrades : [];
  }
  if (fromVersion < 2) {
    // v1 had no levels, skills or gadgets.
    Object.assign(data, {
      level: 1,
      xp: 0,
      skillPoints: 0,
      skills: [],
      inventory: {},
      lastLevelsGained: 0,
    });
    if (data.lastSummary) {
      data.lastSummary = { ...data.lastSummary, xp: [], xpTotal: 0, inventory: {} };
    }
  }
  if (fromVersion < 3) {
    // v2 had no exploration (and the school has since doubled in size).
    data.explored = {};
    if (data.lastSummary) {
      data.lastSummary = {
        ...data.lastSummary,
        levelId: 'school',
        explored: '',
        exploredFraction: 0,
        roomsDiscovered: [],
      };
    }
  }
  if (fromVersion < 4) {
    // v3 had crouching; its Low Rider skill became Rubber Soles.
    data.skills = (data.skills ?? []).map((id) => (id === 'low-rider' ? 'rubber-soles' : id));
  }
  return data;
}

/** Gear + skills for the hired worker, as the shop and HUD need them between shifts. */
export function careerStats(c: Pick<CareerData, 'characterId' | 'ownedUpgrades' | 'skills'>) {
  const character = CHARACTERS.find(c.characterId ?? '') ?? CHARACTERS.all[0]!;
  return deriveStats(character, c.ownedUpgrades, c.skills);
}

const shopDiscount = (c: CareerData) => careerStats(c).shopDiscount;

const noopStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

/** Storage that falls back to memory-only when localStorage is unavailable (private mode, tests). */
function safeLocalStorage(): StateStorage {
  try {
    const ls = globalThis.localStorage;
    const probe = '__copper_probe__';
    ls.setItem(probe, probe);
    ls.removeItem(probe);
    return ls;
  } catch {
    return noopStorage;
  }
}

export const createCareerStore = (storage: () => StateStorage = safeLocalStorage) =>
  create<CareerStore>()(
    persist(
      (set, get) => ({
        ...initialCareer(),

        startCareer: (characterId) => set({ ...initialCareer(), active: true, characterId }),

        applyShiftResult: (summary) =>
          set((s) => {
            const leveled = addXp({ level: s.level, xp: s.xp }, summary.xpTotal);
            return {
              cash: s.cash + summary.earned,
              totalEarned: s.totalEarned + summary.earned,
              warnings: summary.warnings,
              fired: summary.fired,
              day: summary.fired ? s.day : s.day + 1,
              lastSummary: summary,
              level: leveled.level,
              xp: leveled.xp,
              skillPoints: s.skillPoints + leveled.levelsGained,
              lastLevelsGained: leveled.levelsGained,
              inventory: { ...summary.inventory },
              explored: { ...s.explored, [summary.levelId]: summary.explored },
            };
          }),

        purchase: (upgradeId) => {
          const { ownedUpgrades, cash } = get();
          const check = canPurchase(upgradeId, ownedUpgrades, cash, shopDiscount(get()));
          if (check.ok) {
            set({ cash: cash - check.price, ownedUpgrades: [...ownedUpgrades, upgradeId] });
          }
          return check;
        },

        buyConsumable: (id) => {
          const { inventory, cash } = get();
          const check = canBuyConsumable(id, inventory, cash, shopDiscount(get()));
          if (check.ok) {
            set({
              cash: cash - check.price,
              inventory: { ...inventory, [id]: (inventory[id] ?? 0) + 1 },
            });
          }
          return check;
        },

        learnSkill: (skillId) => {
          const { skills, skillPoints } = get();
          const check = canLearn(skillId, skills, skillPoints);
          if (check.ok) {
            set({ skills: [...skills, skillId], skillPoints: skillPoints - check.cost });
          }
          return check;
        },

        reset: () => set(initialCareer()),
      }),
      {
        name: SAVE_KEY,
        version: SAVE_VERSION,
        storage: createJSONStorage(storage),
        migrate: migrateCareer,
        // Persist the data fields only (never the action functions).
        partialize: (s) =>
          Object.fromEntries(
            Object.keys(initialCareer()).map((k) => [k, s[k as keyof CareerData]]),
          ) as unknown as CareerData,
      },
    ),
  );

export const useCareerStore = createCareerStore();
