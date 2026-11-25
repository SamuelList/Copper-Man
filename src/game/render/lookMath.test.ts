import { applyLook, bearingTo, headBob, lookBasis, MAX_PITCH, verticalFov } from './lookMath';

describe('first-person look math', () => {
  it('turns right with positive x and wraps around', () => {
    expect(applyLook({ yaw: 0, pitch: 0 }, 0.5, 0).yaw).toBeCloseTo(0.5);
    const wrapped = applyLook({ yaw: Math.PI - 0.1, pitch: 0 }, 0.3, 0).yaw;
    expect(wrapped).toBeCloseTo(-Math.PI + 0.2);
    expect(applyLook({ yaw: -Math.PI + 0.1, pitch: 0 }, -0.3, 0).yaw).toBeCloseTo(Math.PI - 0.2);
  });

  it("can't look past straight up or down", () => {
    expect(applyLook({ yaw: 0, pitch: 0 }, 0, 10).pitch).toBe(MAX_PITCH);
    expect(applyLook({ yaw: 0, pitch: 0 }, 0, -10).pitch).toBe(-MAX_PITCH);
  });

  it('walks the way you face and strafes to your right', () => {
    // Facing east: forward is +x, right is south (+y on the map).
    const east = lookBasis(0);
    expect(east.screenUp.x).toBeCloseTo(1);
    expect(east.screenRight.y).toBeCloseTo(1);
    // Facing south: forward is +y, right is west.
    const south = lookBasis(Math.PI / 2);
    expect(south.screenUp.y).toBeCloseTo(1);
    expect(south.screenRight.x).toBeCloseTo(-1);
  });

  it('tells which side something is on', () => {
    const eye = { x: 100, y: 100 };
    // Looking east: south (down the map) is to your right, north to your left.
    expect(bearingTo(eye, 0, { x: 200, y: 100 })).toBeCloseTo(0);
    expect(bearingTo(eye, 0, { x: 100, y: 200 })).toBeCloseTo(Math.PI / 2);
    expect(bearingTo(eye, 0, { x: 100, y: 0 })).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(bearingTo(eye, 0, { x: 0, y: 100 }))).toBeCloseTo(Math.PI);
    // Turn to face it and it's dead ahead again.
    expect(bearingTo(eye, Math.PI / 2, { x: 100, y: 200 })).toBeCloseTo(0);
    expect(bearingTo(eye, Math.PI * 0.9, { x: 0, y: 100 })).toBeCloseTo(Math.PI * 0.1);
  });

  it('keeps the field of view sensible on any screen', () => {
    expect(verticalFov(16 / 9)).toBeGreaterThan(60);
    expect(verticalFov(16 / 9)).toBeLessThan(70);
    expect(verticalFov(2.4)).toBe(58); // ultra-wide phone
    expect(verticalFov(0.5)).toBe(82); // portrait
  });

  it('bobs the head only while moving, once per step', () => {
    expect(headBob(1.3, 0)).toEqual({ x: 0, y: 0, roll: 0 });
    // Lowest as each foot lands (a quarter and three quarters through the cycle).
    const high = headBob(0, 1).y;
    expect(headBob(Math.PI / 2, 1).y).toBeLessThan(high);
    expect(headBob((3 * Math.PI) / 2, 1).y).toBeCloseTo(headBob(Math.PI / 2, 1).y);
    // Sprinting bobs more.
    expect(Math.abs(headBob(Math.PI / 2, 2).y)).toBeGreaterThan(
      Math.abs(headBob(Math.PI / 2, 1).y),
    );
  });
});
