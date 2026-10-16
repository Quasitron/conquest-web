# Milestone 2c — Global Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Names for cities and units, a city screen and turn-start Production Reports.
- A unit status line, info dialog and vertical action column.
- Dynamic zoom and a full-window title screen.
- Three order-rule fixes: Explore stops at cities, aircraft Patrol, and own units no longer block routes.
- The 2b polish items.

**Architecture:**
- Engine changes stay pure and deterministic.
  - New state fields: `City.name`, `Unit.name`, `Unit.blockedTurns`.
  - New commands: `renameCity`, `renameUnit`.
  - Order-executor changes.
  - `RULES_VERSION` goes to 3.
- Saves get format 3, with a `migrateState2to3` step.
- The UI adds pure helper modules, which get unit tests, and Preact dialogs. All new UI-side command sequences (unload-and-land, city approach) use existing commands only.

**Tech Stack:** TypeScript, Vite, Preact, Vitest, canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-16-m2c-global-command-design.md`. Read it with this plan; section numbers below (§) refer to it.

**Planner's calls beyond the spec:**
1. A fighter whose patrol turns back logs a new reason, `returning` ("low on fuel: heading home"). The spec words this as `lowFuel` with that log line; a separate reason is the only way the log can tell the two cases apart.
2. City attack odds use an exact combat calculation (`combatWinChance`), since the city's damage is always 0 and the attacker is the player's own unit.
3. A loaded game's log can name destroyed units only if they were seen in this session. Otherwise it falls back to "Unit N".

## Global Constraints
- **Commands and checks:**
  - Test: `npx vitest run`. Type check and build: `npm run build`. Both must pass at the end of every task.
  - In PowerShell, refresh PATH first: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.
- **Engine purity:** the engine never reads time, the DOM or `Math.random`. Randomness only comes from `Rng` seeded from state.
- **Files:** UTF-8 **without BOM**. Use ASCII in code comments.
- **Originality:** all names and text are our own. City names are real-world place names, written without diacritics. Nothing comes from the original game.
- **Values and copy:**
  - Name limit: 24 characters. City-list entries: 20 characters at most.
  - Label threshold: 20 px. `MAX_TILE` = 96. Fit margin: 2 squares. Wait limit: 3 turns.
  - Copy strings are exactly as written in the spec and this plan.
- **Hot-seat privacy:** nothing about another player's units beyond their type and owner reaches the viewer.
- **Commits:** commit at the end of each task, with the message given. Never push.

## Review Focus
1. **Hot-seat log names:** a custom unit name must never appear in another player's log or view. Task 7 tests the roster per player.
2. **Renaming to a name with different case,** e.g. "paris" → "Paris", must be allowed for the same city and rejected for another city. Task 1 tests both.
3. **Wrap maps:** the auto-fit box over the seam must not span the whole map. Task 6 tests explored columns {0, 1, 58, 59} on a wrapping 60-wide map.
4. **A loaded 2b save must not crash** when its units lack `name`/`blockedTurns`. The migration fills them, and `gameStateProblem` rejects bad shapes. Task 3 tests a migrated 2b fixture loading with the note.
5. **Waiting units must not wake on turn 1 of waiting,** and a unit blocked by an enemy (not by an own unit) still ends at once with `blocked`. Task 4 tests both.

---

### Task 1: Engine state v3, names, rename commands (+ Task 3's save format 3)

This task also does all of Task 3, in the same commit; see the note there.

**Files:**
- Create: `src/data/cityNames.ts`, `src/engine/names.ts`, `tests/engine/names.test.ts`
- Modify: `src/engine/types.ts`, `src/engine/setup.ts`, `src/engine/query.ts` (`spawnUnit`), `src/engine/apply.ts`, `src/engine/view.ts`, `src/engine/rules.ts` (`RULES_VERSION = 3`), `src/engine/index.ts`
- Also update any existing tests or fixtures that build `City`/`Unit` literals, so the type check passes.

**Interfaces:**
- Produces:
  - `src/data/cityNames.ts`:
    - `export type NameRegion = 'europe' | 'northAmerica' | 'latinAmerica' | 'asia' | 'africaMiddleEast' | 'oceania';`
    - `export const NAME_REGIONS: readonly NameRegion[]` (in that order)
    - `export const CITY_NAMES: readonly { name: string; region: NameRegion }[]`: about 800 entries, at least 80 per region, unique ignoring case, ASCII letters, spaces, hyphens and apostrophes only, at most 20 characters each.
  - `src/engine/names.ts`:
    - `ordinal(n: number): string` ("1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st", "111th")
    - `unitDisplayName(u: Pick<Unit, 'id' | 'type' | 'name'>): string` = `u.name ?? \`${ordinal(u.id)} ${UNIT_STATS[u.type].name}\``
    - `romanSuffix(k: number): string`: '' for 0, ' II' for 1, ' III' for 2, … up to ' XX' for 19
    - `defaultCityName(id: number): string`: `CITY_NAMES` names shuffled once with Fisher-Yates using `new Rng(0x2c2c)`, then `order[id % L] + romanSuffix(Math.floor(id / L))`
    - `cleanName(raw: unknown): string | null`: a trimmed string. Returns null if the input isn't a string, contains `/[\u0000-\u001f\u007f]/`, or is longer than 24 characters after trimming.
    - `export const NAME_MAX = 24`
  - `types.ts`:
    - `City.name: string`
    - `Unit.name: string | null`
    - `Unit.blockedTurns: number`
    - `GameState.version: 3`
    - `OrdersEndReason` adds `'cityFound' | 'returning'`
    - `Command` adds `{ type: 'renameCity'; player; cityId: number; name: string }` and `{ type: 'renameUnit'; player; unitId: number; name: string | null }`
  - `NewGameOptions.cityNames?: string[]`. `createGame` uses `o.cityNames?.[id] ?? defaultCityName(id)`.
  - `PlayerView.knownCities[i].name: string`
  - `RULES_VERSION = 3`
  - `index.ts` re-exports `ordinal`, `unitDisplayName`, `defaultCityName`, `cleanName` and `NAME_MAX`.

- [ ] **Step 1: Write failing tests** in `tests/engine/names.test.ts`:
  - `ordinal` for the 11 values above.
  - `unitDisplayName({id:142,type:'army',name:null}) === '142nd Army'`, and `name:'Old Guard'` returns `'Old Guard'`.
  - `romanSuffix(0)===''`, `romanSuffix(1)===' II'`, `romanSuffix(3)===' IV'`.
  - `defaultCityName(5)` is stable across two calls. `defaultCityName(L + 5) === defaultCityName(5) + ' II'`, where `L = CITY_NAMES.length`.
  - The list rules: each region has at least 80 names, there are no case-insensitive duplicates, and every name matches `/^[A-Za-z][A-Za-z '\-]{0,19}$/`.
  - `cleanName('  Paris ')==='Paris'`; `cleanName('a\u0007')===null`; `cleanName('x'.repeat(25))===null`; `cleanName(5)===null`.
  - Rename tests through `apply` (use `makeGame` from `tests/helpers.ts`):
    - The owner renames a city: `state.cities[0].name === 'Avalon'`.
    - The other player gets `'not your city'`.
    - A duplicate gets `'name already in use'` (rename city 0 to city 1's name in other case).
    - The same city in different case is allowed.
    - `''` for a city gets `'invalid name'`.
    - A unit rename sets the name. `name: ''` and `name: null` both reset it to `null`. A non-owner gets `'not your unit'`.
  - The view test: `getPlayerView(s, 1).knownCities` holds no entry for an unexplored city, and every entry has a `name` string. Player 1's view contains no unit `name` set by player 0 (enemy units only appear as markers).
  - `createGame` with `cityNames: ['A','B',...]` uses them. Without it, `defaultCityName(id)` is used.
  - New units have `name: null` and `blockedTurns: 0`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/names.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the interfaces above.
  - Write the curated name list: well-known real cities, balanced by region, with no city in two regions.
  - `apply` cases `renameCity` / `renameUnit`:
    - Validate with `cleanName`.
    - The city name must be non-empty.
    - For uniqueness, compare `toLowerCase()` against every other city's name.
    - The unit name `''` or `null` becomes `null`.
    - Neither command touches the rng. Neither is added to `fogCommands`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: all pass. Existing tests are updated only where literals need the new fields.
- [ ] **Step 5: Commit:** `git commit -am "feat(engine): city and unit names, rename commands, state v3"` (add the new files first).

### Task 2: Map generator assigns city names by region

**Files:**
- Create: `src/mapgen/names.ts`
- Modify: `src/mapgen/options.ts`, `src/mapgen/generate.ts`, `src/mapgen/index.ts`, `src/app/session.ts` (pass `cityNames`)
- Test: `tests/mapgen/mapgen.test.ts`

**Interfaces:**
- Consumes: `CITY_NAMES`, `NameRegion` (Task 1); `romanSuffix` (Task 1).
- Produces:
  - `WorldOptions.nameRegion: NameRegion | 'world'` (`DEFAULT_WORLD.nameRegion = 'world'`)
  - `assignCityNames(count: number, seed: number, region: NameRegion | 'world'): string[]`
  - `GeneratedWorld.cityNames: string[]`
  - `GameSession.create` passes `cityNames: world.cityNames` to `createGame`.

- [ ] **Step 1: Failing tests:**
  - `assignCityNames(10, 42, 'europe')` gives 10 distinct names, all from the Europe region, and is the same on a second call.
  - With count = (number of Europe names + 5), the first block is all European and the next 5 are non-European.
  - `assignCityNames(L * 2 + 3, 1, 'world')` is unique ignoring case, and its entries from index L on end with `' II'` (index ≥ 2L: `' III'`).
  - `generateWorld({...DEFAULT_WORLD, nameRegion: 'asia'}, 7).cityNames.length === map.cities.length`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Shuffle the region's names with `new Rng(seed ^ 0x51ed27)`, then shuffle the rest of the list with the same Rng and append it.
  - `'world'` shuffles the whole list.
  - Index i ≥ L uses `order[i % L] + romanSuffix(Math.floor(i / L))`.
  - The name assignment must not change which cities or starts are generated: city placement keeps its own Rng.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `"feat(mapgen): seeded city names with a name region"`

### Task 3: Save format 3 and the 2→3 migration — **done as part of Task 1**

Task 1 changes the state version, which breaks the save tests unless storage changes in the same commit. So the Task 1 implementer also does everything below, in the same commit. The Task 1 commit message becomes `"feat: city and unit names, rename commands, state v3, save format 3"`. There is no separate Task 3 dispatch.

**Files:**
- Modify: `src/storage/migrations.ts`, `src/storage/saveFormat.ts`, `src/app/session.ts` (`toSave` format 3)
- Test: `tests/storage/migrations.test.ts`, `tests/storage/storage.test.ts`

**Interfaces:**
- Consumes: `defaultCityName`, `RULES_VERSION` (3).
- Produces:
  - `migrateState2to3(st: Record<string, unknown>): Record<string, unknown>`: `version: 3`. Every city without a string name gets `defaultCityName(id)`. Every unit gets `name: null` (unless it is a string) and `blockedTurns: 0` (unless it is a non-negative integer).
  - `SaveFile.format: 3`. `migrateSave` chains 1→2→3 and rejects anything else with `'unsupported save format'`.
  - `gameStateProblem` requires `version === 3`, each `city.name` a non-empty string, each `unit.name` a string or null, and `unit.blockedTurns` a non-negative integer. Failures read `'invalid cities'` / `'invalid units'`.

- [ ] **Step 1: Failing tests:**
  - `migrateState2to3` on a v2 state: version 3, names filled, `initial` and `snapshot` get identical city names.
  - **The 2b fixture:** build a current game, play a few commands, call `session.toSave()`, then downgrade it with a test helper `toFormat2(save)`: delete `name`/`blockedTurns`, set `version: 2`, `format: 2`, `rulesVersion: 2`. `parseSave` must give `ok`, `note === OLDER_VERSION_NOTE`, `commands.length === 0`, and a snapshot whose cities all have names.
  - The existing 2a fixture still loads with the note.
  - A 2c round trip (`serializeSave(session.toSave())` → `parseSave`) is ok with no note.
  - `gameStateProblem` rejects a unit with `blockedTurns: -1`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `"feat(storage): save format 3 with name migration"`

### Task 4: Order executor — own units, waiting, Explore city stop

**Files:**
- Modify: `src/engine/path.ts`, `src/engine/orders.ts`, `src/engine/apply.ts` (reset `blockedTurns` on `setOrders`), `src/engine/turn.ts` (only if `runPlayerOrders` needs the flag passed)
- Test: `tests/engine/orders.test.ts`, `tests/engine/path.test.ts`, `tests/engine/determinism.test.ts`

**Interfaces:**
- Produces:
  - `PathMap.blockOwn: boolean`. `pathMapFromState(s, pid, opts?: { blockOwn?: boolean })` and `pathMapFromView(v, opts?: { blockOwn?: boolean })` default to `false`.
  - In `enterable`, replace the final own-unit line with: `if (own) return isTarget ? false : (!m.blockOwn || domain === 'air');`. The boarding-with-room line above it stays.
  - `executeOrders(s, rng, u, events, turnStart = false)`. `runPlayerOrders` passes `true`.
  - `ownBlocks(s: GameState, u: Unit, p: Pos): boolean` (not exported) is true when all of these hold:
    - p is not a city
    - p holds an own top-level unit
    - no own host there has room for `u.type`
    - `u` is not air

- [ ] **Step 1: Failing tests:**
  - **Path:** a land path passes through a square with an own army when `blockOwn` is false, and goes around it when true. A target square holding an own army (no room) is unreachable either way.
  - **Bay:** a destroyer on Explore inside a 1-wide bay mouth plugged by an own destroyer. The frontier lies beyond the mouth.
    - Explore doesn't end with `nothingToExplore`. With no detour, it waits: orders kept, `blockedTurns` 1 after the next turn start.
  - **Detour:** an army on goto, with an own army on the direct next square and an open diagonal around it, steps around and arrives.
  - **Waiting:** after 2 turn starts still blocked, the orders are kept and `blockedTurns === 2`. On the 3rd turn start, `ordersEnded` reason `'blocked'` and orders null.
  - **Reset:** a successful step resets `blockedTurns` to 0. `setOrders` (any value) resets it to 0.
  - **Immediate execution** of a new order that is blocked by an own unit keeps the orders and does not increment `blockedTurns`.
  - **Enemies:** a goto whose only route is blocked by a visible enemy unit ends at once with `'blocked'`, as in 2b.
  - **Explore city stop:** an army on Explore steps next to a neutral city that wasn't adjacent before. Result: `ordersEnded` `'cityFound'`, orders null.
    - Starting Explore while already next to that city doesn't end at once for that city.
    - An own city never triggers it.
    - A goto passing next to a neutral city does not stop.
  - **Double log:** reproduce the 2b report (a destroyer exploring a bay that ends with `nothingToExplore`) through `apply` + `endTurn` + `startTurn`. Assert exactly one `ordersEnded` for that unit across the turn's events. If the cause turns out to be in the UI or session (e.g. the log appending the same events twice), fix it there and test it in `tests/app/session.test.ts`. Note the cause in the commit message.
  - **Determinism:** extend the existing replay test with a waiting goto and an Explore that ends `cityFound`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** in `executeOrders`, after computing `next`:

```ts
if (ownBlocks(s, u, next)) {
  const detour = findPath(pathMapFromState(s, u.owner, { blockOwn: true }), u, target);
  if (detour && detour.length > 0 && !ownBlocks(s, u, detour[0])) next = detour[0];
  else {
    if (turnStart) {
      u.blockedTurns += 1;
      if (u.blockedTurns >= 3) return endOrders(u, 'blocked', events);
    }
    return; // wait: orders kept
  }
}
```

  - After a successful `moveUnit`, set `u.blockedTurns = 0`.
  - `endOrders` also sets `blockedTurns = 0`. So do `giveOrders` and `setOrders null` in `apply`.
  - **cityFound (Explore only):**
    - Before the step, collect the ids of known, non-friendly cities within Chebyshev distance 1. Use `s.fog[u.owner].knownCityOwner[c.id] ?? null` for ownership, only on explored squares, with `areFriendly`.
    - After the step and the `updateFog`, the `enemySighted` check comes first.
    - Then, if any such city is adjacent now that wasn't before, end with `'cityFound'`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `"feat(engine): own units no longer block routes; waiting orders; explore stops at cities"`

### Task 5: Aircraft Patrol

**Files:**
- Modify: `src/engine/orders.ts`, `src/engine/combat.ts`
- Test: `tests/engine/orders.test.ts`, `tests/engine/combat.test.ts`

**Interfaces:**
- Produces:
  - `patrolBase(s: GameState, u: Unit, o: { a: Pos; b: Pos }): Pos | null`, exported from `orders.ts`: `a` if it holds an own city or an own carrier, else `b` if it does, else null.
    - An own carrier counts if it has room for one more aircraft, or if `u` is aboard it.
  - `combatWinChance(att: { attack: number; shot: number; hits: number; damage: number }, def: { defense: number; shot: number; hits: number; damage: number }): number`, in `combat.ts`. It is an exact dynamic program over the round model in `resolveCombat`. Task 7 uses it for the odds label.
  - Event reason `'returning'` (added in Task 1): the order fell back to going home.

- [ ] **Step 1: Failing tests:**
  - **Validation:**
    - A fighter in an own city patrols to a square 5 away: accepted when 2×5 ≤ range.
    - A patrol whose far end is (range/2 + 1) away is rejected with `'out of range'`.
    - A patrol with neither end at a city or carrier is rejected with `'patrol must start or end at a city or carrier'`.
    - A patrol based on an own carrier with room is accepted.
    - Explore for aircraft is still rejected with `'aircraft cannot explore yet'`.
  - **Execution:**
    - Across turns, the fighter reaches the far end, flips, returns to the base and refuels (fuel back to full after landing). It keeps patrolling.
    - The base carrier moves away: at the next check, the patrol ends.
      - If an own city is reachable within fuel: the orders become a goto to it, with event reason `'returning'`.
      - Otherwise: reason `'lowFuel'`, orders null.
  - **Combat:**
    - `combatWinChance({attack:2,shot:1,hits:1,damage:0},{defense:2,shot:1,hits:1,damage:0}) === 0.5`
    - with defense 1: `≈ 2/3` (within 1e-9)
    - The sum of win and lose chances is 1 for a 3-hit case.
  - **Determinism:** extend the replay test with an aircraft patrol.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Validation:**
    - Remove the air ban for `patrol` in `validateOrders`. Keep the explore message, renamed to `'aircraft cannot explore yet'`.
    - For air patrols:
      - `base = patrolBase(...)`; null → the base error.
      - `leg = findPath(map, { type: u.type, x: base.x, y: base.y }, far)`. Require `leg && 2 * leg.length <= UNIT_STATS[u.type].range`.
      - Also require `path(u → current target).length + (current target is far ? leg.length : 0) <= u.fuel`. Otherwise `'out of range'`.
  - **Runtime:** in `executeOrders`, for air patrol, before each step recompute the base.
    - If the base is null, or the fuel needed (steps to the current target, plus the leg back when the current target is the far end) exceeds `u.fuel`, then `home = chooseHome(s, u)`.
      - If there is a home: `u.orders = { kind: 'goto', target: home.city }`, push `ordersEnded` `'returning'`, and `continue` the loop.
      - Otherwise: `endOrders(u, 'lowFuel')`.
  - Existing refuel and landing rules apply unchanged.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `"feat(engine): aircraft patrol with a refuel base"`

### Task 6: Camera auto-fit (pure)

**Files:**
- Modify: `src/ui/camera.ts`
- Test: `tests/ui/camera.test.ts`

**Interfaces:**
- Produces:
  - `MAX_TILE = 96`
  - `exploredBox(terrain: readonly (unknown | null)[], width: number, height: number, wrap: boolean): { x: number; y: number; w: number; h: number } | null`
    - In squares. `x` may be any start column on wrap maps.
    - The box spans the explored columns along the shortest circular span: the complement of the largest run of fully unexplored columns.
  - `fitTile(box, viewW: number, viewH: number, margin = 2): number` = clamp `Math.floor(Math.min(viewW / (box.w + 2*margin), viewH / (box.h + 2*margin)))` to `MIN_TILE..MAX_TILE`
  - `autoFit(box, viewW, viewH, ceiling: number | null): { cam: Camera; ceiling: number }`
    - `tile = ceiling === null ? fit : Math.min(ceiling, fit)`
    - The camera is centered on the box center. The returned `ceiling = tile`.
  - `keepInView(cam: Camera, p: Pos, viewW: number, viewH: number): Camera`: the smallest pan that keeps p at least 1 square inside the viewport. The tile size is unchanged.

- [ ] **Step 1: Failing tests:**
  - On a 60×45 non-wrap map with explored squares x 10..14, y 20..22: the box is {10, 20, 5, 3}. `fitTile` at 800×600 is `96` (clamped).
  - On a wrapping 60-wide map with explored columns {0, 1, 58, 59}: the box has `w === 4` (not 60), starting at column 58.
  - `autoFit` with ceiling 40 and fit 60 → tile 40. With ceiling 40 and fit 30 → tile 30, ceiling 30.
  - `keepInView` leaves a camera unchanged when p is inside, and pans it when p is off-screen.
  - Nothing explored → `exploredBox` null.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `"feat(ui): camera auto-fit helpers, larger max zoom"`

### Task 7: UI pure helpers — cycle, buttons, labels, log text, landing, approach, odds

**Files:**
- Create: `src/ui/plans.ts`, `tests/ui/plans.test.ts`
- Modify: `src/ui/cycle.ts`, `src/ui/actions.ts`, `src/ui/keys.ts`, `src/ui/labels.ts`, `src/ui/describe.ts`, `src/app/session.ts` (unit roster)
- Test: `tests/ui/cycle.test.ts`, `tests/ui/actions.test.ts`, `tests/ui/keys.test.ts`, `tests/ui/labels.test.ts`, `tests/ui/describe.test.ts`, `tests/app/session.test.ts`

**Interfaces:**
- Consumes: `unitDisplayName`, `combatWinChance`, `findPath`, `pathMapFromView`, `buildTime`.
- Produces:
  - **`cycle.ts`:** `nextReadyAfter(ready: readonly Unit[], id: number | null): Unit | null`
    - `id` in `ready` with others present → the next one, wrapping. `id` alone in `ready` → itself.
    - `id` not in `ready` → the first unit of `ready` whose id is greater than `id`, else `ready[0]`.
    - `id` null → `ready[0]`. Empty → null.
  - **`keys.ts`:**
    - `ActionId` adds `'info' | 'fit'`. Keys: `i` → info, `z` → fit.
    - `ACTION_LABELS` (in `ActionBar.tsx`, or moved to `actions.ts`) adds `info: { label: 'Info', key: 'I' }` and `fit: { label: 'Fit', key: 'Z' }`.
  - **`actions.ts`:**
    - `export const UNIT_BUTTONS: ActionId[] = ['next','skip','hold','sentry','moveTo','explore','load','unload','patrol','goHome','clearOrders','center','info','disband']`
    - `availableActions` adds `info: true`, `fit: true` and `patrol: true` for all units (the engine validates aircraft patrol). Explore stays `!air`.
  - **`labels.ts`:**
    - `pluralUnit(type: UnitType, n: number): string`: "Army"/"Armies"; the other types add "s".
    - `cargoSummary(cargo: readonly Pick<Unit, 'type'>[]): string`: types in `UNIT_TYPES` order, e.g. "3 Armies", "2 Armies, 1 Fighter".
    - `withArticle(name: string): string`: "an Army", "a Fighter" (by first letter, vowel → "an").
    - `cityLabelVisible(tile: number): boolean` = `tile >= 20`
    - `turnsToComplete(city: City, type: UnitType): number` = `city.production === type ? buildTime(city, type) - city.progress : buildTime(city, type)`
    - `inProductionCount(cities: readonly City[], type: UnitType): number`
    - `statusLine(u: Unit): string`: `"142nd Army · Moves 1/1 · Orders: None"`, plus `" · Fuel 14/20"` for aircraft. It uses `describeOrders`.
  - **Session roster:** `GameSession.unitInfo(pid: PlayerId, id: number): { type: UnitType; name: string } | undefined`.
    - The session keeps one `Map` per player, filled from that player's own units **before and after** each applied command, and at construction from the current state. Entries are never deleted. The name is `unitDisplayName(u)`.
    - Another player's units never enter a player's map.
  - **`describe.ts`:** `describeEvent(e, me, names, lookup?: { unit(id: number): { type: UnitType; name: string } | undefined; city(id: number): string | undefined })`
    - `ordersEnded`:
      - `arrived` → `"<name> arrived."`
      - `returning` → `"<name> low on fuel: heading home."`
      - others → `"<name> stopped: <reason>."`
      - Reasons: blocked "path blocked", enemySighted "enemy sighted", lowFuel "low on fuel", nothingToExplore "nothing left to explore", cityFound "found a city".
    - `cargoUnloaded` → `"<transport name> unloaded <cargoSummary of those ids' types>."`. This fixes "Transport" for carriers.
    - `cityCaptured` → "You captured <city>." / "<player> captured <city>." / "<player> captured <city>, one of your cities!". `<city>` falls back to "a city".
    - `unitProduced` → `"<city> produced <unit name>."`
    - The fallback name for an unknown id is `Unit <id>`.
    - Enemy units are still described by owner and type, as now.
  - **`plans.ts`:**
    - `landingPlan(view: PlayerView, transport: Unit, armyIds: readonly number[]): { unitId: number; dir: Dir }[]`
      - Armies go in ascending id order. Only armies aboard `transport` with `movesLeft > 0` are considered.
      - Each takes the first direction, in order 0..7 (N, NE, … NW), whose wrapped neighbor square is either:
        - explored `'land'` with no own top-level unit, no enemy marker seen this turn, and not already taken in this plan; or
        - an own city.
      - Armies with no such square are left out.
    - `approachSquare(view: PlayerView, u: Unit, city: Pos): Pos | null`
      - Among the 8 neighbors of `city`, in direction order, those reachable by `findPath(pathMapFromView(view), u, sq)`, pick the shortest path. Ties go to the earlier direction.
      - Returns null if none, or if `u` is already adjacent to the city.
    - `cityAttackChance(view: PlayerView, u: Unit, cityOwner: PlayerId | null): number`
      - `combatWinChance` with the unit's attack, shot, hits and damage, against `CITY_COMBAT` defense (1 when `view.rules.easierNeutralCities && cityOwner === null`).
      - Export `CITY_COMBAT` from the engine if needed.
    - `attackLabel(chance: number | null): string`: `"Attack"`, or `"Attack (50%)"` with the percent rounded.

- [ ] **Step 1: Failing tests,** one block per function above, with these exact cases:
  - `nextReadyAfter` for the five cases.
  - `UNIT_BUTTONS` order. Info and fit are always available. Patrol is available for a fighter.
  - `keyToAction('i','KeyI')` gives info. `'z'` gives fit.
  - `pluralUnit('army',3)==='Armies'`, `pluralUnit('fighter',1)==='Fighter'`, `cargoSummary` for [army, army, fighter] is `'2 Armies, 1 Fighter'`, `withArticle('Army')==='an Army'`, `cityLabelVisible(19)===false`, `cityLabelVisible(20)===true`.
  - `turnsToComplete` for the current build with progress 2 of 5 → 3. For another type → its `buildTime`.
  - `statusLine` for an army and for a fighter.
  - Describe:
    - "142nd Army arrived."
    - "3rd Carrier unloaded 2 Fighters."
    - "7th Fighter low on fuel: heading home."
    - "Paris produced 12th Army."
    - "You captured Paris."
  - **Session roster:**
    - Two human seats. Player 0 renames a unit to "Secret". Player 1's `unitInfo` for that id is `undefined`, and player 1's described log contains no "Secret".
    - A unit destroyed in combat still resolves its name for its owner.
  - **`landingPlan`:**
    - direction order
    - a square already used is skipped for the second army
    - squares with an enemy marker are skipped
    - a neutral city is never chosen; an own city is
    - an army with no moves is excluded
    - a coast with one free square lands only one of two armies
  - **`approachSquare`:** picks the nearest neighbor and breaks a tie by direction order. Returns null when adjacent, or when nothing is reachable.
  - **`attackLabel(0.5)==='Attack (50%)'`.** `cityAttackChance` is 0.5 for a fresh army against a neutral city under classic rules, and about 0.667 with `easierNeutralCities`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update `GameScreen.tsx` only as far as needed to keep compiling. Pass `lookup` built from `session.unitInfo(view.me, …)` and city names from `view.knownCities`/`myCities`.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `"feat(ui): helpers for names, cycle, buttons, landing, approach and odds"`

### Task 8: Map rendering — labels, committed route, active cargo, attack hover

**Files:**
- Modify: `src/ui/render.ts`, `src/ui/MapCanvas.tsx` (pass the new options)
- Test: `tests/ui/render.test.ts`

**Interfaces:**
- Consumes: `cityLabelVisible`, `attackLabel` (Task 7).
- Produces: new `DrawOptions` fields:
  - `route: Pos[] | null`: the committed Go-to/Patrol path, drawn as a **solid** 2 px line in `#7fd4ff`
  - `routeLabel: string | null`
  - `attack: { at: Pos; label: string } | null`: a red crosshair (circle plus cross) on the square, with the label in red, drawn instead of the hover preview
  - Labels are drawn for every `view.knownCities` entry when `cityLabelVisible(cam.tile)`: the name centered under the square, bold `Math.round(t*0.32)`px, white fill with a 3 px black stroke.
- **Active cargo:** when `activeId` is a unit with `carriedBy !== null`, the carrier's square (on open map or in a city stack) shows the **active unit's glyph** with the blinking alpha in place of the carrier's glyph. The carrier's cargo badge stays.

- [ ] **Step 1: Failing tests,** using the existing mock-context pattern in `tests/ui/render.test.ts`:
  - The label text "Paris" is drawn at tile 28 and not at tile 16.
  - A route draws a solid line, with `setLineDash` called with `[]`.
  - The attack option draws the label text "Attack (50%)".
  - With the active unit aboard a transport at sea, the glyph text drawn on that square is the army's glyph ('A'), and the transport's glyph is not drawn there.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Draw the labels after the units, so they sit on top. Draw the route before the hover preview.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit:** `"feat(ui): city labels, committed route, attack hover, active cargo glyph"`

### Task 9: Top bar, status line, unit panel, info dialog, blink isolation

**Files:**
- Create: `src/ui/StatusLine.tsx`, `src/ui/UnitInfo.tsx`
- Modify: `src/ui/GameScreen.tsx`, `src/ui/SidePanel.tsx`, `src/ui/ActionBar.tsx`, `src/ui/styles.css`
- Test: `tests/ui/actions.test.ts` (the pure parts); manual browser check

**Interfaces:**
- Consumes: `UNIT_BUTTONS`, `statusLine`, `cargoSummary`, `unitDisplayName` and `nextReadyAfter` (Task 7); the rename commands (Task 1).
- Produces:
  - `<StatusLine unit={Unit | null} onFit={() => void} />`
  - `<UnitInfo view unit onRename={(name: string) => void} onOrders={(at: {x: number; y: number}) => void} onClose />`
  - `ActionBar` renders `UNIT_BUTTONS` filtered by availability, **one per row**, full width, in a scrolling column (`.actions { flex-direction: column; overflow-y: auto }`), each "Label (Key)".

- [ ] **Step 1: Failing test** (pure): `visibleButtons(view, u)`, exported from `ActionBar.tsx` or `actions.ts`, returns the `UNIT_BUTTONS` subset in order, e.g. an army at sea aboard a transport: no load or unload, has sentry.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement:**
  - **Top bar** (spec §5.3):
    - Left: "Turn N", swatch and player name, Orders ▾, Save, Export, Quit.
    - Right (`margin-left: auto`): the status message span, then **End Turn**.
  - **Status line:** a strip above the map in the grid's map column, showing `statusLine(u)` or nothing, with a Fit button at its right end.
  - **Unit panel:**
    - glyph and `unitDisplayName`, orders, moves, health bar, fuel
    - the cargo line `Carrying: <cargoSummary>` as a button that toggles a list of cargo names; clicking a name selects that unit
    - then the action column
  - **Empty states:** "Select a unit or city." and "That unit is gone." each show a **Next unit** button. They also show **End Turn** when `ready.length === 0`.
  - **Health fix:** the `.health` row must not clip in a narrow panel. Let the label wrap below the bar (`.health span { white-space: nowrap }`, with the bar at `flex: 1 1 80px` and `min-width: 0`). Check it at a 260 px panel and at the 760 px mobile breakpoint.
  - **Info dialog:** opens on `info` (I / button), or on a double-click on a unit outside a city.
    - It shows the glyph, a name input with Rename (`renameUnit`), `"x,y (Land|Ocean|City: <name>)"`, the orders, the health bar with "Crippled", type stats (move, attack, defense, hits, range), cargo, an Orders button (opens the context Orders menu at the button), and OK.
    - Esc and OK close it.
    - While it is open, the map keys are off.
  - **Blink isolation:**
    - Move the 250 ms blink state out of `GameScreen` into a small `useBlink()` hook, used only by `MapCanvas` and the End Turn button.
    - Compute `ready` with `useMemo` on `[view, held, skipped]`, and wrap the log and `SidePanel` in `memo` components, so a blink tick re-renders neither.
    - Verify with a temporary `console.count` in the log component during the manual check, then remove it.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS. Manual check: `npm run dev`, then try a narrow window, the info dialog, cargo expand and the empty-panel buttons.
- [ ] **Step 5: Commit:** `"feat(ui): top bar layout, status line, vertical actions, unit info, blink isolation"`

### Task 10: City screen with leader line, and the Production Report

**Files:**
- Create: `src/ui/CityScreen.tsx`, `src/ui/ProductionReport.tsx`, `src/ui/LeaderLine.tsx`
- Modify: `src/ui/GameScreen.tsx`, `src/ui/SidePanel.tsx` (city details: name, Open city screen button), `src/ui/styles.css`
- Test: `tests/ui/labels.test.ts` (the report queue helper); manual browser check

**Interfaces:**
- Consumes: `turnsToComplete`, `inProductionCount`, `withArticle`, `unitDisplayName` (Task 7); `mapToScreen` (camera); the rename commands.
- Produces:
  - `reportQueue(entries: readonly LogEntry[], turn: number, me: PlayerId): { cityId: number; unitId: number; unitType: UnitType }[]`, in `cycle.ts`: this turn's `unitProduced` events for the viewer's cities, ordered by cityId, then unitId.
  - `<CityScreen view city anchor={ {x: number; y: number} | null } onPick={(t: UnitType | null) => void} onRename={(name: string) => void} onClose />`
  - `<ProductionReport view report anchor onRename onProd onHelp onOk />`
  - `<LeaderLine from={ {x,y} } to={ {x,y} | null } />`: a fixed-position SVG line, hidden when `to` is null (city off screen).

- [ ] **Step 1: Failing test** for `reportQueue` (ordering, other players' cities excluded, other turns excluded).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** per spec §5.1 and §5.2.
  - **City screen list:**
    - a No Production row, then one row per `UNIT_TYPES` entry: glyph, name, Turns (`turnsToComplete`), In production (`inProductionCount(view.myCities, t)`)
    - the current choice highlighted
    - ships disabled with `title="Needs a coastal city"` in inland cities
    - a hover tooltip with stats
    - Up/Down to move, Enter to pick and close, Esc to close
    - a progress bar
    - a **City** view with the name input and Rename, the units inside (by name) and the progress, with **Back**
    - **OK**
  - **Position:** the dialog sits beside the city where there is room, else centered. The map centers on the city when it opens. The leader line goes from the dialog edge nearest the city to the city's screen center (`mapToScreen` plus the canvas offset), and is recomputed on camera changes.
  - **When the city screen opens:**
    - after `act()` returns events with `cityCaptured` `by === view.me` (replacing 2b's side-panel select)
    - on a click on an own city with no unit selected
    - on a click on the square of the city the selected unit stands in
    - from Prod. in the report
  - **Turn-start flow:**
    - On `turnKey` change, while playing, build `reportQueue`. While it is non-empty, show the reports one at a time and center on each city.
    - **OK** advances. Esc acts as OK.
    - **Prod.** opens the CityScreen for that city. On its close, the same report shows again.
    - **Help** toggles a stats line with a one-line description of our own for each type.
    - **Rename** sends `renameUnit`.
    - After the last OK, select the first ready unit (built-this-turn first, as in 2b).
    - The map keys are off while a report or the city screen is open.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS. Manual check: capture a neutral city, check the turn-start reports and Prod., check the leader line while panning.
- [ ] **Step 5: Commit:** `"feat(ui): city screen with leader line and turn-start production reports"`

### Task 11: GameScreen interaction fixes

**Files:**
- Modify: `src/ui/GameScreen.tsx`, `src/ui/MapCanvas.tsx` (double-click callback)
- Test: `tests/app/session.test.ts` (unload-and-land sequence); manual browser check

**Interfaces:**
- Consumes: `nextReadyAfter`, `landingPlan`, `approachSquare`, `cityAttackChance`, `attackLabel` (Task 7); camera `exploredBox`/`autoFit`/`keepInView` (Task 6); render options (Task 8).
- Produces:
  - `unloadAndLand(session: GameSession, transportId: number, ids: number[] | null): { landed: number; aboard: number } | string`, exported from a new `src/app/unloadAndLand.ts`. It sends:
    1. `setOrders null` for the transport, if it has orders
    2. `unload`
    3. at sea only: one `move` per `landingPlan` entry, computed on the view after the unload
  - It returns the counts, or the first error.

- [ ] **Step 1: Failing test** in `tests/app/session.test.ts`: a transport at sea on a goto, next to a 2-square coast, with 3 armies aboard.
  - After `unloadAndLand`, the transport's orders are null, 2 armies are on land with `carriedBy === null`, and 1 is aboard and awake.
  - The result is `{ landed: 2, aboard: 1 }`.
  - The same call in an own city behaves like 2b's unload (all leave, none move) and clears the orders.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** in `GameScreen`:
  - **Unload picker:** OK calls `unloadAndLand`. Log via `setMessage`: `"<transport name> landed K <pluralUnit>; M still aboard."` (the second clause only when M > 0).
  - **Move To / Patrol stay on the unit:**
    - After a target-mode or far-click goto/patrol, don't call `settle`: keep the selection.
    - Freeze the hover preview until the pointer moves to a different square.
    - While the selected unit has a goto/patrol, pass `route`/`routeLabel` to the map, from `findPath` to the order's current target with `pathLabel`.
    - N / Space / Next move on with `nextReadyAfter`. Space and Tab on a unit with orders act like Next and don't change its orders.
  - **Next:** use `nextReadyAfter(ready, selectedUnit?.id ?? null)` everywhere.
  - **Dead selection:** after any `act`, if the selected unit no longer exists, select `nextReadyAfter(ready, deadId)`, or clear the selection when nothing is ready. The combat line stays in the log, and the message stays in the top bar.
  - **City click with a unit selected** (replaces the `knownCities`-first branch in `onSquare`):
    - own city not adjacent → goto into it
    - adjacent hostile city → attack via the step target, as in 2b
    - farther hostile city → `approachSquare` → goto there. Null → a red "no known path" preview, and nothing else happens.
    - own unit outside a city → select it
  - **Hover attack:** when the hovered square is in `targets` with `attack: true`, pass `attack: { at, label }` instead of the preview. The label is `attackLabel(cityAttackChance(...))` for a city, else `attackLabel(null)`.
  - **Double-click** a unit outside a city → info dialog.
  - **Auto-fit:**
    - per seat: `{ auto: boolean; ceiling: number | null }`, kept in a `useRef` Map keyed by player
    - `auto` is on at start and load. Wheel or pinch turns it off. The Fit button or Z turns it on and resets `ceiling` to null.
    - At the viewer's turn start, and after each own move that explores new squares (when the explored count grows), apply `autoFit` while auto is on, then `keepInView` for the selected unit.
  - **Stale cargo badge:** reproduce a transport leaving a city that auto-loads an army. Find why the badge showed the old count until the next render (suspected: the `view` memo or `MapCanvas` drawing from stale props), and fix it.
    - Add a regression test if the cause is in a pure module.
    - Otherwise describe what was checked in the commit message.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build`. Expected: PASS. Manual check, each of these:
  - Move To keeps the unit selected with its route showing.
  - A city click 2 squares away gives an order.
  - The Attack label shows.
  - A lost attack selects the next unit.
  - Unload at sea lands armies.
  - The opening zoom fits the explored area.
- [ ] **Step 5: Commit:** `"feat(ui): move-to stays, city-click orders, unload-and-land, auto-fit, dead-unit recovery"`

### Task 12: Title screen layout and the city-name region option

**Files:**
- Modify: `src/ui/TitleScreen.tsx`, `src/ui/styles.css`

**Interfaces:**
- Consumes: `WorldOptions.nameRegion` (Task 2), `NAME_REGIONS` (Task 1).

- [ ] **Step 1: Implement:**
  - **Layout:** `.title` becomes a full-window element (`min-height: 100vh`) with `background: url('/title.webp') top center / cover no-repeat`. Drop the `<img>` hero, and keep the alt text as a visually hidden `h1`.
  - **Very wide windows:** a `::before` layer holds the same image, `cover`, with `filter: blur(24px) brightness(0.5)`. The main image is drawn at `contain`, top center, over it, so the title is never cropped. Use this layered approach on all widths ≥ 800 px.
  - **Menus:** Continue, New game and Saved games sit in a translucent left column: `width: min(420px, 40vw)`, `background: rgba(18,22,28,0.82)`, `backdrop-filter: blur(6px)`, scrolling.
  - **Narrow windows:** below 800 px wide, or in portrait (`@media (max-width: 799px), (orientation: portrait)`), the art sits on top at full width (an `<img>` shown only in that layout), with the menus stacked below.
  - **New Game:** a "City names" select: World (default), Europe, North America, Latin America, Asia, Africa & Middle East, Oceania. It sets `world.nameRegion`.
- [ ] **Step 2: Run** `npx vitest run` and `npm run build`. Expected: PASS. Manual check at 1920×1080, 2560×1080, 390×844.
- [ ] **Step 3: Commit:** `"feat(ui): full-window title screen and city-name region option"`

### Task 13: Docs comment fix, notes, final verification

**Files:**
- Modify: `src/engine/path.ts` (`aircraftCanReach` doc comment), `docs/superpowers/notes/playtest-2026-10-15.md` (add "Status after Milestone 2c")

- [ ] **Step 1: Fix the comment.** Rewrite the corrupted `aircraftCanReach` doc comment in plain ASCII: "Whether an aircraft with `fuel` can safely make a go-to of `steps` to `target`: it must keep one unit of fuel, unless it ends at a refuel point it knows (own city, or own carrier with room)."
- [ ] **Step 2: Scan for BOMs.** Every changed file has no BOM; check with `git diff --name-only main | xargs` and a BOM scan.
- [ ] **Step 3: Update the notes.** Add a "Status after Milestone 2c" section to the playtest notes, listing what 2c covered and what stays "Later".
- [ ] **Step 4: Verify.** Run `npx vitest run` and `npm run build`, and record the test count. Expected: all pass.
- [ ] **Step 5: Commit:** `"docs: 2c status; fix aircraftCanReach comment"`
