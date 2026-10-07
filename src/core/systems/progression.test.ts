import { BALANCE } from '../content/balance';
import { SKILL_TREES, SKILLS, skillsInTree } from '../content/skills';
import { addXp, canLearn, xpToNext } from './progression';

describe('progression', () => {
  it('needs more XP for each level', () => {
    expect(xpToNext(1)).toBe(BALANCE.xp.firstLevel);
    expect(xpToNext(2)).toBe(BALANCE.xp.firstLevel + BALANCE.xp.perLevelIncrease);
    expect(xpToNext(3)).toBeGreaterThan(xpToNext(2));
  });

  it('rolls over several levels from one big haul', () => {
    const big = xpToNext(1) + xpToNext(2) + 10;
    expect(addXp({ level: 1, xp: 0 }, big)).toEqual({ level: 3, xp: 10, levelsGained: 2 });
    expect(addXp({ level: 1, xp: 0 }, 5)).toEqual({ level: 1, xp: 5, levelsGained: 0 });
    expect(addXp({ level: 2, xp: 3 }, -50)).toEqual({ level: 2, xp: 3, levelsGained: 0 });
  });

  it('unlocks a skill once any prerequisite is owned', () => {
    expect(canLearn('soft-steps', [], 1)).toEqual({ ok: true, cost: 1 });
    expect(canLearn('soft-steps', ['soft-steps'], 1)).toEqual({ ok: false, reason: 'owned' });
    expect(canLearn('night-owl', [], 5)).toEqual({ ok: false, reason: 'locked' });
    expect(canLearn('soft-steps', [], 0)).toEqual({ ok: false, reason: 'points' });
    // The fork rejoins: either branch opens Smooth Hands.
    expect(canLearn('smooth-hands', ['soft-steps', 'rubber-soles'], 1)).toMatchObject({ ok: true });
    expect(canLearn('ghost', ['smooth-hands'], 1)).toEqual({ ok: false, reason: 'points' });
    expect(canLearn('ghost', ['smooth-hands'], 2)).toEqual({ ok: true, cost: 2 });
    expect(canLearn('telekinesis', [], 9)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('wires every tree: one root, valid in-tree prerequisites, one capstone', () => {
    for (const tree of SKILL_TREES.all) {
      const skills = skillsInTree(tree.id);
      expect(skills.filter((s) => s.requires.length === 0)).toHaveLength(1);
      expect(skills.filter((s) => s.tier === 4)).toHaveLength(1);
      for (const s of skills) {
        for (const r of s.requires) {
          expect(SKILLS.get(r).tree).toBe(tree.id);
          expect(SKILLS.get(r).tier).toBeLessThan(s.tier);
        }
      }
    }
  });
});
