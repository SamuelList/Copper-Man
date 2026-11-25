import { displayRate } from './displayRate';

const feed = (ms: number, frames: number) => {
  for (let i = 0; i < frames; i++) displayRate.sample(ms);
};

beforeEach(() => displayRate.reset());

describe('displayRate', () => {
  it('assumes sixty until it has seen enough frames', () => {
    feed(33.3, 10);
    expect(displayRate.hz).toBe(60);
    feed(33.3, 10);
    expect(displayRate.hz).toBe(30);
  });

  it('reads the usual screens', () => {
    feed(16.7, 30);
    expect(displayRate.hz).toBe(60);
    feed(8.33, 40);
    expect(displayRate.hz).toBe(120);
  });

  it('is not thrown by hitches, stalls or nonsense', () => {
    for (let i = 0; i < 40; i++) displayRate.sample(i % 8 === 0 ? 90 : 16.7);
    displayRate.sample(4000);
    displayRate.sample(0);
    displayRate.sample(Number.NaN);
    expect(displayRate.hz).toBe(60);
  });

  it('follows a change (Low Power Mode switched on), and starts over when asked', () => {
    feed(16.7, 40);
    feed(33.3, 40);
    expect(displayRate.hz).toBe(30);
    // Forgetting keeps the answer until new frames replace it.
    displayRate.forget();
    feed(16.7, 5);
    expect(displayRate.hz).toBe(30);
    feed(16.7, 15);
    expect(displayRate.hz).toBe(60);
  });
});
