import { eyeAdaptation, LOOKS } from './looks';

describe('eye adaptation', () => {
  it('leaves a bright room alone and opens up in the dark', () => {
    expect(eyeAdaptation(1, 1)).toBe(1);
    expect(eyeAdaptation(0.9, 1)).toBe(1);
    expect(eyeAdaptation(0.25, 1)).toBe(2);
    expect(eyeAdaptation(0, 1)).toBe(2);
    // Dimmer rooms get more, smoothly.
    const steps = [0.8, 0.65, 0.5, 0.35].map((light) => eyeAdaptation(light, 1));
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('adjusts more from inside a room than looking down on it', () => {
    expect(LOOKS.fps.adaptation).toBeGreaterThan(LOOKS.iso.adaptation);
    expect(eyeAdaptation(0.3, 0)).toBe(1);
  });
});
