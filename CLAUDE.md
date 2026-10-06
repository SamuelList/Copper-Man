# CLAUDE.md

Project Copper is a 2.5D stealth RPG built with React 19, Three.js (fixed isometric camera), Zustand, and TypeScript (Vite).

## Commands

- `npm run check` runs lint, typecheck, unit tests, and build. Run it before every commit.
- `npm test` runs Vitest. Core and state tests run in node; UI tests opt into jsdom with a `/** @vitest-environment jsdom */` docblock.
- `npm run e2e` runs Playwright: a desktop keyboard run (`game.spec.ts`) and an emulated iPhone touch run (`mobile.spec.ts`). In cloud containers, set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `npm run format` runs Prettier. CI runs `format:check`.

## Architecture rules (enforced by ESLint)

`ui → game → state → core`. Imports only point toward `core`.

- `src/core` is pure TypeScript: no Three.js, React, or Zustand. All game rules live here, and `ShiftSession` is the single source of truth for a shift.
- `src/state` holds Zustand stores and may import only `core`.
- `src/game` holds the Three.js rendering and input. `GameEngine` stays thin: it feeds input to the session and draws its state. Don't put rules here (line of sight, cover and light math live in `core/systems`).
- `src/ui` is React. It never imports `three`; it mounts `@game/GameView`.

## Conventions

- Content is data. Characters, fixtures, upgrades, abilities, and levels live in `core/content/*` and `core/level/levels/*`, keyed by string ids.
- Balance numbers belong only in `core/content/balance.ts`.
- New mechanics get unit tests in `core`. The pattern to copy is `ShiftSession.test.ts` driving a tiny ASCII map from `core/test/helpers.ts`.
- Persisted save changes need a `SAVE_VERSION` bump plus a `migrateCareer` step.
- Gear and skills share one `Modifiers` shape; `deriveStats` folds them into `EffectiveStats`. Add a modifier there rather than special-casing an item id in the session.
- Every control must work by touch as well as keyboard. Touch UI writes to `state/virtualInput`; `InputController` merges it with the keys.
- Models are built procedurally in `game/render/models/` (fixtures, props, set pieces, wall decor, characters), keyed by content id, so placeholder art can be swapped for glTF later. Build each one to its content `footprint`, which is also its hitbox. Lit materials go through `MaterialKit` so they pick up room light and fog of war.
- Static scenery is merged by `game/render/batching.ts` (per map chunk, plain colours folded into vertex colours) to keep draw calls low on phones. Anything that moves (doors, characters, effects) stays out of the batch.
- Characters share one jointed rig (`buildCharacter` plus a `RigSpec` outfit). `game/render/gait.ts` animates it from measured ground speed; the gait math is pure and unit-tested.
- Path aliases: `@core/*`, `@state/*`, `@game/*`, `@ui/*`.
- `?debug` exposes `window.__copper.session` for e2e tests and manual tinkering.
