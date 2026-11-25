import { QUALITY, QualityGovernor } from './quality';

/** Feed `seconds` of frames at a steady frame rate; returns every level change. */
function run(q: QualityGovernor, fps: number, seconds: number) {
  const changes: number[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const next = q.sample(1 / fps);
    if (next !== null) changes.push(next);
  }
  return changes;
}

const SHARP_WITH_EFFECTS = QUALITY.findIndex((l) => l.ratio === 1 && l.reflections);

describe('QualityGovernor', () => {
  it('starts at the sharpest level the screen can show', () => {
    expect(new QualityGovernor(3).current.ratio).toBe(2);
    expect(new QualityGovernor(2).current.ratio).toBe(2);
    expect(new QualityGovernor(1).current.ratio).toBe(1);
  });

  it('starts at the bottom when there is no graphics card', () => {
    const q = new QualityGovernor(2, { software: true });
    expect(q.level).toBe(QUALITY.length - 1);
    expect(q.current.effects).toBe(0);
  });

  it('picks up one level better than where the last shift ended', () => {
    const at = (level: number) => ({ level, pace: 60 });
    // It had dropped to level 5: the next shift starts at 4 instead of back at the top.
    expect(new QualityGovernor(2, { last: at(5) }).level).toBe(4);
    expect(new QualityGovernor(2, { last: at(1) }).level).toBe(0);
    expect(new QualityGovernor(2, { last: at(0) }).level).toBe(0);
    // Never sharper than the screen can show, nor better than a software renderer can run.
    expect(new QualityGovernor(1, { last: at(2) }).level).toBe(new QualityGovernor(1).level);
    expect(new QualityGovernor(2, { software: true, last: at(3) }).level).toBe(QUALITY.length - 1);

    const q = new QualityGovernor(2);
    run(q, 38, 30);
    expect(q.settled).toEqual({ level: q.level, pace: 60 });
    expect(new QualityGovernor(2, { last: q.settled }).level).toBe(q.level - 1);
    // What it gave up chasing 60 says nothing about a screen now held to 30.
    expect(new QualityGovernor(2, { last: q.settled, displayHz: 30 }).level).toBe(0);
    // A level held by hand (tests, screenshots) says nothing about the device.
    q.pin(7);
    expect(q.settled).toBeNull();
  });

  it('treats 30 frames a second as full speed where that is all the screen is given', () => {
    // Low Power Mode: the browser calls back 30 times a second however fast the phone is.
    const q = new QualityGovernor(3, { displayHz: 30 });
    expect(run(q, 30, 60)).toEqual([]);
    // The odd long frame doesn't change that.
    for (let i = 0; i < 1800; i++) q.sample(i % 30 === 0 ? 0.12 : 1 / 30);
    expect(q.level).toBe(0);
    // A phone that can't hold even that still sheds load.
    run(q, 18, 30);
    expect(q.level).toBeGreaterThan(0);
    expect(q.current.effects).toBe(2);
  });

  it('follows the screen when its rate is measured again', () => {
    const q = new QualityGovernor(2);
    q.setDisplayRate(30);
    expect(run(q, 30, 30)).toEqual([]);
    // Back at 60, a steady 30 is slow again.
    q.setDisplayRate(60);
    run(q, 30, 30);
    expect(q.level).toBe(SHARP_WITH_EFFECTS);
    // A faster screen asks no more than 60.
    const fast = new QualityGovernor(2, { displayHz: 120 });
    expect(run(fast, 60, 30)).toEqual([]);
  });

  it('corrects itself when the screen turns out faster than it was told', () => {
    // Measured at 30 before the first tap; the game then runs at 60, later sagging to 40.
    const q = new QualityGovernor(2, { displayHz: 30 });
    run(q, 60, 10);
    run(q, 40, 30);
    expect(q.level).toBeGreaterThan(0);
    expect(q.settled?.pace).toBe(60);
  });

  it('is not rushed down the ladder by the stall of its own last step', () => {
    const q = new QualityGovernor(2);
    run(q, 38, 6.1); // warm-up, then two slow samples: one step down
    expect(q.level).toBe(1);
    // Rebuilding the render targets makes the next sample look terrible. It isn't counted.
    run(q, 6, 1.6);
    run(q, 60, 6);
    expect(q.level).toBe(1);
  });

  it('leaves a smooth game alone', () => {
    const q = new QualityGovernor(2);
    expect(run(q, 60, 30)).toEqual([]);
    expect(q.level).toBe(0);
  });

  it('steps resolution down while the frame rate is low', () => {
    const q = new QualityGovernor(2);
    run(q, 38, 30);
    expect(q.current.ratio).toBe(1);
    expect(q.current.reflections).toBe(true);
    expect(q.current.shadows).toBeGreaterThan(0);
  });

  it('gives up resolution, but no effects, for a steady 30 on a screen that shows 60', () => {
    const q = new QualityGovernor(2);
    run(q, 30, 60);
    expect(q.level).toBe(SHARP_WITH_EFFECTS);
  });

  it('drops straight to the lowest level when the game is crawling', () => {
    const q = new QualityGovernor(2);
    expect(run(q, 8, 12)).toEqual([QUALITY.length - 1]);
  });

  it('ignores warm-up, a single hiccup and long pauses', () => {
    const q = new QualityGovernor(2);
    run(q, 10, 3); // shader compile while the shift starts
    run(q, 60, 3);
    run(q, 30, 1.6); // one slow sample
    run(q, 60, 3);
    q.sample(30); // back from a background tab
    expect(q.level).toBe(0);
  });

  it('sheds post-processing before shadows, and all of it at the bottom', () => {
    const effects = QUALITY.map((l) => l.effects);
    expect(effects).toEqual([...effects].sort((a, b) => b - a));
    expect(QUALITY.every((l) => l.effects > 0 || l.shadows === 0)).toBe(true);
    expect(QUALITY[QUALITY.length - 1]!.effects).toBe(0);
  });

  it('stays put once pinned', () => {
    const q = new QualityGovernor(2);
    q.pin(3);
    expect(run(q, 8, 12)).toEqual([]);
    expect(q.level).toBe(3);
    q.pin(99);
    expect(q.level).toBe(QUALITY.length - 1);
  });
});
