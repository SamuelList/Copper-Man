import { BALANCE } from '../content/balance';
import type { CharacterDef, EffectiveStats, FixtureDef } from '../model/types';
import { clamp, inRange, round2 } from '../util/math';
import type { Rng } from '../util/rng';

const S = BALANCE.scrapping;

/** Repair stat plus the board's trade bonus: +0.5 on a matching trade, +0.25 otherwise. */
export function effectiveRepair(character: CharacterDef, fixture: FixtureDef): number {
  const matches = character.trade !== null && character.trade === fixture.type;
  return character.stats.repair + (matches ? S.tradeMatchBonus : S.tradeOtherBonus);
}

/** Seconds to strip a fixture for this worker, after tool upgrades. */
export function scrapDuration(character: CharacterDef, fixture: FixtureDef, toolMult = 1): number {
  const rate = Math.max(
    S.minRate,
    1 + (effectiveRepair(character, fixture) - S.repairBaseline) * S.ratePerRepairPoint,
  );
  return fixture.workSeconds / (rate * toolMult);
}

export function rollYield(fixture: FixtureDef, rng: Rng): number {
  return round2(inRange(fixture.yield, rng.next()));
}

export function rollRecharge(fixture: FixtureDef, rng: Rng): number {
  return inRange(fixture.recharge, rng.next());
}

/** How a pull went: nothing usable, part of it, all of it, or more than expected. */
export type ScrapQuality = 'botched' | 'rough' | 'clean' | 'bonus';

export interface ScrapOutcome {
  quality: ScrapQuality;
  /** Share of the rolled yield actually recovered (0 botched, ~0.4-0.9 rough, 1, >1 bonus). */
  fraction: number;
}

const O = S.outcome;

/** Efficiency for this worker on this fixture: gear + skills, plus how handy they are with it. */
export function scrapEfficiency(
  character: CharacterDef,
  fixture: FixtureDef,
  stats: Pick<EffectiveStats, 'efficiency'>,
): number {
  const handiness = (effectiveRepair(character, fixture) - S.repairBaseline) * O.perRepairPoint;
  return clamp(stats.efficiency + handiness, -O.maxEfficiency, O.maxEfficiency);
}

/** Map a 0..1 roll (already shifted by efficiency) to an outcome. */
export function outcomeFor(
  roll: number,
  stats: Pick<EffectiveStats, 'salvage' | 'noBotch'>,
): ScrapOutcome {
  const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
  if (roll < O.botchBelow && !stats.noBotch) return { quality: 'botched', fraction: 0 };
  if (roll < O.roughBelow) {
    const t = (roll - O.botchBelow) / (O.roughBelow - O.botchBelow);
    const fraction = Math.min(0.95, lerp(O.rough.min, O.rough.max, t) + stats.salvage * 0.5);
    return { quality: 'rough', fraction: round2(fraction) };
  }
  if (roll < O.cleanBelow) return { quality: 'clean', fraction: 1 };
  const t = (roll - O.cleanBelow) / (1 + O.maxEfficiency - O.cleanBelow);
  return { quality: 'bonus', fraction: round2(lerp(O.bonus.min, O.bonus.max, t) + stats.salvage) };
}

export function rollScrapOutcome(
  efficiency: number,
  stats: Pick<EffectiveStats, 'salvage' | 'noBotch'>,
  rng: Rng,
): ScrapOutcome {
  return outcomeFor(rng.next() + efficiency, stats);
}

/** Chances of each outcome at this efficiency, for the shop and HUD. */
export function scrapOdds(efficiency: number, noBotch: boolean): Record<ScrapQuality, number> {
  const band = (lo: number, hi: number) =>
    clamp(hi - efficiency, 0, 1) - clamp(lo - efficiency, 0, 1);
  // Open-ended bands: a negative efficiency can push rolls below 0, a positive one above 1.
  const low = -1;
  const high = 2;
  return {
    botched: noBotch ? 0 : band(low, O.botchBelow),
    rough: band(noBotch ? low : O.botchBelow, O.roughBelow),
    clean: band(O.roughBelow, O.cleanBelow),
    bonus: band(O.cleanBelow, high),
  };
}
