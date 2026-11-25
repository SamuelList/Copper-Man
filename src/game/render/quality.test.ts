import { PHONE_QUALITY, QUALITY, QualityGovernor } from './quality';

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
    // Never better than a software renderer can run.
    expect(new QualityGovernor(2, { software: true, last: at(3) }).current.effects).toBe(0);

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

  it('has nothing to hand on until it has weighed a sample', () => {
    // A shift quit in its first seconds (or an engine replaced while paused) is not a shift
    // survived: the next one must not climb on the strength of it.
    const q = new QualityGovernor(2, { last: { level: 5, pace: 60 } });
    expect(q.level).toBe(4);
    run(q, 60, 2.9); // still warming up
    expect(q.settled).toBeNull();
    run(q, 60, 2);
    expect(q.settled).toEqual({ level: 4, pace: 60 });
  });

  it('fits the ladder to the screen: nothing sharper than it, and no step that changes nothing', () => {
    // An ordinary monitor: every rung is at most 1x, and the first step down is a real one.
    const monitor = new QualityGovernor(1);
    expect(monitor.current).toMatchObject({ ratio: 1, effects: 2, mirror: true });
    const before = { ...monitor.current };
    run(monitor, 38, 6.1);
    expect(monitor.current).not.toEqual(before);
    expect(monitor.current.ratio).toBe(1);
    // A phone whose screen is 1.5x still starts with the mirrored floor (the phone ladder
    // gives that up before sharpness, so the first rung at 1.5x no longer has it).
    const phone = new QualityGovernor(1.5, { ladder: PHONE_QUALITY });
    expect(phone.current).toMatchObject({ ratio: 1.5, mirror: true, effects: 2 });
    run(phone, 40, 6.1);
    expect(phone.current).toMatchObject({ ratio: 1.5, mirror: false, effects: 2 });
    // The rung below that on the full ladder (the same thing at 1.5x) isn't a step here:
    // when it struggles, the next one down is lighter effects.
    run(phone, 25, 6.1);
    expect(phone.current).toMatchObject({ ratio: 1.5, mirror: false, effects: 1 });
  });

  it('does not mistake hitches for a low frame rate', () => {
    // One frame in twelve takes a fifth of a second (a shader compiling, a buffer uploading):
    // by the plain average that is about 31 frames a second, well under the target.
    const q = new QualityGovernor(2);
    const frames = Array.from({ length: 1200 }, (_, i) => (i % 12 === 0 ? 0.2 : 1 / 60));
    expect(frames.length / frames.reduce((a, b) => a + b)).toBeLessThan(45);
    for (const f of frames) q.sample(f);
    expect(q.level).toBe(0);
  });

  it('treats 30 frames a second as full speed where that is all the screen is given', () => {
    // Low Power Mode: the browser calls back 30 times a second however fast the phone is.
    const q = new QualityGovernor(3, { displayHz: 30 });
    expect(run(q, 30, 60)).toEqual([]);
    // A phone that can't hold even that still sheds load.
    run(q, 18, 30);
    expect(q.level).toBeGreaterThan(0);
    expect(q.current.effects).toBe(2);
  });

  it('follows the screen when its rate is measured again', () => {
    const q = new QualityGovernor(2);
    expect(q.setDisplayRate(30)).toBe(false);
    expect(run(q, 30, 30)).toEqual([]);
    // Back at 60, a steady 30 is slow again.
    q.setDisplayRate(60);
    run(q, 30, 30);
    expect(q.level).toBe(SHARP_WITH_EFFECTS);
    // A faster screen asks no more than 60.
    const fast = new QualityGovernor(2, { displayHz: 120 });
    expect(run(fast, 60, 30)).toEqual([]);
  });

  it('starts over when it learns the screen was being held back all along', () => {
    // Low Power Mode comes on mid-shift: frames arrive at 30, and it sheds levels chasing 60.
    const q = new QualityGovernor(3, { ladder: PHONE_QUALITY });
    run(q, 30, 30);
    expect(q.level).toBeGreaterThan(0);
    // A pause measures the screen again. Nothing it gave up was the phone's fault.
    expect(q.setDisplayRate(30)).toBe(true);
    expect(q.level).toBe(0);
    expect(run(q, 30, 30)).toEqual([]);
    expect(q.settled).toEqual({ level: 0, pace: 30 });
    // Not for a level held by hand, nor where there is no graphics card to do better with.
    const held = new QualityGovernor(2);
    held.pin(6);
    expect(held.setDisplayRate(30)).toBe(false);
    expect(held.level).toBe(6);
    const software = new QualityGovernor(2, { software: true });
    expect(software.setDisplayRate(30)).toBe(false);
    expect(software.current.effects).toBe(0);
  });

  it('corrects itself when the screen turns out faster than it was told', () => {
    // Measured at 30 before the first tap; the game then runs at 60, later sagging to 40.
    const q = new QualityGovernor(2, { displayHz: 30 });
    run(q, 60, 10);
    run(q, 40, 30);
    expect(q.level).toBeGreaterThan(0);
    expect(q.settled?.pace).toBe(60);
    // (The engine passes the measured rate on only when it changes: telling the governor 30
    // again every frame would undo this.)
  });

  it('is not rushed down the ladder by the stall of its own last step', () => {
    const q = new QualityGovernor(2);
    run(q, 38, 6.1); // warm-up, then two slow samples: one step down
    expect(q.level).toBe(1);
    // Rebuilding the render targets makes the next sample look terrible. It isn't counted, so
    // one slow sample after it is still only one.
    run(q, 6, 1.6);
    run(q, 38, 1.6);
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

  it('on a phone gives up the mirrored floor before any sharpness', () => {
    const q = new QualityGovernor(3, { ladder: PHONE_QUALITY });
    expect(q.current).toMatchObject({ ratio: 2, mirror: true, effects: 2 });
    // A little slow: the first step keeps every pixel.
    run(q, 40, 6.1);
    expect(q.current).toMatchObject({ ratio: 2, mirror: false, effects: 2 });
    // Still a little slow: now pixels, and it stops while it still has every effect.
    run(q, 40, 60);
    expect(q.current).toMatchObject({ ratio: 1.5, mirror: false, effects: 2 });
    // Properly struggling: all the way down if need be.
    run(q, 20, 60);
    expect(q.current.effects).toBe(0);
  });

  it('never trades a cheaper rung for a dearer one, on either ladder', () => {
    for (const ladder of [QUALITY, PHONE_QUALITY]) {
      for (let i = 1; i < ladder.length; i++) {
        const [a, b] = [ladder[i - 1]!, ladder[i]!];
        expect(b.ratio).toBeLessThanOrEqual(a.ratio);
        expect(b.shadows).toBeLessThanOrEqual(a.shadows);
        expect(b.effects).toBeLessThanOrEqual(a.effects);
        expect(Number(b.mirror)).toBeLessThanOrEqual(Number(a.mirror));
        expect(Number(b.reflections)).toBeLessThanOrEqual(Number(a.reflections));
        expect(b).not.toEqual(a);
      }
      // The mirrored floor needs the post chain's targets.
      expect(ladder.every((l) => !l.mirror || l.effects > 0)).toBe(true);
      expect(ladder[ladder.length - 1]!.effects).toBe(0);
    }
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
