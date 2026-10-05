# CLAUDE.md

Project Copper is a top-down stealth RPG built with React 19, Phaser 4, Zustand, and TypeScript (Vite).

## Commands

- `npm run check` runs lint, typecheck, unit tests, and build. Run it before every commit.
- `npm test` runs Vitest. Core and state tests run in node; UI tests opt into jsdom with a `/** @vitest-environment jsdom */` docblock.
- `npm run e2e` runs Playwright. In cloud containers, set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `npm run format` runs Prettier. CI runs `format:check`.

## Architecture rules (enforced by ESLint)

`ui → game → state → core`. Imports only point toward `core`.

- `src/core` is pure TypeScript: no Phaser, React, or Zustand. All game rules live here, and `ShiftSession` is the single source of truth for a shift.
- `src/state` holds Zustand stores and may import only `core`.
- `src/game` holds the Phaser rendering and input. Scenes stay thin: they feed input to the session and draw its state. Don't put rules here.
- `src/ui` is React. It never imports `phaser`; it mounts `@game/PhaserGame`.

## Conventions

- Content is data. Characters, fixtures, upgrades, abilities, and levels live in `core/content/*` and `core/level/levels/*`, keyed by string ids.
- Balance numbers belong only in `core/content/balance.ts`.
- New mechanics get unit tests in `core`. The pattern to copy is `ShiftSession.test.ts` driving a tiny ASCII map from `core/test/helpers.ts`.
- Persisted save changes need a `SAVE_VERSION` bump plus a `migrateCareer` case.
- Visuals go through `game/render/assetManifest.ts` so placeholder art can be swapped for files.
- Path aliases: `@core/*`, `@state/*`, `@game/*`, `@ui/*`.
- `?debug` exposes `window.__copper.session` for e2e tests and manual tinkering.
