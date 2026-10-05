import { BALANCE } from '../content/balance';
import type { CharacterDef, FixtureDef } from '../model/types';
import { inRange, round2 } from '../util/math';
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
