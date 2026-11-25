import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/** Which camera a shift is seen through: the fixed top-down diorama, or the worker's own eyes. */
export type ViewMode = 'iso' | 'fps';

export const VIEW_NAMES: Record<ViewMode, string> = {
  iso: 'Top-down',
  fps: 'First person',
};

/** How fast looking around turns you in first person, by thumb or by mouse. */
export type LookSpeed = 'slow' | 'normal' | 'fast';

export const LOOK_SPEEDS: Record<LookSpeed, { name: string; scale: number }> = {
  slow: { name: 'Slow', scale: 0.65 },
  normal: { name: 'Normal', scale: 1 },
  fast: { name: 'Fast', scale: 1.5 },
};

export interface SettingsData {
  view: ViewMode;
  lookSpeed: LookSpeed;
}

interface SettingsStore extends SettingsData {
  setView(view: ViewMode): void;
  toggleView(): void;
  setLookSpeed(lookSpeed: LookSpeed): void;
}

export const SETTINGS_KEY = 'copper-man/settings';
export const SETTINGS_VERSION = 2;

const defaults = (): SettingsData => ({ view: 'iso', lookSpeed: 'normal' });

/** Anything unrecognised in an old or hand-edited save falls back to the default. */
export function migrateSettings(persisted: unknown): SettingsData {
  const data = (persisted && typeof persisted === 'object' ? persisted : {}) as Partial<
    Record<keyof SettingsData, unknown>
  >;
  return {
    view: data.view === 'fps' ? 'fps' : 'iso',
    lookSpeed:
      Object.keys(LOOK_SPEEDS).find((speed): speed is LookSpeed => speed === data.lookSpeed) ??
      'normal',
  };
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

/**
 * How the player likes to play, kept apart from the career save: it survives a new career, and
 * a change of camera never needs a save migration.
 */
export const createSettingsStore = (storage: () => StateStorage = safeLocalStorage) =>
  create<SettingsStore>()(
    persist(
      (set) => ({
        ...defaults(),
        setView: (view) => set({ view }),
        toggleView: () => set((s) => ({ view: s.view === 'iso' ? 'fps' : 'iso' })),
        setLookSpeed: (lookSpeed) => set({ lookSpeed }),
      }),
      {
        name: SETTINGS_KEY,
        version: SETTINGS_VERSION,
        storage: createJSONStorage(storage),
        migrate: migrateSettings,
        partialize: (s) => ({ view: s.view, lookSpeed: s.lookSpeed }),
      },
    ),
  );

export const useSettings = createSettingsStore();
