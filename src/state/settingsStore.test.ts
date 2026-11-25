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
    expect(JSON.parse(storage.data.get(SETTINGS_KEY)!).state).toEqual({
      view: 'fps',
      lookSpeed: 'normal',
    });
    expect(createSettingsStore(() => storage).getState().view).toBe('fps');
  });

  it('remembers how fast you like to look around', () => {
    const storage = memoryStorage();
    const store = createSettingsStore(() => storage);
    expect(store.getState().lookSpeed).toBe('normal');
    store.getState().setLookSpeed('fast');
    expect(createSettingsStore(() => storage).getState().lookSpeed).toBe('fast');
  });

  it('carries a save from before look speed existed', () => {
    const storage = memoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ state: { view: 'fps' }, version: 1 }));
    expect(createSettingsStore(() => storage).getState()).toMatchObject({
      view: 'fps',
      lookSpeed: 'normal',
    });
  });

  it('falls back to the defaults for anything it does not recognise', () => {
    const fresh = { view: 'iso', lookSpeed: 'normal' };
    expect(migrateSettings(null)).toEqual(fresh);
    expect(migrateSettings({ view: 'sideways', lookSpeed: 'ludicrous' })).toEqual(fresh);
    expect(migrateSettings({ view: 'fps', lookSpeed: 'slow' })).toEqual({
      view: 'fps',
      lookSpeed: 'slow',
    });
    // Not fooled by a name every object has.
    expect(migrateSettings({ lookSpeed: 'toString' }).lookSpeed).toBe('normal');
  });
});
