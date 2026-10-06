import type { ShiftSummary } from '@core/session/types';
import type { StateStorage } from 'zustand/middleware';
import { createCareerStore, migrateCareer, SAVE_KEY, SAVE_VERSION } from './careerStore';

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
  xp: [{ label: 'Sales', amount: 48 }],
  xpTotal: 48,
  inventory: {},
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
    expect(store.getState().purchase('cardboard-box')).toEqual({ ok: true, price: 50 });
    expect(store.getState().cash).toBe(50);
    expect(store.getState().ownedUpgrades).toEqual(['cardboard-box']);
    expect(store.getState().purchase('backpack')).toEqual({ ok: false, reason: 'funds' });
  });

  it('persists to storage with a version', () => {
    const storage = memoryStorage();
    const store = createCareerStore(() => storage);
    store.getState().startCareer('dalton');
    const saved = JSON.parse(storage.data.get(SAVE_KEY)!);
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved.state.characterId).toBe('dalton');
    expect(saved.state.startCareer).toBeUndefined();
  });

  it('levels up from shift XP and spends skill points', () => {
    const store = createCareerStore(memoryStorage);
    store.getState().startCareer('dalton');
    store.getState().applyShiftResult(summary({ xpTotal: 260 }));
    // 100 to reach level 2, 150 more to reach 3, 10 left over.
    expect(store.getState()).toMatchObject({
      level: 3,
      xp: 10,
      skillPoints: 2,
      lastLevelsGained: 2,
    });
    expect(store.getState().learnSkill('night-owl')).toEqual({ ok: false, reason: 'locked' });
    expect(store.getState().learnSkill('soft-steps')).toEqual({ ok: true, cost: 1 });
    expect(store.getState().learnSkill('night-owl')).toEqual({ ok: true, cost: 1 });
    expect(store.getState().learnSkill('low-rider')).toEqual({ ok: false, reason: 'points' });
    expect(store.getState()).toMatchObject({ skills: ['soft-steps', 'night-owl'], skillPoints: 0 });
  });

  it('buys gadgets, applies the coupon discount, and keeps leftovers from the shift', () => {
    const store = createCareerStore(memoryStorage);
    store.getState().startCareer('dalton');
    store.getState().applyShiftResult(summary({ earned: 100 }));
    expect(store.getState().buyConsumable('energy-drink')).toEqual({ ok: true, price: 20 });
    expect(store.getState().inventory).toEqual({ 'energy-drink': 1 });
    store.setState({ skills: ['haggler', 'coupon-clipper'] });
    expect(store.getState().buyConsumable('energy-drink')).toEqual({ ok: true, price: 17 });
    expect(store.getState().cash).toBe(63);
    store.getState().applyShiftResult(summary({ earned: 0, inventory: { 'energy-drink': 1 } }));
    expect(store.getState().inventory).toEqual({ 'energy-drink': 1 });
  });

  it('migrates old or corrupt saves safely', () => {
    expect(migrateCareer(null, 0).day).toBe(1);
    expect(migrateCareer({ cash: 50, ownedUpgrades: 'bad' }, 0)).toMatchObject({
      cash: 50,
      ownedUpgrades: [],
    });
  });

  it('migrates a v1 save to levels and skills without losing progress', () => {
    const v1 = {
      active: true,
      characterId: 'tomothy',
      day: 4,
      cash: 310,
      ownedUpgrades: ['backpack'],
    };
    expect(migrateCareer(v1, 1)).toMatchObject({
      day: 4,
      cash: 310,
      ownedUpgrades: ['backpack'],
      level: 1,
      xp: 0,
      skillPoints: 0,
      skills: [],
      inventory: {},
    });
  });
});
