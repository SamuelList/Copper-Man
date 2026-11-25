import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

/** Which camera a shift is seen through: the fixed top-down diorama, or the worker's own eyes. */
export type ViewMode = 'iso' | 'fps';

export const VIEW_NAMES: Record<ViewMode, string> = {
  iso: 'Top-down',
  fps: 'First person',
};

export interface SettingsData {
  view: ViewMode;
}

interface SettingsStore extends SettingsData {
  setView(view: ViewMode): void;
  toggleView(): void;
}

export const SETTINGS_KEY = 'copper-man/settings';
export const SETTINGS_VERSION = 1;

const defaults = (): SettingsData => ({ view: 'iso' });

/** Anything unrecognised in an old or hand-edited save falls back to the default. */
export function migrateSettings(persisted: unknown): SettingsData {
  const data = (
    persisted && typeof persisted === 'object' ? persisted : {}
  ) as Partial<SettingsData>;
  return { view: data.view === 'fps' ? 'fps' : 'iso' };
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
      }),
      {
        name: SETTINGS_KEY,
        version: SETTINGS_VERSION,
        storage: createJSONStorage(storage),
        migrate: migrateSettings,
        partialize: (s) => ({ view: s.view }),
      },
    ),
  );

export const useSettings = createSettingsStore();
