# Milestone 2b — Orders and Controls: Design Spec

Date: 2026-10-16 · Status: Draft for review
Parent spec: `2026-10-14-conquest-web-design.md` (binding where this document is silent)
Builds on: Milestone 2a (`2026-10-14-m2a-playable-sandbox-design.md`, merged to main)
Input: `docs/superpowers/notes/playtest-2026-10-15.md` (the user's playtest notes and agreed decisions)

## 1. Goal

Take the tedium out of a turn.
- Units keep standing orders across turns: Sentry, Go-to, Patrol, Explore, Go Home.
- Cargo stays asleep until it's unloaded.
- Each turn flows from one unit to the next, and the active unit is obvious.
- Every action can be done with the mouse alone.
- New units and cargo are visible on the map.

The groundwork for later milestones also comes in 2b:
- a **house rules** framework, with the first rule, "Easier neutral cities"
- **save migrations**

### Split (decided 2026-10-16)
The playtest notes were too large for one milestone.

| Milestone | Contents |
|---|---|
| **2b (this spec)** | Orders, pathfinding, cargo rules, controls, unit cycle, map badges, house rules, save migrations, message-log cleanup |
| **2c** | City names (region, rename), unit names, the city screen dialog, the turn-start Production Report, unit status line and info dialog, dynamic zoom, title screen layout |
| **Later** | Status report and stats counters, survey mode, combat narration and flash, settings screen, Escort order, multiple turns per seating, sound, art |

**Why this order:**
- Orders are what makes play tedious today, so they come first.
- 2b is mostly engine and input work. 2c is mostly new dialogs, and it builds on 2b's state and save versioning.
- Each half is playable and testable on its own.

### Success criteria
- The user can:
  - put an army on Sentry and not see it again until an enemy comes next to it
  - send a unit across the map with one Go-to
  - ship armies by transport without the cycle offering the cargo every turn
- They can play a whole turn with the mouse only.
- Units in cities and cargo counts are visible on the map.
- New Game offers the house rules. With all of them off, play follows the original rules.
- A 2a save still loads, with a note.

## 2. Rules decisions

### House rules (all default **off**, meaning classic play)
| Rule | When on |
|---|---|
| **Easier neutral cities** | Neutral cities defend at Defense 1 (about 67% capture per army). Enemy-owned cities always defend at 2. |
| **Fair first turn** | No city makes production progress on turn 1. This is 2a's behavior. When off, player 0's cities tick on turn 1, as in the original. |
| **Sentried armies stay as garrison** | A transport leaving a city auto-loads only armies without orders. When off, it loads any armies, up to capacity. |

### Review of 2a deviations (decided 2026-10-16)
1. **Turn-1 production:** becomes the "Fair first turn" house rule above.
2. **Elimination timing:** restore the original.
   - A player is checked for elimination only at the end of their own turn, and on resign.
   - A player left with nothing still gets their turn. The UI tells them "You have no cities or units left" and they can only End Turn.
3. **Aircraft end-of-turn:** keep it. It's an implementation of the original rule, not a change.
4. **Multiple turns per seating:** not implemented yet. Listed under "Later". No change in 2b.
5. **No survivors:** keep it. It's a technical edge case.
6. **Unit stats:** no change.

## 3. Engine changes

### 3.1 State
- `GameState.version` becomes `2`.
- New fields:
  - `GameState.rules: HouseRules`, where `HouseRules = { easierNeutralCities: boolean; fairFirstTurn: boolean; sentriedStayAsGarrison: boolean }`. It is set by `createGame` (option `rules`, default all false).
  - `Unit.orders: Orders | null` (null means awake, waiting for the player).
  - `Unit.unloadNextTurn: boolean` (transports only; see §3.4).
- `Orders`:
  - `{ kind: 'sentry' }`
  - `{ kind: 'goto'; target: Pos }`
  - `{ kind: 'patrol'; a: Pos; b: Pos; toB: boolean }`
  - `{ kind: 'explore' }`
- Go Home is not stored separately. It resolves to a `goto` whose target is the chosen home city.
- `PlayerView.myUnits` carries the new fields.
- `PlayerView` gains `rules`.

### 3.2 Commands
| Command | Effect |
|---|---|
| `setOrders { unitId, orders }` | Validates the order, stores it, and, if the unit has moves left, executes it at once (§3.3). `orders: null` clears the orders: this is Clear Orders (Ins) and also wakes a unit. |
| `goHome { unitId }` | Picks the nearest reachable home city by path length (§3.5). Ties go to the lowest city id. For ships, only coastal cities qualify. Then it behaves as `setOrders` with a goto. Rejected if no city is reachable. |
| `load { transportId, unitIds }` | In a city: the listed armies there (or fighters, for a carrier) board the transport, up to capacity. Loaded units get `sentry`. |
| `unload { transportId, unitIds \| null }` | `null` means all cargo. Cargo is woken (orders cleared). In a city, it also leaves the transport, so `carriedBy` becomes null. At sea, it stays aboard but awake, so the player can step it onto adjacent land. |

- Every existing command keeps its behavior except as noted here.
- Skip (Space) and Hold (Tab) are UI-only, as 2a's skip was. They aren't engine commands and aren't saved.

**Validation:**
- Go-to and patrol targets must be on the map and explored. An explored target is the only kind the player can choose.
- The target must be reachable (§3.5). Otherwise the command is rejected with "no known path".
- Aircraft:
  - may take `goto` only if the path fits in their remaining fuel
  - may not take `patrol` or `explore` in 2b
  - may take `sentry` only in a city or on a carrier

### 3.3 Executing orders
- **When orders run:**
  - in `startTurn`, for every unit of the new current player, in unit-id order, after production, repair/moves reset, the pending-unload step (§3.4) and the fog update
  - immediately when an order is given to a unit with moves left
- **Execution:** each step is a normal `moveUnit`, so all movement, cargo and combat rules apply. Orders never attack. If the next step would be an attack, or onto an enemy city, execution stops and the unit wakes.
- **Go-to:**
  - recomputes its path (§3.5) before each step
  - on arrival, it clears its orders and the unit wakes. This raises an `ordersEnded` event with reason `arrived`.
- **Patrol:**
  - walks toward `b`, then toward `a`, and so on, flipping `toB` at each end
  - uses all its moves every turn
- **Explore:**
  - steps toward the nearest known reachable square that borders an unexplored square (BFS over §3.5's passable squares)
  - ties break by lowest square index
  - ends with reason `nothingToExplore` when there's none
- **Sentry:** never moves.
- **Interruptions:** orders end and the unit wakes, with an `ordersEnded { unitId, reason }` event, when:
  - `enemySighted`: an enemy unit is visible adjacent to the unit. Sentry checks at turn start and after any own move. Moving orders check after each step.
  - `blocked`: there is no path any more, or the next step is refused
  - `lowFuel`: an aircraft's remaining fuel no longer reaches the target
  - `arrived` or `nothingToExplore`, as above
- **Cargo exception:** units aboard a transport or carrier are not woken by sightings. Only Unload, or arriving at the transport's destination city, wakes them.

### 3.4 Cargo rules
- **Auto-sentry:**
  - An army that boards a transport, by moving onto it, auto-load, or `load`, gets `sentry`.
  - So does a fighter that lands on a carrier. Under the original rules a carrier's fighters may act normally; the player wakes them to launch.
  - Units with orders are left out of the unit cycle.
- **Auto-load when leaving a city:** as in 2a and the original. Up to capacity, any armies, or only armies without orders when "Sentried armies stay as garrison" is on.
- **Unloading in a city.** This replaces 2a's "unload at every friendly city".
  - **On go-to:** a transport whose go-to target is this city unloads its armies on arrival. Its cargo leaves the transport, awake.
  - **Passing through:** a transport on go-to that passes through, or ends its turn in, a city that isn't its target keeps its cargo aboard and asleep.
  - **Moved by hand:** a transport moved into a friendly city by a plain `move` gets `unloadNextTurn = true`.
    - At its owner's next turn start, if it is still in that city with no orders, its cargo unloads and wakes.
    - Any move or order on the transport clears the flag.
- **Unload at sea** (`unload` away from a city) only wakes the cargo. The armies step off onto land as normal moves.

### 3.5 Pathfinding (`src/engine/path.ts`, pure)
- **Interface:** `findPath(map: PathMap, unit, from, to): Pos[] | null`, using A* over 8 directions with wrap. Each step costs 1. Ties break deterministically, by direction order N, NE, E, … NW.
- **`PathMap` describes what the owner knows.** Builders exist for `(GameState, pid)` and for `PlayerView`, so the engine and the UI's preview get identical answers.
  - Only explored squares are used.
  - City ownership comes from the player's knowledge.
  - Squares holding visible enemy units, or enemy markers seen this turn, are blocked.
  - Squares holding own units are blocked where stacking is illegal: anywhere except friendly cities, and a transport or carrier with room for this unit type.
- **Passable squares by domain:**
  - land units: land and friendly cities
  - sea units: water and friendly cities
  - air units: any explored square
- An enemy or neutral city is never part of a path, not even as the target.
- **Arrival estimate:** `arrivalTurn(unit, steps, turn)` returns `turn` if `steps ≤ movesLeft`, otherwise `turn + ceil((steps − movesLeft) / effectiveMove(unit))`.

### 3.6 Other rule changes
- `attackCity` uses Defense 1 when `rules.easierNeutralCities` is on and `city.owner === null`.
- Production on turn 1 follows `rules.fairFirstTurn`. With it off, `createGame` also runs player 0's turn-1 production tick, because game creation counts as player 0's turn start.
- Elimination timing: §2, item 2.
- New events:
  - `ordersEnded { unitId, reason }`
  - `cargoUnloaded { transportId, unitIds }`
  - `eventsFor` shows both only to the owner.

## 4. Saves and migrations
- `SaveFile.format` becomes `2`, with a new field `rulesVersion: number`. The engine exports `RULES_VERSION = 2`.
- **`migrateSave(raw)`:**
  - upgrades step by step (format 1 → 2, later 2 → 3, …)
  - fills defaults: `rules` all false, except `fairFirstTurn: true` for saves from 2a, which matches how those games were played; `orders: null`; `unloadNextTurn: false`
- **Verified load:** only a save whose `rulesVersion` equals `RULES_VERSION` is replay-checked, as in 2a.
- **Older saves** load from their migrated snapshot:
  - The migrated snapshot becomes the new `initial`, and `commands` becomes empty, so the history restarts there.
  - The game shows "Loaded from an older version; its history could not be verified."
  - The structural checks and the per-player view smoke test still run.
- Migrations live in `src/storage/migrations.ts`, with one function per step, each with tests.

## 5. UI

### 5.1 Keys
The movement letter keys (Q W E / A D / Z X C) are removed.

**Movement:**
| Key | With a unit selected | With no unit selected |
|---|---|---|
| Arrows | move N / S / W / E | pan the map |
| Numpad 1–9; Home / PgUp / End / PgDn | move (Home, PgUp, End, PgDn are the diagonals NW, NE, SW, SE) | — |

**Orders and other actions:**
| Key | Action |
|---|---|
| N | Next unit |
| Space | Skip: to the back of this turn's queue |
| Tab | Hold: done this turn. It never moves browser focus while the map has the game. |
| S | Sentry |
| T | Move To (target mode) |
| P | Patrol (target mode) |
| H | Go Home |
| X | Explore |
| L | Load (transport/carrier in a city) |
| U | Unload |
| Insert | Clear Orders |
| Delete | Disband (asks for confirmation) |
| F | Center |
| Enter | End Turn |
| Esc | cancel target mode, else deselect |

### 5.2 Mouse and target mode
- **Hovering** a square with a unit selected shows a **path preview**: a dotted line along `findPath`, plus a label "this turn" or "arrives turn N".
  - The line is red with "no known path" when the square is unreachable.
  - For aircraft, the label also shows the fuel left on arrival, or "out of range".
- **Clicking with a unit selected:**
  - an adjacent square: moves or attacks, as in 2a
  - a farther square that doesn't hold one of your units or cities: sets Go-to
  - your own unit or city: selects it
- **Target mode** (T or P, or the matching buttons): the next click on any explored square sets the order. Esc or right-click cancels it.
- **Right-click on the map** with a unit selected opens the Orders menu at the cursor. On touch, a long-press does the same. This replaces 2a's right-click deselect; Esc still deselects.

### 5.3 Buttons and the Orders menu
- **Unit panel action bar:**
  - Next (N), Skip (Space), Hold (Tab), Sentry (S), Move To (T), Center (F), Disband (Del)
  - plus Load (L) and Unload (U) when they apply
- Buttons that don't apply are hidden.
- **Top bar:** an **Orders ▾** drop-down that lists every order with its key: Move To, Patrol, Go Home, Explore, Sentry, Load, Unload, Clear Orders, Skip, Hold, Disband. Orders that don't apply are greyed out.
- **Load/Unload picker:** a small dialog listing the candidate units, with checkboxes, **All** and **OK**.

### 5.4 Unit cycle and turn flow
- **Start of turn:** the engine has already run standing orders (§3.3). The session then selects the first ready unit and centers on it.
  - A ready unit has moves left, no orders, and isn't Held.
  - **Units built this turn come first**, then units in id order.
- **The active unit blinks** on the map, about 2 Hz.
- **Orders that ended this turn** (`ordersEnded`) bring their unit back into the cycle. The log says why, for example "Army 12 stopped: enemy sighted."
- **When no ready units remain:**
  - the top bar shows "All units have moved. Press Enter or click End Turn."
  - **End Turn blinks**
- **A player with nothing left** sees "You have no cities or units left" (§2, item 2).
- **Newly captured cities:** as in 2a. The prominent city screen comes in 2c.

### 5.5 Map and panel
- **City badge:** a city with your units in it shows the top unit's icon, plus a count badge when there are 2 or more. The top unit is the most recently built, else the highest id.
- **Cargo badge:** transports and carriers show a number badge for their cargo count. This replaces 2a's small white square.
- **Small tiles:** below 16 px tiles, both badges fall back to a dot.
- **Badge style:** one style, shared by both badges.
- **Unit panel:**
  - shows the current order (e.g. "Orders: Go-to 34,12")
  - replaces "Hits 1/1" with a **health bar** labelled "Health 2/3" (hits minus damage), plus "Crippled" when crippled
- **New Game screen:** a "House rules" section with the three checkboxes from §2, each with a one-line explanation. All are unchecked by default.

### 5.6 Message log
- Use a plain list, not an `<ol>`, so there are no "1. 2. 3." numbers.
- Drop the per-turn "Turn N: Player" lines. A small divider shows the turn number between turns that have entries.

## 6. Testing
- **Engine:** unit tests for:
  - each order: execution, arrival, patrol reversal, explore termination
  - each interruption reason
  - Go Home choice
  - load/unload
  - auto-sentry, both auto-load settings
  - pass-through vs destination unload, `unloadNextTurn`
  - each house rule on and off
  - the elimination-timing change
- **Pathfinding:**
  - shortest path, wrap, domain rules, unexplored and blocked squares, determinism
  - the `GameState` and `PlayerView` builders agree
- **Determinism:** the existing replay/determinism test is extended with orders, so that `replay(initial, commands)` reproduces the hash.
- **Saves:**
  - each migration step
  - a real 2a-format fixture loads with the note
  - the 2b round trip is verified
- **UI modules:**
  - key map, including that Tab is handled
  - arrival label
  - ready-queue ordering (new units first, Skip to the back, Hold out)
  - badge fallback rule
- **Manual check:** on the deployed site, play a turn using only the mouse. Sentry an army. Go-to across a continent. Ship armies through a gateway city to a destination. Load a 2a save.

## 7. Clarifications (designer's calls after the builder check)
1. **Replay:** moves made by orders are not logged as commands. They are derived inside `apply` and `startTurn` from hashed `GameState` only, so replay re-derives them.
   - "Visible enemies" come from `canPlayerSeeUnit` on state.
   - "Markers seen this turn" are `fog.lastSeen` entries with `turnSeen === turn`.
   - Nothing view-only is used.
2. **Immediate execution:** a `setOrders` / `goHome` that executes at once returns its moves, and any `ordersEnded`, in that command's own events.
   - Sentry's `enemySighted` check runs only at the owner's turn start, so a sentry given next to an enemy holds until the next turn.
   - Moving orders check after each step.
3. **Ready after an interruption:** a unit whose orders end with moves left is ready in this turn's cycle.
4. **Load:**
   - Transports take armies; carriers take fighters.
   - The `load` command ignores the garrison house rule (the player chose those units).
   - Loaded units get `sentry`, replacing any orders they had.
   - Cargo woken by an at-sea `unload` stays awake and in the cycle until the player moves it or sentries it again.
5. **Go Home:**
   - "Home" means any own city.
   - Ships: own coastal cities only.
   - Aircraft: own cities reachable within remaining fuel.
   - A unit already in an own city is rejected with "already home".
6. **Unloading:** `unloadNextTurn` is set only by a plain `move`, never by a go-to step. The arrival unload and `unloadNextTurn` apply to transports only. Carrier fighters leave through Unload, then fly off.
7. **Sentried aircraft** in a city or on a carrier are at a refuel point, so they burn no fuel. If their carrier sinks, existing cargo-loss rules apply.
8. **Sighting:** enemy units inside cities or aboard transports don't count as sighted. This is consistent with the existing fog rules.
9. **Migration:** for 2a saves, `fairFirstTurn: true` is the only rule patch. Any save whose `rulesVersion` differs from the current one, now or in future, takes the snapshot path.
10. **Existing 2a tests** of "unload at every friendly city" are updated to the new rules.

## 8. Left to the builder
- Exact visuals: preview line, blink style, badge colors, menu styling. Keep them in line with 2a's look.
- How Skip and Hold state lives in the UI or session.
- Internal structure of `path.ts` and the order executor, within the rules above.
