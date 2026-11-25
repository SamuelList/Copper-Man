import type { StateStorage } from 'zustand/middleware';
import { createSettingsStore, migrateSettings, SETTINGS_KEY } from './settingsStore';

function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('settingsStore', () => {
  it('starts top-down and switches between the two views', () => {
    const store = createSettingsStore(memoryStorage);
    expect(store.getState().view).toBe('iso');
    store.getState().toggleView();
    expect(store.getState().view).toBe('fps');
    store.getState().toggleView();
    expect(store.getState().view).toBe('iso');
    store.getState().setView('fps');
    expect(store.getState().view).toBe('fps');
  });

  it('remembers the view between sessions', () => {
    const storage = memoryStorage();
    createSettingsStore(() => storage)
      .getState()
      .setView('fps');
    expect(JSON.parse(storage.data.get(SETTINGS_KEY)!).state).toEqual({ view: 'fps' });
    expect(createSettingsStore(() => storage).getState().view).toBe('fps');
  });

  it('falls back to top-down for anything it does not recognise', () => {
    expect(migrateSettings(null)).toEqual({ view: 'iso' });
    expect(migrateSettings({ view: 'sideways' })).toEqual({ view: 'iso' });
    expect(migrateSettings({ view: 'fps' })).toEqual({ view: 'fps' });
  });
});
