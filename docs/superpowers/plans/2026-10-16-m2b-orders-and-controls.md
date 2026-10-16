# Milestone 2b — Orders and Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the following, as the spec defines them:
- standing orders (Sentry, Go-to, Patrol, Explore, Go Home)
- pathfinding with path preview
- the new cargo rules with Load/Unload
- the new keys, action buttons and Orders menu
- unit-cycle polish and map badges
- house rules
- versioned saves with migrations

**Architecture:**
- **Engine** (`src/engine`, pure and deterministic):
  - gains `rules`, `Unit.orders` and `Unit.unloadNextTurn`
  - a pathfinder (`path.ts`) that works from what a player knows
  - an order executor (`orders.ts`) that runs inside `apply` and `startTurn`. Order-driven moves are therefore never logged as commands, and replay re-derives them.
  - cargo commands (`cargo.ts`)
- **Storage:** gains format-2 saves and a migration chain.
- **UI:** gains small pure modules (keys, cycle, actions, labels) with tests, plus thin Preact components and wiring in `GameScreen`.

**Tech Stack:** TypeScript 5.9, Preact 10, Vite 6, Vitest 3, HTML canvas.

**Spec:** `docs/superpowers/specs/2026-10-16-m2b-orders-and-controls-design.md`. Read it before any task. Section references like §3.3 point to it.

## Global Constraints

**Rules and content:**
- Rules follow the original Empire Deluxe manual by default. Every deviation is an opt-in house rule. All house rules default to **off**.
- All art, text and names are original.

**Engine:**
- The engine stays pure and deterministic: no `Math.random`, no `Date`, no DOM in `src/engine`. `npm run typecheck` checks it with `tsconfig.engine.json` (no DOM lib).
- **Iteration order:** iterate units in ascending id where order matters. Path tie-breaks follow direction order N, NE, E, SE, S, SW, W, NW (Dir 0..7).
- **Orders never attack.**

**UI:**
- The UI reads only `PlayerView`s and filtered events. It never reads raw `GameState`.
- Every game change goes through `GameSession.act`.

**Process:**
- Each task ends with the full suite green: `npm test` and `npm run typecheck`.
- Commit on the `m2b` branch with conventional messages (`feat:`, `fix:`, `test:`, `docs:`).

**Windows shell:** in PowerShell, refresh PATH before running `npm`:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

## Review Focus

1. **Orders that can't progress must end, not loop.**
   - Cases: a go-to blocked every turn by its own unit; a patrol whose end is now occupied; explore on a fully explored island.
   - Each ends with an `ordersEnded` event the same turn. `executeOrders` never loops more than `movesLeft` steps. Tests in Task 4.
2. **Reaching the target with the last move still counts as arrival.**
   - A go-to transport that reaches its target city with its last move unloads that turn. It doesn't wait a turn.
   - Test in Task 4: "arrives with exactly enough moves".
3. **An old autosave in IndexedDB still loads.**
   - The browser's existing `autosave` slot holds a format-1 save. Continue must load it through the migration, with the note, not reject it.
   - Test in Task 5: "a format-1 save object from the store loads via parseSave(serializeSave(...))".
4. **Tab and Space must not hijack form controls.**
   - On the New Game screen, and in the Load/Unload picker checkboxes, Tab and Space keep their native behavior.
   - On the map they're game keys and call `preventDefault`. The existing guard on tag names `INPUT`/`SELECT`/`TEXTAREA`/`BUTTON` stays. Test in Task 6, which asserts `keyToAction` returns Tab as `hold` and leaves the guard to `GameScreen`.
5. **A hovered square the unit can't reach shows "no known path".**
   - Includes unexplored squares, enemy cities, and water for armies.
   - The preview must never throw, including over the wrap seam. Tests in Task 2 (findPath returns null) and Task 6 (`pathLabel(null)`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/engine/rules.ts` (new) | `HouseRules`, `CLASSIC_RULES`, `RULES_VERSION` |
| `src/engine/types.ts` | `Orders`, the new `Unit`/`GameState` fields, new commands and events |
| `src/engine/path.ts` (new) | `PathMap` builders, `findPath`, `findFrontier`, `arrivalTurn`, `dirBetween` |
| `src/engine/cargo.ts` (new) | `loadUnits`, `unloadCargo` |
| `src/engine/orders.ts` (new) | `validateOrders`, `executeOrders`, `wakeSentries`, `runPlayerOrders`, `chooseHome` |
| `src/engine/movement.ts`, `turn.ts`, `attack.ts`, `setup.ts`, `apply.ts`, `events.ts`, `view.ts`, `query.ts`, `index.ts` | the rule changes and wiring |
| `src/storage/migrations.ts` (new) | `migrateSave`, `migrateState1to2` |
| `src/storage/saveFormat.ts` | format 2, `rulesVersion`, the older-save path |
| `src/app/session.ts` | rules on create, format-2 saves, `notice` |
| `src/ui/keys.ts` | the new key map |
| `src/ui/cycle.ts` (new) | ready queue: new units first, Skip, Hold |
| `src/ui/actions.ts` (new) | which actions apply to a unit; order text |
| `src/ui/labels.ts` (new) | path label, health text, badge mode, city stack top |
| `src/ui/render.ts` | blink, badges, path preview |
| `src/ui/ActionBar.tsx`, `OrdersMenu.tsx`, `UnitPicker.tsx` (new) | buttons, drop-down/context menu, Load/Unload picker |
| `src/ui/SidePanel.tsx`, `MapCanvas.tsx`, `GameScreen.tsx`, `TitleScreen.tsx`, `describe.ts`, `styles.css` | wiring and log cleanup |
| `tests/helpers.ts` | `makeGame` accepts `rules` |

**Implementer models:**
- Tasks 2, 4 and 9 hold the tricky logic. Use **sonnet** implementers.
- The others are mechanical against this plan. Use **haiku**.
- Reviewers are sonnet. The final whole-branch review is opus.

---

### Task 1: State v2, house rules, classic turn-1 production, elimination timing

**Files:**
- Create: `src/engine/rules.ts`, `tests/engine/rules.test.ts`
- Modify: `src/engine/types.ts`, `setup.ts`, `query.ts` (`spawnUnit`), `turn.ts`, `attack.ts`, `view.ts`, `index.ts`, `src/storage/saveFormat.ts` (accept `version === 2` only), `tests/helpers.ts`
- Update: existing tests that fail only because of the classic turn-1 tick, the version bump, or elimination timing. Expect changes in `turn.test.ts`, `production.test.ts`, `setup.test.ts`, `storage.test.ts` and `session.test.ts`.
  - Prefer passing `rules: { fairFirstTurn: true }` where the test is about something else.
  - Update the expectation where the test is about the changed rule.

**Interfaces:**
- Produces:

```ts
// rules.ts
export interface HouseRules { easierNeutralCities: boolean; fairFirstTurn: boolean; sentriedStayAsGarrison: boolean }
export const CLASSIC_RULES: HouseRules; // all false
export const RULES_VERSION = 2;
// types.ts
export type Orders =
  | { kind: 'sentry' }
  | { kind: 'goto'; target: Pos }
  | { kind: 'patrol'; a: Pos; b: Pos; toB: boolean }
  | { kind: 'explore' };
// Unit gains: orders: Orders | null; unloadNextTurn: boolean   (spawnUnit sets null / false)
// GameState: version: 2; rules: HouseRules
// NewGameOptions gains: rules?: Partial<HouseRules>
// PlayerView gains: rules: HouseRules
// turn.ts: checkEliminations(s, events) is replaced by checkElimination(s: GameState, pid: PlayerId, events: GameEvent[]): void
// tests/helpers.ts makeGame opts gain: rules?: Partial<HouseRules>
// index.ts exports: HouseRules (type), CLASSIC_RULES, RULES_VERSION
```

- [ ] **Step 1: Write failing tests** in `tests/engine/rules.test.ts`:
  - `createGame defaults to classic rules`: `makeGame(M).rules` toEqual `CLASSIC_RULES`, and `version` is `2`.
  - **Classic turn 1:**
    - `classic: player 0's start city ticks at creation`: `makeGame(M).cities[0].progress === 1`
    - `classic: player 1's start city ticks on its turn-1 start`: after `apply(endTurn by player 0)`, `cities[1].progress === 1`
  - `fair first turn: no city ticks on turn 1`: with `rules: { fairFirstTurn: true }`, both progress values stay `0` after player 0's endTurn.
  - **Easier neutral cities:**
    - `easier neutral cities: neutral city defends at 1`: use `fixedRng(0.6)`. With A=2 against D=1, a roll of 0.6 < 2/3 is an attacker hit. With D=2, 0.6 ≥ 0.5 is a defender hit. With the rule on, `attackCity` on a neutral city captures it. With it off, the army is destroyed.
    - `easier neutral cities never applies to enemy-owned cities`: the same roll with the rule on, against a city owned by player 1, destroys the attacker.
  - **Elimination timing:**
    - `elimination is checked only at the end of the player's own turn`: player 1 has no cities and no units, and player 0 ends their turn. Player 1 is **not** eliminated yet, and `currentPlayer === 1`. When player 1 ends their turn, `playerEliminated` for 1 and `gameOver` with winner 0 are emitted.
    - `resign still eliminates immediately` (existing behavior).
- [ ] **Step 2: Run** `npx vitest run tests/engine/rules.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement.**
  - **`createGame`:**
    - `s.rules = { ...CLASSIC_RULES, ...o.rules }`
    - after the fog setup: `if (!s.rules.fairFirstTurn) advanceProduction(s, 0, [])`
  - **`startTurn`:** `if (s.turn > 1 || !s.rules.fairFirstTurn) advanceProduction(...)`.
  - **`passPlay(s, events, endingPid)`:** calls `checkElimination(s, endingPid, events)` only for the player whose turn ended, then `checkWinner`. `resign` keeps eliminating directly.
  - **`attackCity`:** defense is `s.rules.easierNeutralCities && city.owner === null ? 1 : CITY_COMBAT.defense`.
  - **`getPlayerView`:** adds `rules: { ...s.rules }`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Fix the pre-existing tests as described under Files. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(engine): state v2 with house rules; classic turn-1 production and elimination timing`.

---

### Task 2: Pathfinding

**Files:**
- Create: `src/engine/path.ts`, `tests/engine/path.test.ts`
- Modify: `src/engine/index.ts`

**Interfaces:**
- Consumes: `Orders` and the `Unit` fields from Task 1; `normalize`, `index`, `chebyshev`, `DIRS` from `map.ts`; `effectiveMove`, `UNIT_STATS`, `cargoCapacity`.
- Produces:

```ts
export interface PathMap {
  width: number; height: number; wrap: boolean; me: PlayerId; turn: number;
  terrain: (Terrain | null)[];             // null = unexplored
  cityOwner: Map<number, PlayerId | null>; // known cities, by square index; own cities = me
  enemy: Set<number>;                      // squares with an enemy last seen THIS turn (fog.lastSeen turnSeen === turn)
  own: Map<number, { count: number; room: Partial<Record<UnitType, number>> }>;
  // own top-level units on non-city squares; room[type] = free cargo space on hosts there that carry `type`
}
export function pathMapFromState(s: GameState, pid: PlayerId): PathMap;
export function pathMapFromView(v: PlayerView): PathMap;
export function findPath(m: PathMap, u: Pick<Unit, 'type' | 'x' | 'y'>, to: Pos): Pos[] | null;
  // steps after the start, ending at `to`; [] when already at `to`; null when unreachable
export function findFrontier(m: PathMap, u: Pick<Unit, 'type' | 'x' | 'y'>): Pos | null;
export function arrivalTurn(u: Pick<Unit, 'type' | 'damage' | 'movesLeft'>, steps: number, turn: number): number;
export function dirBetween(m: Pick<PathMap, 'width' | 'height' | 'wrap'>, from: Pos, to: Pos): Dir | null; // adjacent only
```

**Passability rules** (§3.5). Square `i` is enterable by unit type `t` when all of these hold:
- it is explored
- it is not in `enemy`
- it is not a known city with an owner other than `me`
- the terrain fits the unit's domain:
  - land units: `land`, or a city owned by `me`
  - sea units: `water`, or a city owned by `me`
  - air units: any explored square
- if `own` has an entry for the square:
  - as an **intermediate** step, it is passable only for air units
  - as the **target**, it is allowed only when `room[t] > 0`. An army can target a transport with room, and a fighter a carrier with room.

The start square is never checked.

**Algorithm:**
- **`findPath`:** A*.
  - cost 1 per step; heuristic `chebyshev`
  - open set: a binary heap ordered by `(f, seq)`, where `seq` is a push counter, so ties are deterministic
  - neighbors expand in Dir order 0..7
  - `own`/`enemy`/`cityOwner` keys are square indices `y * width + x`
- **`findFrontier`:** BFS over intermediate-passable squares, in Dir order.
  - It returns the nearest square at distance ≥ 1 that has an unexplored neighbor.
  - Among squares at that distance, the lowest index wins.

- [ ] **Step 1: Write failing tests** (ASCII maps as in `movement.test.ts`; `*` city, `#` land, `.` water):
  - `finds a shortest land path`: length equals the Chebyshev distance on open land.
  - `uses the wrap seam when shorter` (`wrap: true`)
  - **Domains:**
    - `armies never path over water; ships pass friendly cities but not neutral ones`
  - **What blocks a path:**
    - `unexplored squares block, and an unexplored target returns null`
    - `an enemy seen this turn blocks; one seen last turn does not`
    - `an own army outside a city blocks another army; inside an own city it does not`
    - `an army may target a transport with room, not a full one`
  - `aircraft pass over own units but cannot end on them`
  - `pathMapFromState and pathMapFromView give identical paths`: build a scenario with a city, units and an enemy marker. Compare `findPath` from both.
  - `findPath is deterministic`: two calls give `toEqual` results.
  - `findFrontier returns the nearest explored square bordering unexplored, lowest index on ties; null when nothing is left`
  - **`arrivalTurn`:**
    - army (movesLeft 1), steps 1, turn 5 → 5
    - steps 3 → 7
    - fighter (movesLeft 2), steps 12, turn 5 → 7
    - crippled transport (effective move 1, movesLeft 0), steps 2, turn 3 → 5
- [ ] **Step 2: Run** `npx vitest run tests/engine/path.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `path.ts` as specified. Export all six functions and `PathMap` from `index.ts`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): pathfinding over player knowledge`.

---

### Task 3: Cargo rules, Load and Unload

**Files:**
- Create: `src/engine/cargo.ts`, `tests/engine/cargo.test.ts`
- Modify: `src/engine/types.ts`, `movement.ts`, `turn.ts`, `apply.ts`, `events.ts`
- Update: the 2a test in `tests/engine/movement.test.ts` that expects unloading at every friendly city.

**Interfaces:**
- Consumes: Task 1 fields.
- Produces:

```ts
// types.ts Command additions
| { type: 'load'; player: PlayerId; transportId: number; unitIds: number[] }
| { type: 'unload'; player: PlayerId; transportId: number; unitIds: number[] | null }
// GameEvent addition
| { type: 'cargoUnloaded'; transportId: number; owner: PlayerId; unitIds: number[] }
// cargo.ts
export function loadUnits(s: GameState, t: Unit, unitIds: number[]): string | null;
export function unloadCargo(s: GameState, t: Unit, unitIds: number[] | null, events: GameEvent[]): string | null;
```

**Rules** (§3.4 and §7 items 4 and 6):
- **`relocate`:**
  - Drop 2a's "entering a friendly city unloads".
  - Set `u.unloadNextTurn = false` on every move.
  - The auto-load filter adds `!(s.rules.sentriedStayAsGarrison && a.orders !== null)`.
  - Auto-loaded armies get `orders = { kind: 'sentry' }`.
- **`moveUnit`, host branch** (boarding a transport or landing on a carrier): set `u.orders = { kind: 'sentry' }`.
- **`apply` `move` case:**
  - **Before** moving: `u.orders = null`, because a hand move cancels standing orders.
  - **After** a successful move: if the unit is a `transport`, is in a city it owns, and has cargo, set `unloadNextTurn = true`.
- **`startTurn`**, after the moves reset and before the fog update: for each of the player's transports with `unloadNextTurn`:
  - if it's in its owner's city and `orders === null`, call `unloadCargo(s, t, null, events)`
  - then always clear the flag
- **`loadUnits`:**
  - requires `UNIT_STATS[t.type].carries` and that `t` is in a city its owner owns
  - every id must be an own top-level unit on the same square whose type equals `carries`
  - error `'not enough room'` if there isn't enough room
  - sets `carriedBy` and sentry
  - ignores the garrison house rule
- **`unloadCargo`:**
  - every id must be in the transport's cargo; `null` means all
  - error `'nothing to unload'` when there is no cargo
  - sets `orders = null` on each unloaded unit, plus `carriedBy = null` if the transport is in a city its owner owns
  - pushes `cargoUnloaded`
- **`apply`:**
  - validates that the unit exists and is owned
  - adds `load`/`unload` to the commands after which fog updates
- **`eventsFor`:** shows `cargoUnloaded` only when `mine(e.owner)`.

- [ ] **Step 1: Write failing tests** in `cargo.test.ts`:
  - **Auto-sentry and auto-load:**
    - `an army boarding a transport at sea is sentried`
    - `a fighter landing on a carrier is sentried`
    - `auto-load takes sentried armies by default`
    - `with sentriedStayAsGarrison, auto-load takes only armies without orders`
  - **Moving through cities:**
    - `a transport entering a friendly city keeps its cargo aboard` (`carriedBy` unchanged)
    - `a hand move into a friendly city sets unloadNextTurn; next own turn start unloads and wakes the cargo` (via `apply` endTurn × 2; expect a `cargoUnloaded` event and the cargo with `carriedBy === null`, `orders === null`)
    - `moving the transport out again before the next turn cancels the unload`
    - `a hand move cancels a unit's orders`
  - **The `load` command:**
    - boards the chosen armies in a city
    - rejects too many with `'not enough room'`
    - rejects outside a city
  - **The `unload` command:**
    - at sea wakes the cargo but keeps it aboard
    - in a city releases it
    - with no cargo is rejected
  - `cargoUnloaded is visible only to its owner` (`eventsFor`)
- [ ] **Step 2: Run** `npx vitest run tests/engine/cargo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the rules above.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`, updating the 2a unload test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): cargo auto-sentry, destination unloading, load/unload commands`.

---

### Task 4: Orders executor, setOrders and goHome

**Files:**
- Create: `src/engine/orders.ts`, `tests/engine/orders.test.ts`
- Modify: `src/engine/types.ts`, `apply.ts`, `turn.ts`, `events.ts`, `index.ts`, `tests/engine/determinism.test.ts`

**Interfaces:**
- Consumes:
  - from Task 2: `pathMapFromState`, `findPath`, `findFrontier`, `dirBetween`
  - from Task 3: `unloadCargo`
  - `moveUnit`, `canPlayerSeeUnit`, `updateFog`, `isAtRefuelPoint`
- Produces:

```ts
// types.ts
export type OrdersEndReason = 'arrived' | 'blocked' | 'enemySighted' | 'lowFuel' | 'nothingToExplore';
// Command additions
| { type: 'setOrders'; player: PlayerId; unitId: number; orders: Orders | null }
| { type: 'goHome'; player: PlayerId; unitId: number }
// GameEvent addition
| { type: 'ordersEnded'; unitId: number; owner: PlayerId; reason: OrdersEndReason }
// orders.ts
export function validateOrders(s: GameState, u: Unit, o: Orders): string | null;
export function executeOrders(s: GameState, rng: RandomSource, u: Unit, events: GameEvent[]): void;
export function wakeSentries(s: GameState, pid: PlayerId, events: GameEvent[]): void;
export function runPlayerOrders(s: GameState, rng: RandomSource, pid: PlayerId, events: GameEvent[]): void;
export function chooseHome(s: GameState, u: Unit): { city: City; steps: number } | null;
```

**`validateOrders`** (§3.2 and §7):
- **Positions:** must be integers on the map and explored by `u.owner`.
- **`goto`:**
  - target ≠ current position (`'already there'`)
  - `findPath` must not be null (`'no known path'`)
  - aircraft: path length ≤ `u.fuel` (`'out of range'`)
- **`patrol`:**
  - `a` ≠ `b`
  - a path to `toB ? b : a` must exist
  - aircraft rejected (`'aircraft cannot patrol or explore yet'`)
- **`explore`:** aircraft rejected, with the same message.
- **`sentry`:** aircraft only when `isAtRefuelPoint` (`'aircraft can only sentry in a city or on a carrier'`).

**`chooseHome`:**
- Candidates are own cities; ships take coastal ones only.
- Pick the shortest `findPath`, with ties going to the lowest city id.
- Aircraft only when steps ≤ fuel.
- Returns null if none qualifies.
- `apply` returns `'already home'` when the unit already stands in an own city, and `'no reachable city'` when the result is null.

**`executeOrders` algorithm** (moving orders only; sentry never moves):

```
endOrders(reason): u.orders = null; push ordersEnded { unitId, owner, reason }
arrive(): if u is a transport and a city owned by u.owner is at u's square → unloadCargo(s, u, null, events) (ignore 'nothing to unload'); endOrders('arrived')
loop while u is alive, u.orders is goto/patrol/explore, and u.movesLeft > 0:
  target = goto → o.target; patrol → (o.toB ? o.b : o.a); explore → findFrontier(map, u)
  if explore and target is null → endOrders('nothingToExplore'); stop
  if u is at target: goto → arrive(); stop.   patrol → o.toB = !o.toB; continue
  path = findPath(pathMapFromState(s, u.owner), u, target)
  if path is null or empty → endOrders('blocked'); stop
  if u.fuel !== null and path.length > u.fuel → endOrders('lowFuel'); stop
  next = path[0]; if a non-friendly unit or non-friendly city is at next → endOrders('blocked'); stop
  err = moveUnit(s, rng, u, dirBetween(...next), events); if err → endOrders('blocked'); stop
  if u is no longer in s.units → stop
  updateFog(s, u.owner)
  if goto and u is at o.target → arrive(); stop          // arrival on the last move counts (Review Focus 2)
  if u.carriedBy === null and a non-friendly unit the owner can see (canPlayerSeeUnit) is within Chebyshev 1 → endOrders('enemySighted'); stop
```

**`wakeSentries`:** for each of `pid`'s units with sentry orders, `carriedBy === null`, and a visible enemy within Chebyshev distance 1: `endOrders('enemySighted')`.

**`runPlayerOrders`:**
1. `wakeSentries`
2. for unit ids of `pid` in ascending order (snapshot first) with goto/patrol/explore orders: `executeOrders`
3. `updateFog(s, pid)`

**Wiring:**
- **`startTurn`:** calls `runPlayerOrders` after the pending-unload step and `updateFog`, and before pushing `turnStarted`. `startTurn` needs the `rng`, so thread a `RandomSource` from `apply` through `endTurn` → `passPlay` → `startTurn`. `apply` already creates `rng` and saves `rng.state`.
- **`apply` `setOrders`:**
  - `null` sets `u.orders = null`
  - otherwise: validate, store a `structuredClone`, set `unloadNextTurn = false`, and call `executeOrders` if `movesLeft > 0`
- **`apply` `goHome`:** `chooseHome`, then the same as a `setOrders` goto. Both commands are added to the commands after which fog updates.
- **`eventsFor`:** shows `ordersEnded` only when `mine(e.owner)`.

- [ ] **Step 1: Write failing tests** in `orders.test.ts`. Use `apply` where turn changes matter; otherwise call the functions directly.
  - **Go-to:**
    - `goto moves at once with remaining moves and continues next turn`
    - `goto ends with 'arrived' on reaching the target`
    - `a goto transport arriving at its target city unloads its cargo that turn` (including **arrives with exactly enough moves**)
    - `a goto transport passing through a friendly city keeps cargo aboard and asleep`
    - `goto rejected for an unexplored target, an unreachable target, or the current square`
  - **Patrol and explore:**
    - `patrol reverses at each end and uses all moves`
    - `patrol with a === b is rejected`
    - `explore steps toward unexplored land and ends with 'nothingToExplore' on a fully explored island`
  - **Interruptions:**
    - `orders stop with 'enemySighted' when an enemy becomes adjacent`
    - `a sentry given next to an enemy holds until the owner's next turn start, then wakes`
    - `a goto blocked by an own unit ends with 'blocked' the same turn, and never loops` (assert the event count and that `movesLeft` is unchanged or decreased)
    - `orders never attack: a goto whose next step holds an enemy ends 'blocked'`
    - `sentried cargo is not woken by an adjacent enemy`
  - **Aircraft:**
    - `aircraft: goto beyond fuel rejected 'out of range'`
    - `aircraft: patrol/explore rejected`
    - `aircraft: sentry only at a refuel point`
  - **Go Home:**
    - `goHome picks the nearest own city by path length, lowest id on ties; ships only coastal cities`
    - `goHome in an own city is rejected 'already home'`
  - **Other:**
    - `setOrders null clears orders`
    - `ordersEnded is visible only to its owner`
  - In `determinism.test.ts`, add: `replay with setOrders/goHome/load/unload reproduces the hash`. Build a short game in which orders execute across several endTurns.
- [ ] **Step 2: Run** `npx vitest run tests/engine/orders.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `orders.ts` and the wiring.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): standing orders (sentry, goto, patrol, explore, go home)`.

---

### Task 5: Save format 2, migrations, session plumbing

**Files:**
- Create: `src/storage/migrations.ts`, `tests/storage/migrations.test.ts`
- Modify: `src/storage/saveFormat.ts`, `src/storage/index.ts`, `src/app/session.ts`, `src/ui/TitleScreen.tsx` (pass `note` through only), `tests/storage/storage.test.ts`, `tests/app/session.test.ts`

**Interfaces:**
- Consumes: `RULES_VERSION` and `HouseRules` from Task 1.
- Produces:

```ts
// saveFormat.ts
export interface SaveFile { format: 2; rulesVersion: number; savedAt: string; name: string; seats: SeatConfig[]; initial: GameState; commands: Command[]; snapshot: GameState }
export function parseSave(text: string): { ok: true; save: SaveFile; note?: string } | { ok: false; error: string };
export const OLDER_VERSION_NOTE = 'Loaded from an older version; its history could not be verified.';
// migrations.ts
export function migrateState1to2(st: Record<string, unknown>): Record<string, unknown>;
export function migrateSave(raw: Record<string, unknown>): { ok: true; save: Record<string, unknown> } | { ok: false; error: string };
// session.ts
export interface NewSessionOptions { world: WorldOptions; seed: number; seats: SeatConfig[]; rules?: Partial<HouseRules> }
GameSession.fromSave(save: SaveFile, store: SaveStore | null, note?: string): GameSession  // sets session.notice
GameSession.notice: string | null
```

**Rules:**
- **`migrateState1to2`:**
  - `version: 2`
  - `rules: { easierNeutralCities: false, fairFirstTurn: true, sentriedStayAsGarrison: false }`
  - each unit gets `orders: null` and `unloadNextTurn: false`
- **`migrateSave`:**
  - format 1 → applies the state migration to `initial` and `snapshot`, and sets `format: 2`, `rulesVersion: 1`
  - format 2 passes through
  - anything else is an error: `'unsupported save format'`
- **`parseSave`:** migrates first, then runs the structural checks (`version === 2`, `rules` an object).
  - **When `rulesVersion === RULES_VERSION`:** replay-verifies as today.
  - **Otherwise:**
    - smoke-tests `getPlayerView` for every player on the snapshot
    - returns `{ ok: true, save: { ...save, initial: snapshot, commands: [], rulesVersion: RULES_VERSION }, note: OLDER_VERSION_NOTE }`
- **Session:**
  - `create` passes `rules` to `createGame`
  - `toSave` writes `format: 2`, `rulesVersion: RULES_VERSION`
- **`TitleScreen`:** passes `r.note` into `fromSave`. The display comes in Task 9.

- [ ] **Step 1: Write failing tests:**
  - **Migration:**
    - `migrateState1to2 adds rules (fairFirstTurn true) and unit fields`
    - `a format-1 save loads from its snapshot with the note and an empty history`
  - **Loading:**
    - `a format-1 save object from the store loads via parseSave(serializeSave(...))` (Review Focus 3)
    - `a format-2 save round-trips with replay verification and no note`
  - **Rejection:**
    - `a corrupted format-2 history is rejected`
    - `format 3 is rejected 'unsupported save format'`
  - **Session:**
    - `GameSession.create passes house rules into the game`
    - `fromSave exposes the note as session.notice`

  Build format-1 fixtures in the test: take a v2 game, then delete `rules`, `orders` and `unloadNextTurn`, set `version: 1`, and set `format: 1` with no `rulesVersion`.
- [ ] **Step 2: Run** `npx vitest run tests/storage tests/app`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(storage): save format 2 with migrations and older-save loading`.

---

### Task 6: UI logic modules: keys, cycle, actions, labels

**Files:**
- Create: `src/ui/cycle.ts`, `src/ui/actions.ts`, `src/ui/labels.ts`, `tests/ui/cycle.test.ts`, `tests/ui/actions.test.ts`, `tests/ui/labels.test.ts`
- Modify: `src/ui/keys.ts`, `tests/ui/keys.test.ts` (rewrite for the new map)

**Interfaces:**
- Consumes: `PlayerView` (with the Task 1 fields), `UNIT_STATS`, `Orders`, `LogEntry` from `src/app/session.ts`.
- Produces:

```ts
// keys.ts
export type ActionId = 'next' | 'skip' | 'hold' | 'sentry' | 'moveTo' | 'patrol' | 'goHome' | 'explore'
  | 'load' | 'unload' | 'clearOrders' | 'disband' | 'center' | 'endTurn';
export type KeyAction =
  | { kind: 'move'; dir: Dir }                         // numpad / Home / PgUp / End / PgDn
  | { kind: 'arrow'; dir: Dir; dx: number; dy: number } // arrows: move a selected unit, else pan
  | { kind: 'action'; id: ActionId }
  | { kind: 'escape' };
export function keyToAction(key: string, code: string): KeyAction | null;
// cycle.ts
export function readyUnits(units: readonly Unit[], newIds: ReadonlySet<number>, held: ReadonlySet<number>, skipped: readonly number[]): Unit[];
export function builtThisTurn(entries: readonly LogEntry[], turn: number): Set<number>;
// actions.ts
export function availableActions(view: PlayerView, u: Unit): Record<ActionId, boolean>;
export function loadCandidates(view: PlayerView, t: Unit): Unit[];
export function describeOrders(o: Orders | null): string;
// labels.ts
export function pathLabel(turn: number, arrival: number | null, fuelLeft: number | null): string;
export function healthText(u: Unit): string;
export function badgeMode(tile: number): 'number' | 'dot';
export function cityStackTop(units: readonly Unit[]): Unit | null;
```

**Exact values:**
- **Movement keys:**
  - Arrows: Up → dir 0, dy −3; Right → dir 2, dx 3; Down → dir 4, dy 3; Left → dir 6, dx −3.
  - Numpad 8/9/6/3/2/1/4/7 → dirs 0..7, as today.
  - `Home` → 7, `PageUp` → 1, `End` → 5, `PageDown` → 3.
- **Action keys** (matched case-insensitively on `key`):
  - n next; ' ' skip; Tab hold; s sentry; t moveTo; p patrol; h goHome; x explore; l load; u unload
  - Insert clearOrders; Delete disband; f center; Enter endTurn; Escape escape
  - q w e a d z c return null
- **`readyUnits`:**
  - a unit is ready when `movesLeft > 0`, `orders === null` and it isn't in `held`
  - order: ids in `newIds` first (ascending), then the rest ascending, then any ids in `skipped` moved to the end in `skipped` order
- **`builtThisTurn`:** the `unitId`s of `unitProduced` entries whose `turn` matches.
- **`availableActions`** (§5.3, §7 item 4):
  - `load`: the unit carries something, is in an own city, and `loadCandidates` isn't empty
  - `unload`: it has cargo
  - `goHome`: an own city exists and the unit isn't in one
  - `patrol` and `explore`: not air
  - `sentry`: not air, or air in an own city or `carriedBy !== null`
  - `clearOrders`: `orders !== null`
  - all others: true
- **`describeOrders`:**
  - `'None'`, `'Sentry'`, `'Go-to 34,12'`, `'Patrol 3,4 ↔ 10,12'`, `'Explore'`
- **`pathLabel`:**
  - null → `'no known path'`
  - arrival === turn → `'this turn'`
  - else `'arrives turn N'`
  - when `fuelLeft !== null`, append `' · fuel F'`, or `' · out of range'` if F < 0
- **`healthText`:** `'Health 2/3'` (hits − damage / hits).
- **`badgeMode`:** `tile < 16 ? 'dot' : 'number'`.
- **`cityStackTop`:** the highest id, or null.

- [ ] **Step 1: Write failing tests** covering each exact value above:
  - Tab → `{ kind: 'action', id: 'hold' }`
  - 'q' → null
  - `readyUnits` ordering with new, skipped and held units
  - `availableActions` for an army in a city, a loaded transport in a city, a fighter in the field, and an army at sea aboard a transport
  - `pathLabel` cases, including null
- [ ] **Step 2: Run** `npx vitest run tests/ui`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. `GameScreen.tsx` won't compile against the new `KeyAction` until Task 9. In this task, adapt its key handler minimally:
  - `arrow` moves or pans
  - `action` next/skip/endTurn/center keep 2a behavior
  - `escape` deselects

  Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): new key map and pure helpers for cycle, actions and labels`.

---

### Task 7: Renderer: blink, badges, path preview

**Files:**
- Modify: `src/ui/render.ts`, `tests/ui/render.test.ts`

**Interfaces:**
- Consumes: from Task 6, `badgeMode`, `cityStackTop`.
- Produces: `DrawOptions` gains:

```ts
activeId: number | null;      // the blinking unit
blinkOn: boolean;             // false → the active unit is drawn at alpha 0.25
path: Pos[] | null;           // preview path from the selected unit (excluding start)
pathOk: boolean;              // false → draw the preview in red
pathLabel: string | null;     // drawn near the last path square
```

**Drawing rules** (§5.5):
- **City badge:** for each own city with own top-level units in it:
  - draw `cityStackTop`'s glyph at ~60% size in the city's top-left
  - if there are 2 or more units, add a count badge in the top-right: a white circle with a dark number
  - when `badgeMode(tile) === 'dot'`, draw a single white dot instead of both
- **Cargo badge:** transports and carriers with cargo get the same count badge (or dot). This replaces the white square.
- **Path preview:** a dotted polyline through the square centers (`setLineDash([3, 3])`), in white, or `#ff3b3b` when `!pathOk`. Then `pathLabel` as text by the last square.

- [ ] **Step 1: Write failing tests** with the existing `fakeCtx`. Extend it to record `fillText` strings and `arc` calls.
  - `a city holding 3 own armies shows the count '3'`
  - `a transport with 2 armies shows '2'`
  - `below 16px tiles badges become dots (no count text)`
  - `the path label is drawn when a path is given`
  - `drawMap accepts the new options with activeId null and path null` (existing tests pass the new fields)
- [ ] **Step 2: Run** `npx vitest run tests/ui/render.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Pass defaults (`activeId: null, blinkOn: true, path: null, pathOk: true, pathLabel: null`) from `MapCanvas` until Task 9.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): city and cargo badges, blinking unit, path preview drawing`.

---

### Task 8: Panel components: action bar, Orders menu, picker, unit details

**Files:**
- Create: `src/ui/ActionBar.tsx`, `src/ui/OrdersMenu.tsx`, `src/ui/UnitPicker.tsx`
- Modify: `src/ui/SidePanel.tsx`, `src/ui/styles.css`

**Interfaces:**
- Consumes: from Task 6, `ActionId`, `availableActions`, `describeOrders`, `healthText`, `loadCandidates`.
- Produces:

```ts
export const ACTION_LABELS: Record<ActionId, { label: string; key: string }>;
  // next 'Next' 'N'; skip 'Skip' 'Space'; hold 'Hold' 'Tab'; sentry 'Sentry' 'S'; moveTo 'Move To' 'T'; patrol 'Patrol' 'P';
  // goHome 'Go Home' 'H'; explore 'Explore' 'X'; load 'Load' 'L'; unload 'Unload' 'U'; clearOrders 'Clear Orders' 'Ins';
  // disband 'Disband' 'Del'; center 'Center' 'F'; endTurn 'End Turn' 'Enter'      (in ActionBar.tsx)
export function ActionBar(p: { view: PlayerView; unit: Unit; onAction: (id: ActionId) => void }): JSX.Element;
  // buttons: next, skip, hold, sentry, moveTo, center, disband, plus load/unload when available; hidden when unavailable; text "Next (N)"
export function OrdersMenu(p: { view: PlayerView; unit: Unit | null; at: { x: number; y: number } | null; onAction: (id: ActionId) => void; onClose: () => void }): JSX.Element;
  // at === null → renders as the top-bar drop-down (button "Orders ▾" toggling a list); at set → absolutely positioned context menu
  // items in order: moveTo, patrol, goHome, explore, sentry, load, unload, clearOrders, skip, hold, disband; greyed (disabled) when unavailable or unit null
export function UnitPicker(p: { title: string; units: Unit[]; onConfirm: (ids: number[]) => void; onCancel: () => void }): JSX.Element;
  // checkbox per unit ("Army #12"), "All" toggles every box, OK confirms checked ids, Cancel closes
// SidePanel Props gain: onAction: (id: ActionId) => void
```

- **`UnitDetails`:**
  - shows `Orders: {describeOrders(u.orders)}`
  - replaces "Hits x/y" with a health bar (`<meter>` or a styled div) labelled `healthText(u)`, plus `Crippled` when `isCrippled(u)`
  - renders `<ActionBar>` instead of the lone Disband button
- Every button blurs itself on click, following 2a's `blur` helper pattern, so keys keep going to the map.
- This task is components only. They are wired into `GameScreen` in Task 9.

- [ ] **Step 1:** Implement the three components and the `SidePanel` changes. These components have no unit tests; their logic is in Task 6's tested modules.
- [ ] **Step 2: Run** `npm test` and `npm run typecheck`. Expected: PASS. Temporarily pass `onAction={() => {}}` where `SidePanel` is used.
- [ ] **Step 3: Commit** `feat(ui): action bar, orders menu, unit picker, clearer unit details`.

---

### Task 9: Game screen wiring: target mode, preview, cycle, menus, log

**Files:**
- Modify: `src/ui/GameScreen.tsx`, `src/ui/MapCanvas.tsx`, `src/ui/describe.ts`, `src/ui/styles.css`, `tests/ui/describe.test.ts`

**Interfaces:**
- Consumes everything from Tasks 2 and 5–8.
- **`MapCanvas` Props:**
  - gains `onHover: (p: Pos | null) => void` (pointer move over a square; null on leave)
  - gains `onContext: (p: Pos, client: { x: number; y: number }) => void` (right-click, or a 500 ms touch long-press without movement)
  - `onDeselect` is removed: right-click no longer deselects
  - gains the Task 7 draw fields as props

**Behavior** (§5.1–§5.6):
- **State in `GameScreen`:**
  - `held: Set<number>` and `skipped: number[]`, both reset at the start of the viewer's turn
  - `target: null | 'moveTo' | 'patrol'`
  - `hover: Pos | null`
  - `menu: { x: number; y: number } | null`
  - `picker: null | 'load' | 'unload'`
  - `blinkOn`, toggled every 250 ms by `setInterval` while `phase === 'playing'`
- **Ready queue:**
  - `readyUnits(view.myUnits, builtThisTurn(session.log(view.me), view.turn), held, skipped)`
  - **Next** selects the unit after the current one in that list, wrapping round.
  - **Skip** appends the id to `skipped` and selects the next unit.
  - **Hold** adds the id to `held` and selects the next unit.
  - At turn start, select `readyUnits(...)[0]`.
- **Actions → commands:**

  | Action | Command |
  |---|---|
  | sentry | `setOrders {kind:'sentry'}` |
  | explore | `setOrders {kind:'explore'}` |
  | goHome | `goHome` |
  | clearOrders | `setOrders null` |
  | disband | confirm, then `disband` |
  | moveTo / patrol | enter target mode |
  | load | open the picker with `loadCandidates`; OK → `load` |
  | unload | open the picker with the cargo (in a city or at sea); OK → `unload` (with **All** pressed → `unitIds: null`) |
  | center | as in 2a |
  | endTurn | as in 2a |

  After any order command, if the unit is no longer ready, select the next one.
- **Click on a square** (`onSquare`):
  - **In target mode:**
    - moveTo → `setOrders {kind:'goto', target: p}`
    - patrol → `setOrders {kind:'patrol', a: unitPos, b: p, toB: true}`
    - then leave target mode
  - **Otherwise, in this order:**
    1. an adjacent step target → move (2a)
    2. own unit or city → select
    3. with a unit selected, any other explored square → `setOrders goto`
    4. else deselect
- **Hover preview:**
  - when a unit is selected and `hover` is set and not the unit's square: `path = findPath(pathMapFromView(view), unit, hover)`
  - `arrival = path ? arrivalTurn(unit, path.length, view.turn) : null`
  - `fuelLeft = unit.fuel === null ? null : (path ? unit.fuel - path.length : null)`
  - label = `pathLabel(view.turn, arrival, fuelLeft)`; `pathOk` = path !== null && (fuelLeft === null || fuelLeft >= 0)
  - memoize on (`unit.id`, `hover`, `view`)
- **Keys:**
  - `arrow`: move the selected unit, else pan
  - `move`: move the selected unit
  - `action`: dispatch as above. Call `preventDefault` for Tab and Space.
  - `escape`: close the menu or picker, else leave target mode, else deselect
  - The existing tag-name guard stays.
- **Right-click or long-press** with a unit selected opens `OrdersMenu` at the cursor. The top bar gets an `OrdersMenu` with `at={null}`.
- **End Turn:**
  - when `readyUnits` is empty and `phase === 'playing'`, add the CSS class `blink` to the End Turn button, a 1 s opacity pulse
  - show "All units have moved. Press Enter or click End Turn."
  - when the viewer has no units and no cities, show "You have no cities or units left." instead
- **Notice:** show `session.notice` once in the message area when the game opens.
- **Log** (`describe.ts` and the markup):
  - `turnStarted` → null, so there are no per-turn lines
  - `ordersEnded` → `'{Unit} {id} stopped: arrived.'` / `'…: path blocked.'` / `'…: enemy sighted.'` / `'…: low fuel.'` / `'…: nothing left to explore.'`
  - `cargoUnloaded` → `'Transport {id} unloaded {n} unit(s).'`
  - Render the log as a `<ul class="log">`. Before the first entry of each turn, insert `<li class="turn-divider">Turn N</li>`; the list is newest first, so the divider sits above that turn's entries.

- [ ] **Step 1: Write failing tests** in `describe.test.ts`:
  - `turnStarted is not described`
  - `ordersEnded reasons read as plain text`
  - `cargoUnloaded counts units`
- [ ] **Step 2: Run** `npx vitest run tests/ui/describe.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `describe.ts`, then the `MapCanvas` and `GameScreen` wiring.
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Manual smoke test in the dev server:**
  - Start `npm run dev` via `preview_start` using `.claude/launch.json`. Create it if it's missing, with config name `dev`, `npm run dev`, port 5173.
  - Check:
    - a new game starts and an army blinks
    - S sentries it and the cycle moves on
    - hovering a far square shows a path and label
    - clicking it sets Go-to
    - right-click opens the Orders menu
    - End Turn blinks when everything has moved
  - Report what you saw.
- [ ] **Step 6: Commit** `feat(ui): orders, target mode, path preview, unit cycle and log cleanup in the game screen`.

---

### Task 10: New Game house rules and loaded-save notice

**Files:**
- Modify: `src/ui/TitleScreen.tsx`, `src/ui/styles.css`

**Interfaces:**
- Consumes: from Task 1, `HouseRules` and `CLASSIC_RULES`; from Task 5, `NewSessionOptions.rules`.

**Behavior:**
- A "House rules" fieldset on the New Game screen with three checkboxes, all unchecked by default, each with a one-line hint:
  - **Easier neutral cities:** "Neutral cities defend at half strength (about 2 in 3 attacks succeed)."
  - **Fair first turn:** "No city builds on turn 1, so the first player gets no head start."
  - **Sentried armies stay as garrison:** "Transports leaving a city don't pick up armies on Sentry."
- The chosen rules go to `GameSession.create({ world, seed, seats, rules })`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Run** `npm test`, `npm run typecheck` and `npm run build`. Expected: PASS.
- [ ] **Step 3: Manual check:** start a game with "Easier neutral cities" on, and confirm in a session test or by hand that `view.rules.easierNeutralCities` is true.
- [ ] **Step 4: Commit** `feat(ui): house rules on the New Game screen`.

---

### Task 11: Wrap-up

- [ ] **Step 1:** Run `npm test`, `npm run typecheck` and `npm run build`. Expected: all green. Record the test count.
- [ ] **Step 2:** Append to `docs/superpowers/notes/playtest-2026-10-15.md` a short "Status after 2b" list: which notes 2b covered and which moved to 2c or later, following spec §1's split table.
- [ ] **Step 3: Commit** `docs: record 2b coverage of playtest notes`.
- [ ] **Step 4:** Final whole-branch review (opus). Then finish the branch with superpowers:finishing-a-development-branch. A push to `main` deploys to the live site.
- [ ] **Step 5: Manual check by the user on the deployed site:**
  - play a turn mouse-only
  - Sentry an army
  - Go-to across a continent
  - ship armies through a gateway city to a destination
  - load a 2a autosave
