import type { ShiftSummary } from '@core/session/types';
import type { StateStorage } from 'zustand/middleware';
import { createCareerStore, migrateCareer, SAVE_KEY } from './careerStore';

function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const summary = (overrides: Partial<ShiftSummary> = {}): ShiftSummary => ({
  day: 1,
  endedBy: 'time',
  fired: false,
  warnings: 1,
  earned: 120,
  unitsSold: 4,
  soldByMetal: { copper: 2, brass: 2, aluminum: 0, steel: 0 },
  unitsCollected: 4.5,
  unitsLost: 0.5,
  timesCaught: 1,
  coworkerFound: false,
  maxEscalation: 2,
  ...overrides,
});

describe('career store', () => {
  it('starts a career, banks shift earnings and advances the day', () => {
    const store = createCareerStore(memoryStorage);
    store.getState().startCareer('dalton');
    store.getState().applyShiftResult(summary());
    const s = store.getState();
    expect(s).toMatchObject({
      active: true,
      characterId: 'dalton',
      day: 2,
      cash: 120,
      warnings: 1,
      totalEarned: 120,
    });
  });

  it('does not advance the day when fired', () => {
    const store = createCareerStore(memoryStorage);
    store.getState().startCareer('dunkin');
    store.getState().applyShiftResult(summary({ fired: true, warnings: 3 }));
    expect(store.getState()).toMatchObject({ fired: true, day: 1 });
  });

  it('purchases upgrades in order when affordable', () => {
    const store = createCareerStore(memoryStorage);
    store.getState().startCareer('tomothy');
    store.getState().applyShiftResult(summary({ earned: 100 }));
    expect(store.getState().purchase('backpack')).toEqual({ ok: false, reason: 'locked' });
    expect(store.getState().purchase('cardboard-box')).toEqual({ ok: true });
    expect(store.getState().cash).toBe(50);
    expect(store.getState().ownedUpgrades).toEqual(['cardboard-box']);
    expect(store.getState().purchase('backpack')).toEqual({ ok: false, reason: 'funds' });
  });

  it('persists to storage with a version', () => {
    const storage = memoryStorage();
    const store = createCareerStore(() => storage);
    store.getState().startCareer('dalton');
    const saved = JSON.parse(storage.data.get(SAVE_KEY)!);
    expect(saved.version).toBe(1);
    expect(saved.state.characterId).toBe('dalton');
    expect(saved.state.startCareer).toBeUndefined();
  });

  it('migrates old or corrupt saves safely', () => {
    expect(migrateCareer(null, 0).day).toBe(1);
    expect(migrateCareer({ cash: 50, ownedUpgrades: 'bad' }, 0)).toMatchObject({
      cash: 50,
      ownedUpgrades: [],
    });
  });
});
