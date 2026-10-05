import { UPGRADES } from '@core/content/upgrades';
import type { ShiftSummary } from '@core/session/types';
import { canPurchase, type PurchaseCheck } from '@core/systems/shop';
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
}

export interface CareerActions {
  startCareer(characterId: string): void;
  applyShiftResult(summary: ShiftSummary): void;
  purchase(upgradeId: string): PurchaseCheck;
  reset(): void;
}

export type CareerStore = CareerData & CareerActions;

export const SAVE_KEY = 'copper-man/career';
export const SAVE_VERSION = 1;

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
});

/**
 * Upgrade old saves to the current shape. Add a `case` per version bump so existing players
 * never lose progress.
 */
export function migrateCareer(persisted: unknown, fromVersion: number): CareerData {
  const base = initialCareer();
  if (!persisted || typeof persisted !== 'object') return base;
  const data = { ...base, ...(persisted as Partial<CareerData>) };
  switch (fromVersion) {
    case 0:
      // v0 had no upgrade list.
      data.ownedUpgrades = Array.isArray(data.ownedUpgrades) ? data.ownedUpgrades : [];
  }
  return data;
}

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
          set((s) => ({
            cash: s.cash + summary.earned,
            totalEarned: s.totalEarned + summary.earned,
            warnings: summary.warnings,
            fired: summary.fired,
            day: summary.fired ? s.day : s.day + 1,
            lastSummary: summary,
          })),

        purchase: (upgradeId) => {
          const { ownedUpgrades, cash } = get();
          const check = canPurchase(upgradeId, ownedUpgrades, cash);
          if (check.ok) {
            const cost = UPGRADES.get(upgradeId).cost;
            set({ cash: cash - cost, ownedUpgrades: [...ownedUpgrades, upgradeId] });
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
        partialize: ({
          active,
          characterId,
          day,
          cash,
          warnings,
          ownedUpgrades,
          totalEarned,
          fired,
          lastSummary,
        }) => ({
          active,
          characterId,
          day,
          cash,
          warnings,
          ownedUpgrades,
          totalEarned,
          fired,
          lastSummary,
        }),
      },
    ),
  );

export const useCareerStore = createCareerStore();
