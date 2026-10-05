import { BALANCE } from '../content/balance';

/** Three warnings and you're fired. Hearts = warnings remaining. */
export function addWarning(warnings: number): { warnings: number; fired: boolean } {
  const next = Math.min(BALANCE.warnings.max, warnings + 1);
  return { warnings: next, fired: next >= BALANCE.warnings.max };
}

/** Finding the sleepy coworker recovers one heart. */
export const recoverHeart = (warnings: number) => Math.max(0, warnings - 1);

export const heartsLeft = (warnings: number) => BALANCE.warnings.max - warnings;
