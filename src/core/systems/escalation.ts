import { BALANCE } from '../content/balance';

const E = BALANCE.boss.escalation;

export interface EscalationInput {
  /** 0..1 of the shift elapsed. */
  timeFraction: number;
  /** Scrap units sold at the van this shift. */
  securedUnits: number;
  day: number;
}

/** "Boss gets faster after x point": one level per threshold passed. */
export function escalationLevel({ timeFraction, securedUnits }: EscalationInput): number {
  const byTime = E.timeFractions.filter((t) => timeFraction >= t).length;
  const byScrap = E.securedScrapUnits.filter((u) => securedUnits >= u).length;
  return byTime + byScrap;
}

export function bossSpeedMult(input: EscalationInput): number {
  const dayBonus = Math.min(E.maxDayBonus, Math.max(0, input.day - 1) * E.perDayMult);
  return 1 + escalationLevel(input) * E.perLevelMult + dayBonus;
}
