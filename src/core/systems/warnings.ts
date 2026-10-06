import { BALANCE } from '../content/balance';

/** Out of warnings (hearts) and you're fired. */
export function addWarning(
  warnings: number,
  max: number = BALANCE.warnings.max,
): { warnings: number; fired: boolean } {
  const next = Math.min(max, warnings + 1);
  return { warnings: next, fired: next >= max };
}

/** Finding the sleepy coworker recovers one heart. */
export const recoverHeart = (warnings: number) => Math.max(0, warnings - 1);

export const heartsLeft = (warnings: number, max: number = BALANCE.warnings.max) => max - warnings;
