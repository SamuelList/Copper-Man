import { cycleLength, Gait, type GaitInput } from './gait';

const DT = 1 / 60;
const base: GaitInput = {
  speed: 0,
  running: false,
  crouching: false,
  working: false,
  turnRate: 0,
  dt: DT,
};

function run(gait: Gait, input: Partial<GaitInput>, seconds: number) {
  let last = gait.update({ ...base, ...input });
  const strikes: number[] = [...last.strikes];
  for (let t = DT; t < seconds; t += DT) {
    last = gait.update({ ...base, ...input });
    strikes.push(...last.strikes);
  }
  return { last, strikes };
}

describe('gait', () => {
  it('stands still with straight legs and level hips when idle', () => {
    const { last } = run(new Gait(), {}, 1);
    expect(last.pose.pelvis).toBeCloseTo(1, 2);
    expect(Math.abs(last.pose.hipL)).toBeLessThan(0.01);
    expect(Math.abs(last.pose.lean)).toBeLessThan(0.01);
  });

  it('alternates feet, landing two steps per stride of distance travelled', () => {
    const speed = 4;
    const seconds = 3;
    const { strikes } = run(new Gait(), { speed }, seconds);
    const expectedSteps = (2 * speed * seconds) / cycleLength(speed);
    expect(strikes.length).toBeGreaterThan(expectedSteps - 2);
    expect(strikes.length).toBeLessThan(expectedSteps + 2);
    for (let i = 1; i < strikes.length; i++) expect(strikes[i]).not.toBe(strikes[i - 1]);
  });

  it('swings legs opposite each other and arms opposite the legs', () => {
    const gait = new Gait();
    run(gait, { speed: 4 }, 1);
    for (let i = 0; i < 30; i++) {
      const { pose } = gait.update({ ...base, speed: 4 });
      if (Math.abs(pose.hipL) > 0.1) {
        expect(Math.sign(pose.hipL)).toBe(-Math.sign(pose.hipR));
        expect(Math.sign(pose.shoulderL)).toBe(-Math.sign(pose.hipL));
      }
    }
  });

  it('runs with a bigger stride and a forward lean', () => {
    const maxHip = (g: Gait, input: Partial<GaitInput>) => {
      let m = 0;
      for (let i = 0; i < 60; i++)
        m = Math.max(m, Math.abs(g.update({ ...base, ...input }).pose.hipL));
      return m;
    };
    const walker = new Gait();
    const runner = new Gait();
    const walk = run(walker, { speed: 4 }, 2);
    const sprint = run(runner, { speed: 6, running: true }, 2);
    expect(sprint.last.run).toBeGreaterThan(0.95);
    expect(sprint.last.pose.lean).toBeGreaterThan(walk.last.pose.lean + 0.15);
    expect(maxHip(runner, { speed: 6, running: true })).toBeGreaterThan(
      maxHip(walker, { speed: 4 }),
    );
  });

  it('crouches low with bent knees, keeping a foot on the floor', () => {
    const { last } = run(new Gait(), { crouching: true }, 1);
    expect(last.pose.pelvis).toBeLessThan(0.85);
    expect(last.pose.kneeL).toBeLessThan(-1);
    expect(last.pose.lean).toBeGreaterThan(0.3);
  });

  it('brings both hands forward while working', () => {
    const { last } = run(new Gait(), { working: true }, 1);
    expect(last.pose.shoulderL).toBeGreaterThan(0.6);
    expect(last.pose.shoulderR).toBeGreaterThan(0.6);
  });

  it('eases into motion instead of snapping', () => {
    const gait = new Gait();
    const first = gait.update({ ...base, speed: 6, running: true });
    expect(first.run).toBeLessThan(0.2);
  });
});
