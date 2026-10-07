import { BALANCE, TILE_SIZE } from '../content/balance';
import { CHARACTERS } from '../content/characters';
import { FIXTURES } from '../content/fixtures';
import { createRng } from '../util/rng';
import { addToBag, bagFree, bagTotal, createBag, emptyBag } from './bag';
import { saleValue } from './economy';
import { bossSpeedMult, escalationLevel } from './escalation';
import {
  effectiveRepair,
  outcomeFor,
  rollScrapOutcome,
  rollYield,
  scrapDuration,
  scrapEfficiency,
  scrapOdds,
} from './scrapping';
import { canBuyConsumable, canPurchase, discounted } from './shop';
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
    expect(() => deriveStats(dalton, ['retired-item', 'retired-skill'])).not.toThrow();
    expect(() => deriveStats(dalton, [], ['retired-skill'])).not.toThrow();
  });

  it('stacks gear and skills: multipliers multiply, bonuses add', () => {
    const base = deriveStats(dalton, []);
    const s = deriveStats(
      dalton,
      ['work-gloves', 'mechanics-gloves', 'scrapyard-card', 'walkie-talkie'],
      ['soft-steps', 'smooth-hands', 'ghost', 'haggler', 'union-rep', 'overtime', 'rubber-soles'],
    );
    // Only the best gloves count, then Smooth Hands on top.
    expect(s.scrapNoticeMult).toBeCloseTo(0.6 * 0.75);
    expect(s.noticeMult).toBeCloseTo(0.9 * 0.85);
    expect(s.decayMult).toBe(2);
    expect(s.saleMult).toBeCloseTo(1.1 * 1.1);
    expect(s.hearingRange).toBe(base.hearingRange + 3 * TILE_SIZE);
    expect(s.maxWarnings).toBe(BALANCE.warnings.max + 1);
    expect(s.shiftSeconds).toBe(BALANCE.shift.durationSeconds + 60);
    expect(s.noiseMult).toBe(0.5);
    expect(base.noiseMult).toBe(1);
    expect(base.carryNoticeMult).toBe(1);
  });
});

describe('shop', () => {
  it('requires tiers in order, once, with enough cash', () => {
    expect(canPurchase('backpack', [], 999)).toEqual({ ok: false, reason: 'locked' });
    expect(canPurchase('cardboard-box', [], 10)).toEqual({ ok: false, reason: 'funds' });
    expect(canPurchase('cardboard-box', [], 50)).toEqual({ ok: true, price: 50 });
    expect(canPurchase('cardboard-box', ['cardboard-box'], 999)).toEqual({
      ok: false,
      reason: 'owned',
    });
    expect(canPurchase('backpack', ['cardboard-box'], 999)).toMatchObject({ ok: true });
  });

  it('applies the coupon discount to the price and the cash check', () => {
    expect(discounted(100, 0.15)).toBe(85);
    expect(canPurchase('cardboard-box', [], 45, 0.15)).toEqual({ ok: true, price: 43 });
    expect(canPurchase('cardboard-box', [], 40, 0.15)).toEqual({ ok: false, reason: 'funds' });
  });

  it('stacks gadgets up to their limit', () => {
    expect(canBuyConsumable('energy-drink', {}, 100)).toEqual({ ok: true, price: 20 });
    expect(canBuyConsumable('energy-drink', { 'energy-drink': 3 }, 100)).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(canBuyConsumable('energy-drink', {}, 5)).toEqual({ ok: false, reason: 'funds' });
    expect(canBuyConsumable('jetpack', {}, 999)).toEqual({ ok: false, reason: 'unknown' });
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

  it('takes one more warning with an extra heart', () => {
    expect(addWarning(2, 4)).toEqual({ warnings: 3, fired: false });
    expect(addWarning(3, 4)).toEqual({ warnings: 4, fired: true });
    expect(heartsLeft(1, 4)).toBe(3);
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

describe('scrap efficiency', () => {
  const plain = { salvage: 0, noBotch: false };

  it('maps a roll to botched, rough, clean or bonus', () => {
    expect(outcomeFor(0.05, plain)).toEqual({ quality: 'botched', fraction: 0 });
    const rough = outcomeFor(0.3, plain);
    expect(rough.quality).toBe('rough');
    expect(rough.fraction).toBeGreaterThan(0.4);
    expect(rough.fraction).toBeLessThan(0.9);
    expect(outcomeFor(0.6, plain)).toEqual({ quality: 'clean', fraction: 1 });
    expect(outcomeFor(0.95, plain).quality).toBe('bonus');
    expect(outcomeFor(0.95, plain).fraction).toBeGreaterThan(1.2);
  });

  it('better tools and skills shift the odds toward clean pulls and bonus finds', () => {
    const base = scrapOdds(0, false);
    const geared = scrapOdds(0.25, false);
    for (const odds of [base, geared]) {
      expect(odds.botched + odds.rough + odds.clean + odds.bonus).toBeCloseTo(1);
    }
    expect(base.botched).toBeCloseTo(0.12);
    expect(geared.botched).toBe(0);
    expect(geared.bonus).toBeGreaterThan(base.bonus * 3);
    expect(scrapOdds(0, true).botched).toBe(0);
  });

  it('Master Scrapper never botches, and salvage makes every partial pull bigger', () => {
    expect(outcomeFor(0.01, { salvage: 0, noBotch: true }).quality).toBe('rough');
    expect(outcomeFor(0.3, { salvage: 0.2, noBotch: false }).fraction).toBeGreaterThan(
      outcomeFor(0.3, plain).fraction,
    );
  });

  it('folds gear, skills and the worker into efficiency', () => {
    const s = deriveStats(tomothy, ['ten-in-one-screwdriver', 'pocket-plyers'], ['steady-hands']);
    expect(s.efficiency).toBeCloseTo(0.1 + 0.06);
    // A plumber on a fountain beats a jack-of-no-trades on a heater.
    expect(scrapEfficiency(tomothy, fountain, s)).toBeGreaterThan(
      scrapEfficiency(dunkin, heater, s),
    );
  });

  it('over many jobs, efficiency means more metal per strip', () => {
    const average = (efficiency: number) => {
      const rng = createRng(9);
      let sum = 0;
      for (let i = 0; i < 2000; i++) sum += rollScrapOutcome(efficiency, plain, rng).fraction;
      return sum / 2000;
    };
    expect(average(0)).toBeLessThan(0.95);
    expect(average(0.25)).toBeGreaterThan(average(0) + 0.1);
  });
});
