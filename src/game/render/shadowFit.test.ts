import * as THREE from 'three';
import { IsoCamera } from './isoCamera';
import { fitShadowBox, shadowMapSize } from './shadowFit';

const SUN = new THREE.Vector3(-18, 34, -22);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('fitShadowBox', () => {
  it('holds every point, with the margin, and is as tight as it can be', () => {
    const points = [v(-4, 0, -3), v(5, 0, 2), v(1, 3, 6), v(0, 0, 0)];
    const box = fitShadowBox(points, SUN, 1.5);
    // Project the same way three's shadow camera would, and compare.
    const camera = new THREE.OrthographicCamera();
    camera.position.copy(SUN);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const seen = points.map((p) => p.clone().applyMatrix4(camera.matrixWorldInverse));
    expect(box.left).toBeCloseTo(Math.min(...seen.map((p) => p.x)) - 1.5, 6);
    expect(box.right).toBeCloseTo(Math.max(...seen.map((p) => p.x)) + 1.5, 6);
    expect(box.bottom).toBeCloseTo(Math.min(...seen.map((p) => p.y)) - 1.5, 6);
    expect(box.top).toBeCloseTo(Math.max(...seen.map((p) => p.y)) + 1.5, 6);
  });

  it('needs no extra room for what casts the shadows', () => {
    // A wall between a point and the sun sits at the same place in the sun's view.
    const ground = v(3, 0, -2);
    const caster = ground.clone().addScaledVector(SUN.clone().normalize(), 4);
    const alone = fitShadowBox([ground], SUN, 0);
    const both = fitShadowBox([ground, caster], SUN, 0);
    expect(both.left).toBeCloseTo(alone.left, 6);
    expect(both.right).toBeCloseTo(alone.right, 6);
    expect(both.top).toBeCloseTo(alone.top, 6);
    expect(both.bottom).toBeCloseTo(alone.bottom, 6);
  });
});

describe('shadowMapSize', () => {
  it('keeps the texels per tile of the square map it stands in for', () => {
    // A 2048 map over 28 tiles is about 73 texels a tile.
    expect(shadowMapSize({ left: -14, right: 14, bottom: -14, top: 14 }, 2048, 14)).toEqual({
      x: 2048,
      y: 2048,
    });
    const strip = shadowMapSize({ left: -18, right: 18, bottom: -6, top: 6 }, 1024, 14);
    expect(strip.x / 36).toBeCloseTo(1024 / 28, 0);
    expect(strip.y / 12).toBeCloseTo(1024 / 28, 0);
    // Far fewer texels than the square it replaces.
    expect(strip.x * strip.y).toBeLessThan(1024 * 1024 * 0.6);
  });

  it('stays within what a graphics card will make', () => {
    const huge = shadowMapSize({ left: -200, right: 200, bottom: -1, top: 1 }, 2048, 14);
    expect(huge).toEqual({ x: 4096, y: 147 });
  });
});

describe('the top-down view and its shadows', () => {
  const SQUARE = 28 * 28;
  const boxFor = (width: number, height: number) => {
    const iso = new IsoCamera();
    iso.resize(width, height);
    const seen = iso.footprint([0, 1.5]);
    expect(seen).toHaveLength(8);
    return fitShadowBox(seen, SUN, 0.75);
  };
  const area = (b: { left: number; right: number; bottom: number; top: number }) =>
    (b.right - b.left) * (b.top - b.bottom);

  it('covers what a phone screen shows in much less than the square box', () => {
    // Upright, the view is a long strip on the ground and the sun looks almost straight
    // across it: longer than the square was (which left the ends of the screen unshadowed),
    // and far narrower.
    const upright = boxFor(390, 844);
    expect(upright.right - upright.left).toBeGreaterThan(28);
    expect(upright.right - upright.left).toBeGreaterThan(2.5 * (upright.top - upright.bottom));
    expect(area(upright)).toBeLessThan(SQUARE * 0.6);
    expect(area(boxFor(844, 390))).toBeLessThan(SQUARE * 0.5);
    // A monitor shows more, and still needs less than the square.
    expect(area(boxFor(1920, 1080))).toBeLessThan(SQUARE * 0.75);
  });

  it('puts the corners of the view where the camera sees them', () => {
    const iso = new IsoCamera();
    iso.resize(1280, 800);
    iso.follow(40, 20, 0, true);
    iso.camera.updateMatrixWorld();
    const [corner] = iso.footprint([0]);
    // Seen through the camera, that ground point is a corner of the screen.
    const onScreen = corner!
      .clone()
      .add(v(40, 0, 20))
      .project(iso.camera);
    expect(Math.abs(onScreen.x)).toBeCloseTo(1, 5);
    expect(Math.abs(onScreen.y)).toBeCloseTo(1, 5);
  });
});
