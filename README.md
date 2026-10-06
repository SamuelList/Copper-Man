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
| 1 / 2 / 3     | Use a gadget                                        |
| Esc           | Pause / clock out early                             |

**On a phone or tablet** the HUD switches to thumb controls as soon as you touch the screen:

- Drag anywhere on the left half to walk. A light push creeps; push to the rim to sprint.
- Hold the big hand button to scrap, unlock, sell or wake. It shows the action and fills as you work.
- Crouch, ability and gadget buttons sit next to it. The pause button is top right.

Landscape is roomiest, but portrait works too. `?touch` forces touch controls on a desktop.

## How it plays

- **Shifts.** Each day is a 5-minute shift. Sell scrap at the van; anything still in your bag when the whistle blows is lost.
- **Between shifts.** The hardware store has three tabs:
  - **Gear:** eight categories of tiered upgrades: boots, tools, bags, keys, gloves (scrap quietly), disguises (carry without looking guilty), radios (hear the boss from further away), and scrapyard deals (sell for more).
  - **Gadgets:** one-use items that carry over until used. Energy drinks give free sprinting. Whoopee cushions are thrown ahead and lure Mr. Gravy to the noise. Bolt cutters open a locked door instantly.
  - **Skills:** everything you do earns XP (scrapping, selling, doors, waking your coworker, finishing a shift, never getting caught). Each level is a skill point for three trees: **Shadow** (stealth), **Hustle** (speed and capacity), and **Wheeler-Dealer** (money, an extra heart, and talking your way out of one catch per shift).
- **Scrapping takes time, and fixtures take longer to come back.** Recharge times are double the design board's, so you can't just farm one room; spread out.
- **Mr. Gravy.** His vision cone is blocked by walls. He only cares if you're **carrying scrap** or **scrapping**: while he sees that, a detection meter fills, and when it's full he chases you.
  - **He plans his own rounds.** He picks rooms to drop in on, weighted toward ones he hasn't checked lately and ones where there's been trouble. He stops in the doorway and looks around. Keep hitting one room and he'll keep coming back to it.
  - **He notices things.** He spots stripped fixtures ("Somebody stripped this radiator!") and goes to look. He hears you sprint nearby (less through walls). Whoopee cushions lure him to the noise.
  - **He's hard to shake.** If he loses you he heads where you were running, not where he last saw you. Then he checks the hiding spots nearby, and sometimes stakes out the exit to your van. He talks while he works, so you can hear him coming.
  - If he catches you: you get a warning, your bag is confiscated, and you're escorted back to the van. Empty-handed, he just tells you to get back to work. He gets faster as the shift goes on and as you sell more.
- **Teachers** sit between students and the boss. Each one teaches at the front of their room, steps into the hall between lessons, and takes coffee breaks in the lounge. They notice scrapping _and_ full bags, and when they're sure they radio Mr. Gravy, who hurries over.
- **Students** have personalities, rolled each shift. Their look gives them away:

  | Look                  | Personality   | Behaviour                                                         |
  | --------------------- | ------------- | ----------------------------------------------------------------- |
  | Plain                 | Student       | Wanders the room, snitches on scrapping                           |
  | Orange sash           | Hall Monitor  | Sharp-eyed, roams the halls, also reports a full bag              |
  | Glowing phone         | Phone Zombie  | Barely looks up, barely moves                                     |
  | Propeller cap         | Class Clown   | Bounces around the halls and often just laughs instead of telling |
  | Glasses, sweater vest | Teacher's Pet | Tells the boss and every teacher nearby                           |
  | Slumped, "z"          | Sleepyhead    | Blind while dozing, groggy when awake                             |

- **Exploring.** The school starts pitch black. What you've seen stays on your map (greyed out when it's out of sight) and is saved with your career. Every new room is worth XP. You only see people in your line of sight; a fading ghost marks where you last saw them, and a pulsing ring shows footsteps you can hear through walls.
- **Line of sight.**
  - **Vision cones** are clipped exactly against walls and tall furniture. The bright inner zone spots you fast; the faint outer zone is slow to notice you.
  - **Cover:** crouch (C) behind desks, tables, counters, bins and benches to break line of sight. Lockers, shelves, bookshelves, stall dividers and boilers block sight entirely.
  - **Light:** every room has a light level. In the dark (the boiler, mechanical and server rooms, closets) people notice you more slowly and from less far away. The HUD light meter shows how exposed you are.
- **Sleepy coworker.** Asleep somewhere different each shift. Find them to win back a heart.
- **The school** is about twice the size of the first version. The van is on the west side; the further east you go, the bigger the scrap and the longer the walk back. That's where speed, bag size and skills pay off.
  - **West:** classrooms, the main office (Mr. Gravy's turf, with a trophy case) and the library.
  - **Centre:** boys' and girls' restrooms (urinals, sinks, hand dryers, stalls), the science lab, cafeteria, kitchen and teachers' lounge.
  - **East:** the gym and locker room, the music room, and the technical rooms.
  - **Technical fixtures** need gear or experience, and the prompt names exactly what:

    | Fixture                  | Needs                            |
    | ------------------------ | -------------------------------- |
    | Hand dryer, cooler coils | Ten-in-One Screwdriver           |
    | Electrical panel         | Work Gloves                      |
    | Trophy case              | Pocket Plyers                    |
    | Server rack              | Level 4                          |
    | Chiller compressor       | Level 6 and the Milt-Wakee Drill |

  - **Security doors** (the mechanical and boiler rooms) need the Master Key, or bolt cutters.

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

| Layer           | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`src/core`**  | Game rules and content, with no Three.js, React, or DOM. `ShiftSession` is the authoritative simulation: it takes `tick(dt, input)`, exposes state to draw, and emits typed events. AI, vision (exact visibility outlines, cover, light), pathfinding, and collision are plain functions, so they're unit-tested headless. Furniture and fixtures collide and block sight with their real `footprint`, not their whole tile; the player is a circle that slides along walls and sidesteps objects wedged against them. |
| **`src/state`** | Zustand stores. `careerStore` is persisted to localStorage with a versioned schema and `migrate`. `shiftStore` is the HUD mirror. `appStore` is the screen state machine. `virtualInput` carries the on-screen touch controls to the game's input controller.                                                                                                                                                                                                                                                          |
| **`src/game`**  | Three.js renderer and input. `GameEngine` steps the session on a fixed 60 Hz timestep and draws it with a fixed isometric `IsoCamera`. Room light and fog of war are map-space textures applied to every material by one shader patch (`render/materials.ts`). `bridge.ts` pushes session events and throttled snapshots into `shiftStore`. Static scenery is batched into a few meshes per map chunk, and `QualityGovernor` lowers resolution, then reflections, then shadows if a device can't hold the frame rate.  |
| **`src/ui`**    | React screens and HUD. It mounts `<GameView />` and never imports Three.js directly. HUD widgets subscribe to narrow slices of the store with `useShallow`.                                                                                                                                                                                                                                                                                                                                                            |

```
src/
  core/
    content/   characters, fixtures, props, metals, upgrades, consumables, skills, abilities, npcs, balance
    model/     shared types
    systems/   stats, progression, scrapping, bag, economy, warnings, escalation, shop, vision, detection, pathfinding, movement
    ai/        bossBrain (plans rounds, heat memory, search), studentBrain, teacherBrain, navigation
    level/     ASCII level format + validator, levels/ (school map)
    session/   ShiftSession + types
  state/       careerStore, shiftStore, appStore, inputMode, virtualInput (touch → game), messages
  game/        GameView.tsx, GameEngine, render/ (camera, world, models/, batching, gait, materials, fog, cones, markers), input/, bridge
  ui/          App, screens/, hud/, components/
e2e/           Playwright tests
```

### Extending the game

| To add…         | Do this                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fixture       | Add an entry to `core/content/fixtures.ts` with a unique `glyph`, its `cover`, and its `footprint` (its real size on the floor, which is also its hitbox). Place that glyph in a map, and add a model builder of the same size to `FIXTURE_MODELS` in `game/render/models/`. |
| Furniture       | Add to `core/content/props.ts` (`height: 'tall'` blocks sight, `'low'` is cover; `footprint` is the hitbox) and a builder to `PROP_MODELS`.                                                                                                                                  |
| A worker        | Add to `core/content/characters.ts`. For a new ability, add a strategy object to `core/content/abilities.ts`. `conceals(signal, active)` decides what NPCs can't notice.                                                                                                     |
| An upgrade      | Add a tier to `core/content/upgrades.ts` with an `effect` (any `Modifiers` field). The shop UI picks it up automatically.                                                                                                                                                    |
| A gadget        | Add to `core/content/consumables.ts` and handle its id in `ShiftSession.useGadget`.                                                                                                                                                                                          |
| A skill         | Add to `core/content/skills.ts` with a `tree`, `tier`, `requires` (any one unlocks it) and an `effect`.                                                                                                                                                                      |
| A level         | Write a map in `core/level/levels/` (legend in `asciiLevel.ts`) and register it in `levels/index.ts`. `validateLevel` runs in tests and catches unreachable fixtures or broken patrols. A Tiled loader can return the same `LevelDef`.                                       |
| Real art        | Swap a builder in `game/render/models/` for one that clones a loaded glTF scene. Every model is looked up by content id.                                                                                                                                                     |
| A save field    | Add it to `CareerData`, bump `SAVE_VERSION`, and add a step to `migrateCareer`.                                                                                                                                                                                              |
| Balance changes | Everything numeric lives in `core/content/balance.ts`.                                                                                                                                                                                                                       |

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
