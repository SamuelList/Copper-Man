import { BALANCE } from '../content/balance';
import { SKILLS } from '../content/skills';

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level: number) =>
  BALANCE.xp.firstLevel + (Math.max(1, level) - 1) * BALANCE.xp.perLevelIncrease;

export interface LevelState {
  level: number;
  /** XP earned toward the next level. */
  xp: number;
}

/** Add XP, rolling over as many levels as it pays for. Each level grants one skill point. */
export function addXp(state: LevelState, gained: number): LevelState & { levelsGained: number } {
  let { level, xp } = state;
  xp += Math.max(0, Math.round(gained));
  let levelsGained = 0;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    levelsGained++;
  }
  return { level, xp, levelsGained };
}

export type SkillCheck =
  { ok: true; cost: number } | { ok: false; reason: 'owned' | 'locked' | 'points' | 'unknown' };

/** A skill can be learned once, after any of its prerequisites, with enough points. */
export function canLearn(skillId: string, owned: readonly string[], points: number): SkillCheck {
  const def = SKILLS.find(skillId);
  if (!def) return { ok: false, reason: 'unknown' };
  if (owned.includes(skillId)) return { ok: false, reason: 'owned' };
  if (def.requires.length > 0 && !def.requires.some((r) => owned.includes(r))) {
    return { ok: false, reason: 'locked' };
  }
  if (points < def.cost) return { ok: false, reason: 'points' };
  return { ok: true, cost: def.cost };
}
