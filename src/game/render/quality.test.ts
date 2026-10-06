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

  it('keeps reflections and shadows on a phone capped at 30 fps', () => {
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
});
