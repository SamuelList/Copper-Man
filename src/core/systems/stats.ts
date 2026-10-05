import { BALANCE } from '../content/balance';
import { UPGRADES } from '../content/upgrades';
import type { CharacterDef, EffectiveStats, UpgradeCategory, UpgradeDef } from '../model/types';

/** Highest owned tier per category — tiers replace each other rather than stack. */
export function activeUpgrades(
  owned: readonly string[],
): Partial<Record<UpgradeCategory, UpgradeDef>> {
  const active: Partial<Record<UpgradeCategory, UpgradeDef>> = {};
  for (const id of owned) {
    const def = UPGRADES.find(id);
    if (!def) continue; // tolerate stale ids from old saves
    const current = active[def.category];
    if (!current || def.tier > current.tier) active[def.category] = def;
  }
  return active;
}

export function deriveStats(character: CharacterDef, owned: readonly string[]): EffectiveStats {
  const up = activeUpgrades(owned);
  const speedMult = up.boots?.effect.speedMult ?? 1;
  const walkSpeed = BALANCE.player.walkSpeed[character.stats.speed] * speedMult;
  const unlockSeconds = Math.max(
    BALANCE.doors.minUnlockSeconds,
    BALANCE.doors.baseUnlockSeconds - (up.keys?.effect.unlockReduction ?? 0),
  );
  return {
    walkSpeed,
    sprintSpeed: walkSpeed * BALANCE.player.sprintMult,
    staminaSeconds: BALANCE.player.staminaSeconds + (up.boots?.effect.staminaBonus ?? 0),
    scrapRateMult: up.tools?.effect.scrapRateMult ?? 1,
    bagCapacity:
      BALANCE.bag.capacityByCarry[character.stats.carry] + (up.bag?.effect.capacityBonus ?? 0),
    unlockSeconds,
  };
}
