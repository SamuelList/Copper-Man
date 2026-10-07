/**
 * Procedural low-poly models, built from primitives. Units are tiles (1 = one map tile).
 *
 * Conventions:
 * - Characters face local +X (rotate by -facing to point along a map heading).
 * - Wall-mounted fixtures/props put their back on local -Z (see `mountRotation`).
 * - Fixtures and props fill their content `footprint`, which is also their hitbox.
 *
 * To swap in real art later, register a different builder for an id in `FIXTURE_MODELS` /
 * `PROP_MODELS` (e.g. one that clones a loaded glTF scene).
 */
export * from './characters';
export { DECOR, chalkboardSlice, type DecorBuilder } from './decor';
export type { ModelBuilder } from './common';
export { FIXTURE_MODELS } from './fixtures';
export { disposeModelCache, disposeTextureCache } from './parts';
export { fireMaterial, PROP_MODELS } from './props';
export {
  buildBush,
  buildCoworker,
  buildLampPost,
  buildLockedDoor,
  buildTree,
  buildVan,
  buildWetFloorSign,
} from './setPieces';
