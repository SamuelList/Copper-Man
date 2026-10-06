# Project Copper

A 2.5D **stealth RPG** built with React, Three.js, and TypeScript, seen through a fixed axonometric (isometric) camera. You work school maintenance: strip copper,
brass, aluminum, and steel scrap out of the building, haul it to your van, and sell it. Don't let **Mr. Gravy** (the
boss) catch you red-handed. Three warnings and you're fired.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Vite dev server with HMR                       |
| `npm run build`     | Type-check and build to `dist/`                |
| `npm run preview`   | Serve the production build                     |
| `npm test`          | Unit + component tests (Vitest)                |
| `npm run e2e`       | Playwright end-to-end test (builds + previews) |
| `npm run lint`      | ESLint, including architecture-boundary rules  |
| `npm run typecheck` | `tsc -b`                                       |
| `npm run format`    | Prettier                                       |
| `npm run check`     | lint + typecheck + test + build (what CI runs) |

> Running e2e in a container with a preinstalled Chromium? Point Playwright at it:
> `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run e2e`

### Controls

| Key           | Action                                              |
| ------------- | --------------------------------------------------- |
| WASD / arrows | Move (relative to the screen)                       |
| Shift         | Sprint (stamina)                                    |
| C             | Crouch / stand (half speed, hides you behind cover) |
| E / Space     | **Hold** to scrap, unlock, sell, wake               |
| Q             | Character ability                                   |
| Mouse wheel   | Zoom                                                |
| Esc           | Pause / clock out early                             |

## How it plays

- **Shifts.** Each day is a 5-minute shift. Sell scrap at the van; anything still in your bag when the whistle blows is lost.
- **Between shifts.** Spend your cash at the hardware store on boots, tools, bags, and keys.
- **Stealth.** Mr. Gravy patrols the hallways with a vision cone that walls block.
  - He only cares if you're **carrying scrap** or **scrapping**. While he sees that, a detection meter fills; when it's full, he chases you.
  - If he catches you: you get a warning, your bag is confiscated, and you're escorted back to the van.
  - If he catches you empty-handed: he tells you to get back to work.
  - He gets faster as the shift goes on and as you sell more.
- **Line of sight.**
  - **Fog of war:** you only see what your worker can see. Out-of-sight areas go dark and grey, and NPCs there are hidden. A fading ghost marks where you last saw them, and a pulsing ring shows footsteps you can hear through walls.
  - **Vision cones** are clipped exactly against walls and tall furniture. The bright inner zone spots you fast; the faint outer zone is slow to notice you.
  - **Cover:** crouch (C) behind desks, tables, fixtures and benches to break line of sight. Lockers, shelves and boilers block sight entirely.
  - **Light:** every room has a light level. In the dark (the boiler room, closets) NPCs notice you more slowly and from less far away. The HUD light meter shows how exposed you are.
- **Students.** They wander their rooms and snitch if they watch you scrap. The boss comes to investigate.
- **Sleepy coworker.** Asleep somewhere different each shift. Find them to win back a heart.
- **Map.**
  - Hallways have the high-value fixtures and the boss.
  - Classrooms are safer but cheaper.
  - The **boiler room** has copper piles behind a locked door, with one way in or out. It's dark, with boilers to hide behind.

| Worker  | Speed | Repair | Carry | Trade    | Ability                                                                  |
| ------- | ----- | ------ | ----- | -------- | ------------------------------------------------------------------------ |
| Dalton  | 3     | 2      | 1     | HVAC     | **Act Like a Student** (Q): carried scrap is invisible for a few seconds |
| Tomothy | 1     | 3      | 2     | Plumbing | **Act Like You're Working** (passive): scrapping never looks suspicious  |
| Dunkin  | 2     | 1      | 3     | —        | Biggest bag                                                              |

## Architecture

```
ui  ──►  game  ──►  state  ──►  core
React    Three.js   Zustand     pure TypeScript
```

Dependencies only point right, and ESLint enforces it (`no-restricted-imports` in `eslint.config.js`).

| Layer           | Responsibility                                                                                                                                                                                                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`src/core`**  | Game rules and content, with no Three.js, React, or DOM. `ShiftSession` is the authoritative simulation: it takes `tick(dt, input)`, exposes state to draw, and emits typed events. AI, vision (exact visibility outlines, cover, light), pathfinding, and collision are plain functions, so they're unit-tested headless.                  |
| **`src/state`** | Zustand stores. `careerStore` is persisted to localStorage with a versioned schema and `migrate`. `shiftStore` is the HUD mirror. `appStore` is the screen state machine.                                                                                                                                                                   |
| **`src/game`**  | Three.js renderer and input. `GameEngine` steps the session on a fixed 60 Hz timestep and draws it with a fixed isometric `IsoCamera`. Room light and fog of war are map-space textures applied to every material by one shader patch (`render/materials.ts`). `bridge.ts` pushes session events and throttled snapshots into `shiftStore`. |
| **`src/ui`**    | React screens and HUD. It mounts `<GameView />` and never imports Three.js directly. HUD widgets subscribe to narrow slices of the store with `useShallow`.                                                                                                                                                                                 |

```
src/
  core/
    content/   characters, fixtures, props, metals, upgrades, abilities, npcs, balance (all tunables)
    model/     shared types
    systems/   stats, scrapping, bag, economy, warnings, escalation, shop, vision, detection, pathfinding, movement
    ai/        bossBrain, studentBrain, navigation
    level/     ASCII level format + validator, levels/ (school map)
    session/   ShiftSession + types
  state/       careerStore, shiftStore, appStore, messages (event → toast copy)
  game/        GameView.tsx, GameEngine, render/ (camera, world, models, materials, fog, cones, markers), input/, bridge
  ui/          App, screens/, hud/, components/
e2e/           Playwright tests
```

### Extending the game

| To add…         | Do this                                                                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fixture       | Add an entry to `core/content/fixtures.ts` with a unique `glyph` and its `cover`, then place that glyph in a map. Add a model builder to `FIXTURE_MODELS` in `game/render/models.ts`.                                                  |
| Furniture       | Add to `core/content/props.ts` (`height: 'tall'` blocks sight, `'low'` is cover) and a builder to `PROP_MODELS`.                                                                                                                       |
| A worker        | Add to `core/content/characters.ts`. For a new ability, add a strategy object to `core/content/abilities.ts`. `conceals(signal, active)` decides what NPCs can't notice.                                                               |
| An upgrade      | Add a tier to `core/content/upgrades.ts`. The shop UI picks it up automatically.                                                                                                                                                       |
| A level         | Write a map in `core/level/levels/` (legend in `asciiLevel.ts`) and register it in `levels/index.ts`. `validateLevel` runs in tests and catches unreachable fixtures or broken patrols. A Tiled loader can return the same `LevelDef`. |
| Real art        | Swap a builder in `game/render/models.ts` for one that clones a loaded glTF scene. Every model is looked up by content id.                                                                                                             |
| A save field    | Add it to `CareerData`, bump `SAVE_VERSION`, and add a `case` to `migrateCareer`.                                                                                                                                                      |
| Balance changes | Everything numeric lives in `core/content/balance.ts`.                                                                                                                                                                                 |

### Debugging

Open the game with `?debug` (always on in dev) to expose the live session as `window.__copper.session`. You can teleport the player, fill the bag, move the boss, and so on. The e2e test uses it.

## Design assumptions to confirm

The design board left some gaps. Each assumption below is one line of config to change:

- Trades: Dalton is HVAC, Tomothy is plumbing, Dunkin has none. The board's trade bonus is +0.5 Repair on a matching fixture and +0.25 otherwise.
- The two unnamed `(name)` fixtures (yield 0.8–1.2) became the **Pneumatic Air Line** and the **Radiator**.
- Fixture metals and scrap prices (copper $40, brass $25, aluminum $15, steel $6 per unit) are placeholders.
- Shift length (5 min), upgrade prices and effects, and boss escalation thresholds are first-pass numbers.
- Dunkin has no special ability; their Carry 3 is their edge.
- Students snitch on _scrapping_ only. The boss reacts to scrapping **or** carrying.
