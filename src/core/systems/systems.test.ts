import { BALANCE } from '../content/balance';
import { CHARACTERS } from '../content/characters';
import { FIXTURES } from '../content/fixtures';
import { createRng } from '../util/rng';
import { addToBag, bagFree, bagTotal, createBag, emptyBag } from './bag';
import { saleValue } from './economy';
import { bossSpeedMult, escalationLevel } from './escalation';
import { effectiveRepair, rollYield, scrapDuration } from './scrapping';
import { canPurchase } from './shop';
import { activeUpgrades, deriveStats } from './stats';
import { addWarning, heartsLeft, recoverHeart } from './warnings';

const dalton = CHARACTERS.get('dalton');
const tomothy = CHARACTERS.get('tomothy');
const dunkin = CHARACTERS.get('dunkin');
const fountain = FIXTURES.get('drinking-fountain');
const heater = FIXTURES.get('wall-heater');
const toilet = FIXTURES.get('toilet');

describe('scrapping', () => {
  it('applies the board trade bonus: +0.5 on matching trade, +0.25 otherwise', () => {
    expect(effectiveRepair(tomothy, fountain)).toBe(3.5); // plumber on plumbing
    expect(effectiveRepair(dalton, heater)).toBe(2.5); // hvac on hvac
    expect(effectiveRepair(dalton, fountain)).toBe(2.25); // else
    expect(effectiveRepair(dunkin, heater)).toBe(1.25); // no trade
  });

  it('makes higher repair scrap faster, and tools faster still', () => {
    const slow = scrapDuration(dunkin, fountain);
    const fast = scrapDuration(tomothy, fountain);
    expect(fast).toBeLessThan(slow);
    expect(scrapDuration(dalton, fountain)).toBeCloseTo(fountain.workSeconds); // baseline worker
    expect(scrapDuration(tomothy, fountain, 1.5)).toBeCloseTo(fast / 1.5);
  });

  it('rolls yields within the fixture range', () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const y = rollYield(toilet, rng);
      expect(y).toBeGreaterThanOrEqual(0.25);
      expect(y).toBeLessThanOrEqual(0.75);
    }
    expect(rollYield(fountain, rng)).toBe(1);
  });
});

describe('bag', () => {
  it('matches the board example: bag 2, holding 0.25, left 1.75', () => {
    const { bag } = addToBag(createBag(2), 'copper', 0.25);
    expect(bagTotal(bag)).toBe(0.25);
    expect(bagFree(bag)).toBe(1.75);
  });

  it('overflows past capacity and empties', () => {
    let bag = createBag(1.5);
    bag = addToBag(bag, 'brass', 1).bag;
    const r = addToBag(bag, 'copper', 1);
    expect(r.added).toBe(0.5);
    expect(r.overflow).toBe(0.5);
    expect(bagTotal(r.bag)).toBe(1.5);
    expect(bagTotal(emptyBag(r.bag))).toBe(0);
  });
});

describe('economy', () => {
  it('values copper > brass > aluminum > steel', () => {
    const unit = (m: 'copper' | 'brass' | 'aluminum' | 'steel') =>
      saleValue({ copper: 0, brass: 0, aluminum: 0, steel: 0, [m]: 1 });
    expect(unit('copper')).toBeGreaterThan(unit('brass'));
    expect(unit('brass')).toBeGreaterThan(unit('aluminum'));
    expect(unit('aluminum')).toBeGreaterThan(unit('steel'));
  });
});

describe('stats + upgrades', () => {
  it('derives stats from character levels', () => {
    const s = deriveStats(dalton, []);
    expect(s.walkSpeed).toBe(BALANCE.player.walkSpeed[3]);
    expect(s.bagCapacity).toBe(BALANCE.bag.capacityByCarry[1]);
    expect(s.unlockSeconds).toBe(BALANCE.doors.baseUnlockSeconds);
    expect(deriveStats(tomothy, []).bagCapacity).toBe(2);
  });

  it('applies the highest owned tier per category', () => {
    const owned = ['cardboard-box', 'backpack', 'cowboy-boots', 'efficient-key-ring', 'master-key'];
    expect(activeUpgrades(owned).bag?.id).toBe('backpack');
    const s = deriveStats(dunkin, owned);
    expect(s.bagCapacity).toBe(BALANCE.bag.capacityByCarry[3] + 1);
    expect(s.walkSpeed).toBeCloseTo(BALANCE.player.walkSpeed[2] * 1.1);
    expect(s.unlockSeconds).toBe(1);
  });

  it('ignores unknown upgrade ids from stale saves', () => {
    expect(() => deriveStats(dalton, ['retired-item'])).not.toThrow();
  });
});

describe('shop', () => {
  it('requires tiers in order, once, with enough cash', () => {
    expect(canPurchase('backpack', [], 999)).toEqual({ ok: false, reason: 'locked' });
    expect(canPurchase('cardboard-box', [], 10)).toEqual({ ok: false, reason: 'funds' });
    expect(canPurchase('cardboard-box', [], 50)).toEqual({ ok: true });
    expect(canPurchase('cardboard-box', ['cardboard-box'], 999)).toEqual({
      ok: false,
      reason: 'owned',
    });
    expect(canPurchase('backpack', ['cardboard-box'], 999)).toEqual({ ok: true });
  });
});

describe('warnings', () => {
  it('fires on the third warning and recovers hearts', () => {
    expect(addWarning(0)).toEqual({ warnings: 1, fired: false });
    expect(addWarning(2)).toEqual({ warnings: 3, fired: true });
    expect(recoverHeart(2)).toBe(1);
    expect(recoverHeart(0)).toBe(0);
    expect(heartsLeft(1)).toBe(2);
  });
});

describe('escalation', () => {
  it('speeds the boss up after time and scrap thresholds, and on later days', () => {
    expect(escalationLevel({ timeFraction: 0, securedUnits: 0, day: 1 })).toBe(0);
    expect(escalationLevel({ timeFraction: 0.85, securedUnits: 6, day: 1 })).toBe(4);
    const day1 = bossSpeedMult({ timeFraction: 0, securedUnits: 0, day: 1 });
    const day5 = bossSpeedMult({ timeFraction: 0, securedUnits: 0, day: 5 });
    expect(day1).toBe(1);
    expect(day5).toBeGreaterThan(day1);
  });
});
