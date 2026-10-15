# Milestone 2a — Playable Sandbox: Design Spec

Date: 2026-10-14 · Status: Draft for review
Parent spec: `2026-10-14-conquest-web-design.md` (binding where this document is silent)
Builds on: Milestone 1 engine (`src/engine`, merged to main)

## 1. Goal

Make the game playable in a browser by hand: generate a world, see it on a canvas map, move units, fight, capture cities, set production, play hotseat or alone against Idle opponents, save and resume, and open it from any device via GitHub Pages.

**Milestone 2b** (separate spec and plan) adds standing orders (sentry, go-to, patrol, explore), pathfinding, turn-start reports and unit-cycling polish. **Milestone 3** adds the computer opponent.

### Success criteria
- From the published URL, start a new game, play several turns, capture a neutral city, build units, save, reload the page, and continue.
- Two humans can play hotseat on one machine without seeing each other's view.
- One human can play against 1–5 Idle seats.
- Works with mouse and keyboard on desktop; tap, drag and pinch work on a tablet.

### Decisions
| Topic | Decision |
|---|---|
| Scope | Milestone 2 split: 2a (this spec) and 2b (orders and pathfinding) |
| UI | Preact for screens and panels; HTML canvas for the map |
| Solo play before the AI | Seats are **Human** or **Idle**. Idle seats end their turn immediately, and their cities still build. |
| Publishing | GitHub Pages via a GitHub Actions workflow on every push to `main` |

## 2. Architecture

```
src/engine/   M1 rules engine (+ additions in §3)
src/mapgen/   generateWorld(options, seed) → map + start cities (pure)
src/app/      GameSession: owns GameState + command log; applies commands; runs Idle seats;
              hotseat hand-off; autosave triggers; exposes the current PlayerView to the UI
src/ui/       Preact screens/panels; MapView canvas renderer; input → command mapping
src/storage/  SaveStore interface; IndexedDB implementation; in-memory implementation for tests;
              export/import of save files
src/main.tsx  entry point
```

Rules:
- The UI reads only `PlayerView`s and events filtered for the viewing player. It never reads raw `GameState`.
- Every game change goes through `GameSession`, which calls the engine's `apply`.
- Non-trivial logic (camera math, screen↔map coordinates, key mapping, session flow, save format) lives in plain TypeScript modules with unit tests. Preact components stay thin.

## 3. Engine additions

1. **Fair first turn.** No player's cities make production progress on turn 1, so every player's first tick is on turn 2. Before this change, player 0 was one tick behind. `GameSession` treats game creation as player 0's turn start. Update the affected M1 turn test.
2. **`eventsFor(state, events, pid)`.** Returns only the events player `pid` may see:
   - their own units' and cities' events
   - combats they took part in
   - captures of their cities
   - other events whose square they currently see

   Cargo losses of enemy carriers are reported only as the carrier's fate, never as a count of lost cargo.
3. **PlayerView changes.**
   - Add `visibleSquares: number[]`, the sorted indices of squares currently in sight.
   - Enemy markers get view-local ids (`markerId`) instead of real unit ids.
4. **Commands carry `player`.** `apply` rejects a command whose `player` is not the current player.
5. **Aircraft end-turn rule.** `endTurn` is rejected while any of the current player's aircraft ends on a square shared with another top-level unit that is not a city or carrier. The error message names the unit.
6. **Exports.** `index.ts` also exports `DIRS`, `step`, `normalize`, `neighbors`, `chebyshev`, `isCoastal`, `index`, `effectiveMove`.
7. **Map validation.** A new `validateMapSize(width, height)` enforces 20×20 to 150×200. The map generator and the New Game screen use it. `createGame` keeps accepting small ASCII maps, because engine tests depend on them.
8. **Tooling.**
   - Bump `vite`/`vitest` to current patched versions.
   - Add a `tsconfig` for `src/engine` without the DOM lib.
   - Add `.gitattributes` (LF for text files).
   - Remove the BOM in `determinism.test.ts`.

## 4. Map generator

`generateWorld(opts: WorldOptions, seed: number): { map: ParsedMap; startCityIndices: number[]; seedUsed: number }`

**Options**
| Option | Values | Default |
|---|---|---|
| size | Small 40×30, Medium 60×45, Large 100×70, Huge 150×100, or custom (20–150 × 20–200) | Medium |
| wrap | east–west wrap on/off | off |
| waterPercent | 60–85 | 70 |
| landmass | `islands` / `mixed` / `continents` | `mixed` |
| cityDensity | `low` / `normal` / `high` (about 1 city per 30 / 20 / 13 land squares) | `normal` |
| players | 2–6 | 2 |

**Algorithm**
1. **Height field.** Seeded multi-octave value noise using the engine's `Rng`. The landmass style sets the base frequency: islands = higher frequency, continents = lower. If wrap is on, noise wraps horizontally so the seam is invisible.
2. **Land and water.** Threshold at the `waterPercent` percentile.
3. **Cleanup.** Remove land components smaller than 4 squares, and set the outermost row on the top and bottom edges to water.
4. **Cities.**
   - Place cities by seeded rejection sampling on land, at a minimum Chebyshev distance of 3 from each other.
   - Aim for about 70% coastal cities.
   - The target count comes from `cityDensity` and the land area.
5. **Start cities.**
   - Candidate starts are cities on landmasses holding at least 3 other cities.
   - Choose the starts by greedy farthest-point selection, which maximizes the minimum distance between players' starts.
   - Each player needs their own landmass if enough qualifying landmasses exist; otherwise they share, at maximum distance.
6. **Fairness and retries.**
   - If no valid start set exists, retry with derived seeds (`seed + k`, k = 1…49).
   - After 50 failures, relax the landmass requirement to at least 1 other city and accept the result.
   - `seedUsed` reports the seed that produced the map.

**Determinism.** The same options and seed always give an identical world.

## 5. Screens and controls

### New Game / title screen
- **Map options:** as in §4.
- **Player seats (2–6):** name, type (Human / Idle), color, chosen from 6 distinct accessible colors.
- **Seed:** a random seed by default, editable.
- **Buttons:** **Start**, **Continue** (autosave; shown if one exists), **Load** (list of named slots), **Import file**.

### Game screen
- **MapView (canvas)**
  - Tile size 12–48 px; zoom with the wheel or pinch; pan by drag or the arrow keys (letter keys are reserved for unit moves).
  - Wraps visually when the map has wrap enabled.
  - Draws:
    - unexplored squares dark
    - explored squares not in `visibleNow` dimmed
    - terrain as flat colors: water, land, and cities in the owner's color
    - units as vector icons in the owner's color, with markers for carrying cargo, crippled and low fuel
    - enemy last-seen markers dimmed by age; they disappear per engine rules
  - Highlights the selected unit and the squares it can legally step to.
- **Minimap:** the whole explored map; clicking recenters the view.
- **Top bar:** turn number, current player name/color, **End Turn**. If End Turn is refused, the reason is shown and the offending unit is selected.
- **Side panel**
  - Selected unit: type, moves left, damage/hits, fuel, cargo list.
  - Selected own city: production picker with build times (repeat bonus shown), progress; ship options disabled in inland cities.
  - Selected enemy or neutral city: last known owner.
- **Message log:** this player's filtered events in plain words, newest first.

### Input
- **Mouse**
  - Click your own unit or city to select it. Stacked units in a city or on a carrier are listed in the side panel for choosing.
  - With a unit selected, clicking an adjacent square moves or attacks.
  - Right-click deselects.
- **Keyboard**
  - Move: numpad 1–9 or `Q W E / A D / Z X C`.
  - **Space** or **N**: next unit with moves left.
  - **S**: skip this unit for this turn (UI-only).
  - **Enter**: End Turn.
  - **F**: center on the selected unit (C is a move key).
  - **Esc**: deselect.
- **Touch:** tap = click; drag = pan; pinch = zoom.

### Turn flow
- **Turn start:** the session selects the player's first unit with moves left and centers on it.
- **New production:** a newly captured city opens its production picker.
- **Hotseat:** between two human turns, a full-screen "Pass to <name> — click when ready" hides the map.
- **Idle seats:** they take no visible turn; the session applies `endTurn` for them immediately.
- **Game over:** shows the winner or "no survivors", with buttons for New Game and View Map, which shows the final map unfogged.

## 6. Saving and loading
- **Save format:** `{ format: 1, savedAt, name, initial: GameState, commands: Command[], snapshot: GameState, seats: SeatConfig[] }`.
- **Autosave:** to the slot `autosave` at every turn change.
- **Named slots:** save from an in-game menu.
- **Storage:** IndexedDB through a `SaveStore` interface (`list`, `get`, `put`, `delete`), with an in-memory implementation for tests.
- **Export/import:** a save downloads as a `.json` file and can be imported back. Import validates the format version and structure, then checks that replaying `commands` from `initial` reproduces `snapshot`'s hash. A malformed or mismatched file is rejected with a clear message and nothing is changed.

## 7. Publishing
- `vite.config.ts` sets `base: '/conquest-web/'` for production builds.
- `.github/workflows/pages.yml` runs on every push to `main`: install, run the tests, build, and deploy with the official Pages actions.
- **One-time user step:** repo Settings → Pages → Source: "GitHub Actions".
- **Published URL:** `https://quasitron.github.io/conquest-web/`.

## 8. Testing
- **Engine additions:** unit tests for each item in §3.
- **Map generator:**
  - same seed gives the same map
  - water % within ±3
  - no land component smaller than 4 squares
  - city spacing ≥ 3
  - valid starts for 2–6 players
  - a Huge map generates in under 1 s
- **GameSession** (no browser):
  - Idle seats auto-end
  - hotseat hand-off state
  - autosave on turn change
  - events filtered per player
  - save → load round trip reproduces the state hash
- **Input/camera modules:** screen↔map coordinate math including wrap, zoom clamping, key → direction mapping.
- **Storage:** in-memory `SaveStore` tests; import validation rejects corrupted files.
- **Manual check** in the browser at the end of 2a: start a game, move, capture, set production, hotseat hand-off, save, reload, continue.

## 9. Out of scope for 2a
Standing orders, pathfinding, multi-square moves, turn reports beyond the message log (all 2b); the computer opponent (M3); sound; the map editor; async multiplayer; alliances.
