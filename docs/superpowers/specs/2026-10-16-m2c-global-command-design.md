# Milestone 2c — Global Command: Design Spec

Date: 2026-10-16 · Status: Draft for review
Parent spec: `2026-10-14-conquest-web-design.md` (binding where this document is silent)
Builds on: Milestone 2b (`2026-10-16-m2b-orders-and-controls-design.md`, merged to main at 1fa4180)
Inputs:
- `docs/superpowers/notes/playtest-2026-10-15.md` (the user's decisions)
- the user's playtest of the live 2b build (2026-10-16), recorded in §9 of this spec

## 1. Goal

Give the empire a face and make each turn read clearly.
- Cities and units have names, which the player can change.
- Production is handled in a proper city screen.
  - Each turn opens with a Production Report for every city that finished a unit.
- The selected unit is described in one status line, an info dialog and a cleaner button column.
- The map zooms itself to the part the player knows.
- The title screen fills the window.

Also in 2c: polish items from the 2b review and the 2b playtest (§7).

**Non-goals for 2c** (still "Later"):
- status report and stats
- survey mode
- combat narration and flash
- settings screen, including the production-report filters
- Escort, multiple turns per seating
- sound, art and portraits

**Anti-goals:**
- No rule changes beyond the three the user decided: Explore stops at cities, aircraft Patrol, and own units no longer wall off routes (§9). Everything else in a 2b game plays exactly the same in 2c.
- Nothing taken from the original game's art, names or text. City names are real-world place names, which are facts.

### Success criteria
- **New games:** cities show real names on the map, drawn from the chosen region and with no duplicates. Labels disappear when zoomed far out.
- **Renaming:** the player can rename their own cities and units.
- **Capturing a city,** or clicking one of your own, opens the city screen, with a leader line to the city.
- **Turn start:** each city that finished a unit shows a Production Report before any unit is offered.
- **Unit panel:** the selected unit has a status line, a vertical list of buttons for every order that applies, and an info dialog.
- **Move To:** after giving one, the unit stays selected and its route stays drawn.
- **Opening a game:** the map is zoomed to the explored area, not mostly black.
- **Older saves:** 2b and 2a saves both load, with the "older version" note.

## 2. Names

### 2.1 City names (data)
- **Data file:** `src/data/cityNames.ts` exports a curated list of about 800 well-known real-world city names.
  - Each entry has a region: `europe`, `northAmerica`, `latinAmerica`, `asia`, `africaMiddleEast` or `oceania`.
  - Names are plain strings without diacritics, so every font can show them. Each is at most 24 characters.
  - The list is unique, ignoring case.
- **New Game option:** `WorldOptions.nameRegion: NameRegion | 'world'`, shown as "City names" with the choices World (default), Europe, North America, Latin America, Asia, Africa & Middle East, Oceania.
- **Assignment** happens in the map generator, from the world seed, so the same seed and region give the same names:
  1. Shuffle the chosen region's names with `Rng(seed ^ 0x51ed27)`.
  2. Then shuffle the rest of the world list with the same Rng and append it.
  3. Cities take names in id order (row-major, as placed).
  4. If the list runs out, start over with the suffix " II", then " III", and so on.
- `City.name: string` is new state.
  - A captured city keeps its name.
  - `PlayerView.knownCities` gains `name`, but only for cities the viewer has explored. The view never holds the name of an unexplored city.

### 2.2 `renameCity { player, cityId, name }`
- **Allowed** only for the city's current owner.
- **The name** is trimmed, 1–24 characters, printable characters only.
- **Rejected** with "name already in use" when another city has the same name, ignoring case. A rename to the city's own current name in a different case is allowed.
- Any city counts for the check, seen or not. That leaks almost nothing and keeps names unique. *(Designer's call.)*
- No event. The UI updates from state.

### 2.3 Unit names
- `Unit.name: string | null`. Null means "use the generated name".
- **Generated name:** `unitDisplayName(u) = u.name ?? \`${ordinal(u.id)} ${UNIT_STATS[u.type].name}\``, e.g. "142nd Army" or "7th Destroyer". It is deterministic and costs no state.
  - Ordinals follow the English rules: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 101st, 111th.
- **`renameUnit { player, unitId, name }`:** owner only. The name is trimmed, at most 24 characters, printable only. An empty string or `null` returns the unit to its generated name.
  - Duplicate unit names are allowed. *(Designer's call.)*
- **Privacy:**
  - Custom names live only in the owner's `myUnits`.
  - Other players see enemy units by type only: "Enemy Army", "Red Destroyer" or similar, as in 2b.
  - Events that reach other players never carry names.

### 2.4 Where names appear
- **City names:**
  - map labels (§5.4)
  - the city screen, the Production Report and the side panel
  - the log, e.g. "Paris was captured."
- **Unit names:**
  - the status line, the info dialog, the unit panel and the pickers
  - the log: "142nd Army arrived.", "142nd Army stopped: enemy sighted."
  - Enemy units are described by owner and type.

## 3. Engine and state

- `GameState.version` becomes `3`. `City.name`, `Unit.name` and `Unit.blockedTurns` (§9) are added.
- New commands: `renameCity` and `renameUnit` (§2).
  - Neither touches the rng or the rules, so replay stays deterministic.
- **`RULES_VERSION` becomes `3`,** because Explore now stops at cities, aircraft may Patrol, and own units no longer block planning (§9). All three change how orders run. A 2b command log could replay differently under 2c.
- New `OrdersEndReason`: `'cityFound'`.
- `createGame` takes the city names from the generated map. Units are created with `name: null`.
- Structural validation (`gameStateProblem`) checks:
  - `City.name` is a non-empty string
  - `Unit.name` is a string or null

## 4. Saves and migrations
- **Format:** `SaveFile.format` becomes `3`.
- **`migrateState2to3`** in `src/storage/migrations.ts`:
  - `version: 3`
  - every unit gets `name: null` and `blockedTurns: 0`
  - every city gets a name from `defaultCityName(cityId)`
    - That is a deterministic pick from the world list: the list shuffled by `Rng(0x2c2c)`, indexed by city id, with the " II" rule past the end.
    - It depends only on the city id, so `initial` and `snapshot` get identical names.
- **`migrateSave2to3`:** applies the state step to `initial` and `snapshot`, sets `format: 3`, and leaves `rulesVersion` as it is.
- **Chains:**
  - A 2a save runs 1→2→3 and still takes the snapshot path with the "older version" note, because its `rulesVersion` is 1.
  - A 2b save (`rulesVersion` 2) runs 2→3 and then also takes the snapshot path with the note, because `rulesVersion` 2 ≠ `RULES_VERSION` 3 (2b spec §4, §7.9).
  - A 2c save (`rulesVersion` 3) gets the normal **verified** replay load.
- **Tests:** each step, both chains, a real 2b-format fixture loading with the note, and a 2c round trip verified with no note.

## 5. UI

### 5.1 City screen (dialog)
- **A modal dialog over the map,** in our own modern style. The function and layout follow the reference, the look doesn't.
  - **Header:** the city name and "Production".
  - **A "No Production" button** at the top.
  - **One row per unit type,** with:
    - its glyph and name, the current choice highlighted
    - **Turns:** turns to complete for this city, including the repeat-build bonus. This is the production rule's own calculation, from current progress if the type is the current build, otherwise from 0.
    - **In production:** how many of the viewer's cities are building that type now
  - **Ships in an inland city** are shown greyed out, with the tooltip "Needs a coastal city". *(Designer's call: greyed out rather than hidden, so the list never changes shape.)*
  - A **progress bar** for the current build.
  - **Unit stats on hover** (move, attack, defense, hits, range where it applies), as a tooltip or a side line.
  - **Keyboard:**
    - Up/Down moves the highlight.
    - Enter picks the type and closes.
    - Esc closes without a change.
    - While the dialog is open, the map's keys are off.
  - **Buttons:**
    - **City** switches the dialog to a details view: the name field with Rename, the list of units inside (by name), and the progress. **Back** returns to the list.
    - **OK** closes.
- **The map** centers on the city when the screen opens.
- **The leader line** is a thin line, from the dialog edge nearest the city to the city square on the map.
  - It is redrawn on pan and zoom, and hidden while the city is off screen.
  - The dialog sits beside the city, not on top of it, where the window has room; otherwise it is centered.
- **When it opens:**
  - when the viewer captures a city: right after the capturing move resolves
  - when the viewer clicks one of their own cities **with no unit selected** (press Esc first to deselect), or clicks the square of the city the selected unit is standing in
  - from **Prod.** in the Production Report
- **Picking a type** sends `setProduction`, as in 2b.

### 5.2 Production Report (turn start)
- **When:** after the engine's turn start, and before the unit cycle, the viewer gets one dialog per city that finished a unit this turn. The cities come in id order.
- **Contents:**
  - "City **Paris** reports production of **an Army**." (a/an by the type name)
  - the new unit's name in an editable field, with **Rename** (sends `renameUnit`)
  - **Prod.:** opens the city screen. On OK there, the report comes back.
  - **Help:** shows the unit type's stats and a one-line description, written by us.
  - **OK:** moves to the next report. After the last one, the unit cycle starts, with units built this turn first, as in 2b.
- **The map** centers on each report's city, with the leader line.
- **Esc** acts as OK.
- **Several units built in one city** (rare) give one report per unit.

### 5.3 Selected unit: status line, panel, info dialog
- **Status line:** a strip at the top of the map area.
  - Example: "142nd Army · Moves 1/1 · Orders: None". Aircraft add "Fuel 14/20".
  - With nothing selected, it's empty. The Fit button (§5.5) sits at its right end.
- **Top bar layout** (user, decided):
  - **Left:** the turn and player, then **Orders ▾**, Save, Export and Quit.
  - **Right:** the status message (e.g. "All units have moved. Press Enter or click End Turn."), followed immediately by the **End Turn** button, so End Turn always sits beside the message.
- **Unit panel (side panel):**
  - the type's glyph, the unit name, the health bar, moves, fuel, orders and cargo
  - **Action buttons:** one per row, full width, in a scrolling column. Each shows its key.
    - Order: Next (N), Skip (Space), Hold (Tab), Sentry (S), Move To (T), Explore (X), Load (L) / Unload (U), Patrol (P), Go Home (H), Clear Orders (Ins), Center (F), Info (I), Disband (Del), with Disband always last.
    - Every order that applies gets a button. Those that don't apply are hidden, using the 2b availability rules.
    - *(Designer's call: Clear Orders and Info are added to the user's suggested order, before Disband.)*
  - **Cargo line:** "Carrying: 3 Armies" (pluralised; mixed cargo reads "2 Armies, 1 Fighter").
    - Clicking it expands the list of carried units by name. Clicking one selects it.
    - Unload stays the way to wake cargo.
- **Info dialog:** opens with **I**, a double-click on the unit, or the Info button. It shows:
  - the type glyph, as a placeholder until the portraits come in the art pass
  - the name, with Rename
  - the location and terrain, e.g. "35,27 (Land)", "(Ocean)", or "(City: Paris)"
  - the current orders
  - the health bar and "Crippled" where it applies
  - the type stats
  - cargo
  - **Orders**, which opens the Orders menu at the button
  - **OK**
  - A single click still only selects.

### 5.4 Map
- **City labels:** the name, centered under the city square, in a small outlined font.
  - Shown only for explored cities.
  - Hidden when the tile size is below **20 px**.
- **Committed route:** while a selected unit has a Go-to or Patrol, the map draws its planned route.
  - The route is a **solid** line, unlike the dotted hover preview, and is recomputed with `findPath` on each redraw that needs it.
  - It carries the arrival label ("this turn" / "arrives turn N").
  - Patrol draws its current leg.
- **Move To and Patrol keep the unit selected.** This supersedes 2b §5.4 for these two orders.
  - After the order (by click, T or P), the unit stays selected and its route stays drawn.
  - The hover preview is not recomputed for another unit until the mouse moves.
  - **N, Space or Next** moves on to the next ready unit. For a unit that has orders, Space and Hold (Tab) act like Next. *(Designer's call.)*
  - Other orders (Sentry, Explore, Go Home, Hold, Disband) move on straight away, as in 2b.
- **Next from a unit that isn't ready:** goes to the first ready unit after it in queue order, wrapping. 2b went straight to the first ready unit. *(Designer's call; the 2b review flagged it.)*

### 5.5 Dynamic zoom
- **`MAX_TILE`** goes up from 48 to **96** px.
- **Auto-fit mode** is on at game start, on load, and whenever the player presses **Fit**.
  - **The fit:** the smallest box around the viewer's explored squares, plus a 2-square margin, is shown at the largest tile size that fits the map viewport. The size is clamped to `MIN_TILE`..`MAX_TILE`.
  - **On wrapping maps,** the box is the shortest span across the seam.
  - **When it applies:** at each of the viewer's turn starts, and after each of their moves that explores new squares.
  - **Only outward:** the tile size never grows while auto-fit is on, so the view doesn't jump in.
  - **The active unit stays in view:** if centering on it is needed, the camera pans, at the fitted size.
- **Manual zoom:** a wheel or pinch zoom turns auto-fit off for this seat until Fit.
  - Fit is a button by the status line, and the **Z** key (free since 2b dropped the letter movement keys).
- **Hot-seat:** auto-fit and the camera are per seat, as the camera already is.

### 5.6 Title screen
- **The key art** is a full-window background (`background-size: cover`), anchored so the baked-in title stays visible.
- **The menus** (Continue, New game, Saved games and the rest) float in a translucent panel on the left.
- **A compact first screen** (user decision):
  - It shows only Continue (if an autosave exists) and New Game.
  - New Game expands the full options panel.
  - Named saves and Import sit behind a "Load…" control beside Continue, as an expandable list.
- **Narrow or tall windows** (width below about 800 px, or portrait): the art sits on top at full width, with the menus stacked below.
- **Very wide windows:** the edges are filled with a blurred, darkened copy of the art, so `cover` doesn't crop the title.

## 6. Turn flow summary (viewer's turn)
1. The engine's `startTurn` runs: production, orders, and the rest, as in 2b.
2. The camera auto-fits (§5.5) if auto-fit is on.
3. The Production Reports come one by one (§5.2).
4. The unit cycle begins (2b §5.4, as changed in §5.4 above).
5. A capture during the turn opens the city screen (§5.1).
6. End Turn works as in 2b.

## 7. Polish carried in from 2b
1. **Side panel:** the Health label must not be cut off in a narrow window. The health row wraps or shrinks; it never clips.
2. **The blink** (about 2 Hz) redraws only the canvas and the End Turn button.
   - The log, the ready list and the side panel don't re-render on blink ticks.
   - The ready list is computed once per state change, not per tick.
3. **The `aircraftCanReach` doc comment** has corrupted characters. Rewrite it in plain ASCII.
4. **Log wording:**
   - `ordersEnded` with `arrived` reads "142nd Army arrived."
   - The other reasons read "142nd Army stopped: enemy sighted." and so on.
   - `cargoUnloaded` names the real carrier type and unit, e.g. "3rd Carrier unloaded 2 Fighters."
5. **Next** from a non-ready unit: §5.4.
6. **A dead selected unit** no longer strands the panel: §9.
7. **Unload at sea** lands armies on adjacent land: §9.
8. **To verify: stale cargo badge.**
   - **What the user saw:** a transport leaving a city with auto-load showed badge 2, and changed to 3 only on the next re-render. The final state is correct.
   - **Suspected cause:** the canvas draws from stale view or draw props after a move that auto-loads.
   - **To do:** find the cause and fix it, with a regression test if the cause is found. Otherwise record what was checked in the build notes.

## 8. Testing
- **Engine:**
  - `renameCity`: owner only, trimming, length, duplicate rejection (case-insensitive), own name in a different case allowed
  - `renameUnit`: owner only, reset with an empty string or null
  - determinism with renames in the command log
  - views: unexplored city names are absent, and custom unit names are absent from other players' views
- **Map generator:**
  - the same seed and region give the same names
  - no duplicates on a Huge map at high density, which exercises the " II" rule
  - the region option orders that region first
- **Names:** `ordinal` edge cases, and `unitDisplayName`.
- **Saves:** `migrateState2to3`, both chains, the 2b and 2a fixtures loading with the note, and a 2c round trip verified with no note.
- **UI modules (pure functions):**
  - turns-to-complete and in-production counts
  - a/an
  - cargo pluralisation
  - auto-fit box, including across the wrap seam, and its outward-only rule
  - label visibility threshold
  - button order and visibility
  - Next-after-non-ready
  - report queue order
- **Manual check on the deployed site:**
  - Start a new Europe game: cities have European names.
  - Rename a city and a unit.
  - Capture a city: the screen opens with its leader line.
  - At turn start, step through the reports, using Prod. once.
  - Give a Move To: the unit stays and its route shows.
  - The opening map is zoomed in, and zooms out as you explore.
  - Check the title screen on a wide window and on a phone-width window.
  - Load a 2b save and a 2a save.

## 9. Playtest additions from the live 2b build (user, 2026-10-16; decided)
- Vertical action buttons with every order that applies (§5.3).
- A cargo count line with an expandable list (§5.3).
- Move To and Patrol stay on the unit and show the committed route (§5.4).
- **When the selected unit dies** (e.g. an army loses an attack), the next ready unit is selected automatically. The combat result stays visible in the log and status line.
  - If nothing is ready, the panel shows the "All units have moved" state, with End Turn blinking.
  - Every empty-panel state ("That unit is gone.", "Select a unit or city.") has a **Next unit** button, plus **End Turn** when nothing is ready, so mouse-only play never gets stuck.
- **Unload at sea steps armies ashore.** In 2b, Unload away from a city only woke the cargo, and the user thought it had failed.
  - **2c:** each chosen army with a move left steps onto a free adjacent land square.
  - **Not a rule change.** The UI sends the 2b `unload` command (which wakes the cargo), then one ordinary `move` per army. So it's exactly what the player could do by hand: replay is unchanged, `RULES_VERSION` stays 2, and no house rule is needed. *(Designer's call.)*
  - **Square choice** is a pure function, `landingPlan(view, transport, armyIds)`, so the same situation always gives the same squares:
    - Armies go in id order.
    - Each takes the first square, in direction order N, NE, E, … NW, that is land holding no unit, or one of the player's own cities.
    - It never attacks, never picks an enemy or neutral city, and never stacks two armies on open land.
    - Squares are taken one at a time, so the next army sees the squares already used.
  - **Armies that can't land** (no move left, or no free square) stay aboard, awake.
  - **Log:** "3rd Transport landed 2 Armies; 1 still aboard." The second part appears only when some remain.
  - **Unload clears the transport's standing orders** (Go-to or Patrol), at sea or in a city.
    - The user decided this: interrupting a Go-to to unload means you'll want new orders.
    - The UI sends `setOrders { orders: null }` for the transport first (only when it has orders), then `unload`, then the landing moves. Each is an existing 2b command, so this part needs no engine change.
  - **Unload in a city** otherwise behaves as in 2b.
  - **Tests:** `landingPlan` covers the direction order, used squares, enemy and neutral squares, own cities, no moves left, and a coast with too few squares. A session test checks that the command sequence leaves the expected state.
- **The active cargo unit is drawn on the map.** When the active unit is aboard a transport or carrier, the carrier's square shows **the active unit's own glyph**, blinking, in place of the carrier glyph.
  - The cargo count badge stays.
  - This replaces 2b's final-wave rule in `render.ts`, where the blink covered the carrier.
- **Hover shows Attack on adjacent targets.** When the hovered square is adjacent and the selected unit can attack it (an enemy or neutral city, or a visible enemy unit, per the existing `stepTargets` attack flag), the map shows a red **"Attack"** label with a crosshair marker on the square, instead of the path preview.
  - This applies to every unit type.
  - **Odds** are shown for cities only, e.g. "Attack (50%)", using the same chance `attackCity` uses, including Easier neutral cities. *(Designer's call: the city chance is a single known number. Unit-against-unit odds depend on hidden damage and many rounds, so they wait for the combat-narration work.)*
- **Top bar layout**, with End Turn next to the status message (§5.3).
- **Own units no longer wall off routes** *(engine rule change, covered by `RULES_VERSION` 3)*
  - **The report:**
    - A destroyer in a bay ended Explore with "nothing to explore", with ocean beyond the bay's mouth.
    - Many armies stopped with "path blocked".
    - The cause: 2b's `PathMap` treats own units outside cities as walls, in both `findPath` and the Explore frontier search.
  - **Planning** (`findPath`, the frontier search, `goHome`'s choice, and the UI's hover preview and committed route, which all use the same `PathMap`) **ignores own units**.
    - The 2b boarding rule is kept: a transport or carrier with room is still a valid square for its cargo type.
    - Enemy units and non-own cities still block, and orders never attack.
  - **Execution:** when the next step's square holds an own unit that the mover can't stack with, the executor tries a **detour**: `findPath` again, with the squares currently holding such own units blocked.
    - If a detour exists, take its first step.
    - If not, the unit **waits**. It keeps its orders, stops moving for this turn, and its new **`Unit.blockedTurns`** goes up by 1 (at most once per turn).
    - After **3** turns in a row of waiting, the orders end with `blocked`.
    - Any successful order step resets `blockedTurns` to 0. Giving new orders or clearing orders also resets it.
  - **Explore** reports `nothingToExplore` only when no frontier exists with own units ignored.
  - **Also check:** why the destroyer's `ordersEnded` was logged twice in one turn. Fix it and add a regression test (one `ordersEnded` per unit per ending).
  - **State and migration:** `Unit.blockedTurns: number` (default 0). `migrateState2to3` adds it, and `gameStateProblem` checks it is a non-negative integer.
  - **Tests:**
    - a bay with an own ship at the mouth: Explore continues by detour or waits, and doesn't end
    - a detour around an own army
    - waiting for 1–2 turns, then `blocked` on turn 3
    - the reset on a successful step
    - enemies still block
    - the UI and engine `PathMap` builders still agree
    - determinism
- **Aircraft Patrol** *(engine rule change, covered by `RULES_VERSION` 3; it replaces 2b's "aircraft may not take patrol")*
  - **Validation:** one end (`a` or `b`) must hold an own city or own carrier at the time of the order. That end is the **base**.
    - Otherwise reject with "patrol must start or end at a city or carrier".
    - The round trip, path base→far end plus far end→base, must fit within the type's **full** range. Otherwise reject with "out of range".
  - **Execution:** the patrol legs work as in 2b. The aircraft refuels at the base under the existing refuel rules, and landing ends its move as normal landing already does.
  - **Fuel checks:**
    - Before leaving the base, fuel must cover the whole round trip.
    - At any step away from the base, fuel must cover the path back to the base.
    - The base must still hold an own city or carrier. A carrier that sailed away counts as gone.
  - **When a check fails:** the patrol ends with `lowFuel`.
    - If a home is reachable within the fuel left (the same choice as `goHome`), the orders become a Go-to there, and the log reads "7th Fighter low on fuel: heading home."
    - Otherwise the orders clear, and the unit wakes with "7th Fighter stopped: low on fuel."
  - Aircraft Explore stays "Later".
  - **Tests:** valid patrol from a city and from a carrier; both rejection messages; refuel at the base; the low-fuel turn-back with and without a reachable home; the base carrier moving away; determinism with an aircraft patrol in the command log.
- **Clicking a city with a unit selected gives an order** (bug fix: 2b's `GameScreen.onSquare` checked `knownCities` before the go-to branch, so the click selected the city instead).
  - **Own city, not adjacent:** Move To into it. Adjacent: a normal move, as in 2b.
  - **Neutral or enemy city, adjacent:** attack, as in 2b.
  - **Neutral or enemy city, farther away:** Move To the reachable square next to the city with the shortest path. Ties go to direction order N, NE, … NW around the city. The UI picks the square, with no engine change. The unit stops there, the Attack hover (below) shows, and one more click attacks.
    - If no adjacent square is reachable, show the red "no known path" preview and do nothing.
  - **Own unit** (not in a city) still selects it, as in 2b.
  - **To open a city screen:** press Esc first, or click a city with no unit selected (§5.1).
- **Explore stops at enemies and cities.** *(Engine rule change; this is why `RULES_VERSION` becomes 3.)*
  - After each Explore step, the order ends and the unit waits for orders when an enemy unit is adjacent (as in 2b, reason `enemySighted`). It also ends when a **non-friendly city** (neutral or enemy, as the player knows it) is adjacent and **wasn't adjacent before that step**: new reason **`cityFound`**.
  - The "wasn't adjacent before" rule means re-issuing Explore next to a city doesn't stop at once.
  - **Log:** "142nd Army stopped: found a city."
  - Go-to and Patrol keep the 2b rules.
  - City ownership comes from the player's fog knowledge (`knownCityOwner`), computed from state only, so replay stays deterministic.
  - **Tests:** stops on a newly adjacent neutral city and a newly adjacent enemy city; doesn't stop for a city already adjacent at the start of the step, or for own cities; the enemy-unit stop still works; Go-to and Patrol are unaffected.
- Already confirmed: a real 2a autosave (turn 82) loaded on the live site with the older-version note.

## 10. Clarifications (designer's calls after the builder check)
1. **Names in the log.** Events stay id-only; no event type changes.
   - `describe.ts` resolves unit names in the UI from the viewer's own units, using the view from **before** the command merged with the one after it. That way, destroyed and disbanded units still get their names.
   - Fallback: the generated name built from the id and the event's type.
   - Enemy units are always described by owner and type.
2. **When the city screen opens on capture:** on a `cityCaptured` event with `by === viewer` in the result of the viewer's own command.
   - Orders never attack, so turn-start orders can't capture a city, and nothing collides with the reports.
   - It never opens when an enemy takes the viewer's city.
   - Turn order is fixed: reports first, then the cycle. Captures can only happen during the cycle.
3. **Auto-fit ratchet:**
   - A fit computes `fitTile`. The camera keeps a ceiling. Game start, load and Fit set the ceiling to the fresh `fitTile`.
   - Later fits use `min(ceiling, fitTile)` and lower the ceiling to that.
   - The pan that keeps the active unit in view may move the box off center, but it doesn't change the size.
   - The ratchet logic is pure functions in `camera.ts`.
4. **Production Report wording** describes the unit that was built. Prod. changes only the next build.
   - OK on the last report starts the cycle.
5. **Name list:** the builder writes the list (place names are facts).
   - At least 80 names per region. Each entry is at most **20** characters, so the suffix rule (" II" … " XX") stays within 24.
   - No list entry appears twice, even where a city could belong to two regions: pick one region.
6. **Migration names** come from the current list. Editing the list later only changes the names an old save gets when it is migrated again.
   - `initial` and `snapshot` are migrated together, so verification still holds.
   - No frozen copy is kept.
7. **Double-click:** on a unit outside a city, the first click selects and the second opens Info.
   - In a city, clicks follow §5.1 and §9. Info there is through I or the Info button.
   - A stack's double-click picks the same unit a single click selects.
8. **Hold (Tab) on a unit with orders** leaves its orders alone and just moves on.
9. **Title art** is `public/title.webp`, 1376×768 (16:9-ish), with the title baked in near the top.
   - Anchor it at the top center.
   - The blurred fill uses the same file.

## 11. Left to the builder
- Exact styling of the dialogs, the leader line, labels and the route line. Keep them in line with 2b's look.
- Where the status line and Fit button sit exactly, within §5.3 and §5.5.
- The exact curated name list, within §2.1's rules. The regions should be roughly balanced, at least 80 names each.
- Internal structure: dialog components, a turn-start report queue in the session or UI, and camera state.
