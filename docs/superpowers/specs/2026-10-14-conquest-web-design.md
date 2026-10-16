# Conquest Web — Design Spec

*Working codename. Final name TBD (must not use "Empire").*
Date: 2026-10-14 · Status: Draft for review

## 1. Goal

A browser-based, turn-based strategic conquest game inspired by the mechanics of
Empire Deluxe (1993), built as our own game: our own code, art, text and tuned
numbers. Platform-independent: runs in any modern browser, hosted as a static site.

**Primary use (v1):** one human vs. computer opponents.
**Later:** asynchronous "play your turn and send" multiplayer with no server to maintain.

### Success criteria
- Open the page, set up a game, and play a full game to victory or defeat against 1–5 AI opponents.
- Save and resume games; export/import save files.
- The AI is a credible opponent: it expands, builds a navy, and carries out amphibious invasions.
- Hosted free on a static host (GitHub Pages / Netlify / Cloudflare Pages); no servers to maintain.
- Desktop-first (mouse + keyboard); usable on tablets via touch.

### Decisions made
| Topic | Decision |
|---|---|
| Priority | Solo vs. computer first; async multiplayer later |
| Rules tier for v1 | "Standard" (see §3) |
| Visual style | Clean flat terrain tiles + crisp vector unit icons |
| Hosting | Free static host |
| Devices | Desktop first, tablet OK, phones usable but not optimized |
| Stack | TypeScript + Vite, HTML canvas map, light DOM UI (Preact only if needed) |

### Legal note
Game mechanics are not copyrightable; names, art, text, sounds and code are. We
reuse none of the original game's assets or text. Unit stats start from the
classic values as a tuning baseline and live in a data table we own and adjust.

## 2. Architecture

```
src/
  engine/   pure rules — no DOM. State is plain JSON-serializable data.
  mapgen/   seeded random world generator
  ai/       computer players; emit Commands like a human; run in a Web Worker
  ui/       canvas renderer, input (mouse/keyboard/touch), panels, menus
  storage/  IndexedDB saves + export/import of save files
```

### Core principles
1. **Command-driven engine.** Every player action is a `Command`
   (e.g. `MoveUnit`, `SetProduction`, `SetOrders`, `EndTurn`). The engine exposes
   `apply(state, command) -> { state, events }`. Commands are validated; illegal
   commands are rejected with a reason.
2. **Determinism.** All randomness goes through a seeded PRNG stored in game state.
   Same initial state + same command log ⇒ identical result on any machine.
3. **Game = initial state + command log.** Enables save/load, replays, undo
   (within limits), AI sharing the exact rules, and future async multiplayer.
4. **Per-player views.** The engine can produce a fogged `PlayerView` for any
   player. The UI and the AI only ever read a `PlayerView`, never raw state.
5. **Relationship function.** Rules ask `areFriendly(playerA, playerB)` rather
   than comparing owners directly. In v1 this means "same player"; future
   alliances change only this function and its data.
6. **Data-driven units.** All unit stats live in one table (`engine/units.ts`).

### Events
`apply` returns events (`UnitMoved`, `CombatResolved`, `CityCaptured`,
`UnitProduced`, `UnitDestroyed`, `EnemySighted`, …) consumed by the UI for
animation, the message log and the turn-start report.

## 3. Rules (v1 = "Standard" tier)

### Map
- Rectangular grid; size chosen at setup from 20×20 to 150×200.
- Optional east–west wrap.
- Terrain: **land**, **water**, **city**. (Clear/forest/mountain/etc. deferred.)
- Map edge is impassable.

### Units

| Unit | Move | Hits | Attack | Defense | Shot dmg | Range | Capacity | Build (first/repeat) | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Army | 1 | 1 | 2 | 2 | 1 | – | – | 6 / 5 | Only unit that captures cities; defends at 1 vs. shore bombardment |
| Fighter | 5 | 1 | 2 | 2 | 1 | 20 | – | 12 / 10 | Air; must use full move; refuels in friendly city/carrier |
| Transport | 2 | 3 | 1 | 1 | 1 | – | 6 armies | 30 / 25 | Capacity −2 per damage point |
| Destroyer | 3 | 3 | 2 | 2 | 1 | – | – | 24 / 20 | Detects subs |
| Submarine | 2 | 2 | 2 | 1 | 3 | – | – | 24 / 20 | Hidden; see Sighting |
| Cruiser | 2 | 8 | 2 | 2 | 2 | – | – | 42 / 35 | Shore bombardment; detects subs |
| Battleship | 2 | 12 | 2 | 2 | 3 | – | – | 60 / 50 | Shore bombardment |
| Carrier | 2 | 8 | 1 | 2 | 1 | – | 8 fighters | 48 / 40 | Capacity −1 per damage point |

Cities defend as an Army (Attack 2/Defense 2, 1 hit) and never attack.

### Turns
- Players take turns in sequence. At turn start: production completes, repairs
  apply, then the player gives orders. Units with standing orders execute them.
- Play continues until one player remains.

### Movement
- 8-directional, one square per point of Move. Need not use full Move (except air).
- Land units: land and city squares. Sea units: water and **friendly** city squares.
- No stacking with friendly units except: unlimited in friendly cities; armies on
  transports; fighters on carriers.
- **Loading:** an army moving onto a friendly transport (with space) boards it.
  A transport leaving a city auto-loads armies there up to capacity. Armies
  auto-unload when their transport enters a city that is its move target.
  Loaded armies that have not moved may still move off after the transport moves.
- **Air:** fighters may pass through squares with friendly units but not end
  there (except city/carrier). They always expend their full Move each turn.
  Entering a friendly city or carrier lands, refuels to full Range, and ends the
  fighter's turn. A fighter that exhausts its Range away from a refuel point is lost.
- Fighters on carriers may act normally (unlike armies on transports).

### Sighting (fog of war)
- Each player has an **explored** map; terrain once seen stays visible.
- Units and cities see adjacent squares (range 1).
- Enemy units out of sight leave a "last seen" marker that dims after 1 turn and
  disappears after 3 turns, or immediately if a friendly unit sees the square empty.
- Submarines are seen only by adjacent enemy cities, destroyers, submarines and
  cruisers, or when in combat. A submarine cannot spot land or air units.

### Combat
- Attack by moving into an enemy unit or city.
- Resolution: repeated rounds; each round the attacker hits with probability
  `A / (A + D)` (attacker Attack vs. defender Defense, after modifiers), otherwise
  the defender hits. A hit inflicts the hitter's Shot damage. Ends when one side's
  accumulated damage ≥ its Hits. No ties or retreats.
- A winning attacker moves into the defender's square if it legally could; else
  stays. Each attack costs 1 move; a winner may keep moving/attacking with
  remaining Move.
- Restrictions: subs and land units cannot attack each other; sea units cannot
  attack air units over land; land units cannot attack air units over water;
  only land units attack cities; armies on a transport may attack only into a
  square they could enter.
- **Shore bombardment:** cruisers and battleships may attack land units; the
  defender's Defense is halved.
- **Loaded carriers/transports:** only the carrier/transport fights. Damage reduces
  capacity; excess cargo is destroyed. If sunk, all cargo is destroyed.
- **Units in cities** cannot be targeted; only the city can be attacked. When a
  city is captured, all enemy units in it are destroyed.

### Damage and repair
- Damage persists. A unit with damage ≥ half its Hits is **crippled**: Move becomes 1
  (if crippled during its own attack, it stops moving that turn).
- Units in a friendly city for a full turn repair 1 damage per turn.

### Production
- Each city builds one unit at a time; may also build nothing.
- Only cities adjacent (8-way) to water can build sea units.
- Changing production discards progress.
- Repeat production of the same type uses the shorter "repeat" build time.
- Capturing a city destroys enemy units inside it, makes it yours, and prompts
  for production.

### Victory
- At the end of every turn, any player who owns no cities and no units is eliminated.
- A player may resign: their units are removed and their cities become neutral.
- Last remaining player wins.

### Players
- 2–6 players per game; each slot is Human or AI (with difficulty).
- Multiple humans on one machine ("hotseat") supported with a hand-off screen
  between turns so players don't see each other's view.

## 4. Map generation
- Seeded; the seed is shown so worlds can be shared.
- Settings: size, wrap, water %, landmass style (islands ↔ continents), city density.
- Method: smoothed noise → threshold to water %, clean tiny specks, then place
  cities on land with minimum spacing, favoring coasts.
- Starting cities: each player starts with one city on a landmass large enough to
  expand on, with fair spacing between players. The generator scores fairness
  and rerolls (deterministically, from the seed) if it fails.

## 5. UI and turn flow

### Layout
- Main scrollable/zoomable canvas map; minimap; top bar (turn, current player,
  End Turn); side panel (selected unit or city details: stats, damage, fuel,
  cargo, production); message log.

### Turn flow
1. Turn-start report: units produced, combat results, cities gained/lost, sightings.
2. The game cycles through units needing orders, centering each one.
3. Player moves it directly or gives a standing order:
   **Sentry**, **Go to**, **Patrol** (between two points), **Explore**,
   **Load/Unload**, **Skip**, **Disband**.
4. Standing orders run automatically; the unit returns to the queue when
   interrupted (enemy sighted, arrival, low fuel, blocked path).
5. Clicking a city opens production; newly captured cities prompt for it.

### Input
- Mouse: click to select; click a destination to move/go-to (reachable squares and
  path highlighted); right-click for an orders menu.
- Keyboard: numpad/arrows to move, letter hotkeys for orders, Space/Enter to
  advance, keys for End Turn and centering.
- Touch: tap = click; long-press = orders menu; pinch/drag to zoom/pan.

### Other
- Combat shows a brief animation and a log entry.
- AI turns: adjustable watch speed or skip.
- Undo within your own turn for moves that revealed no new information.

### Visuals
- Flat colored terrain (water, land, city) with subtle coastlines; vector unit
  icons in player colors; unexplored = dark; last-seen markers dimmed.
- Indicators: cargo present (transport/carrier), crippled, fuel low, unit in city.

## 6. Computer opponent

Runs in a Web Worker; reads only its `PlayerView` (no cheating vision); emits
Commands. Layered so it is playable early and improves over time:

1. **Strategic assessment** each turn: explored territory, neutral/enemy cities,
   threats, landmass ownership; sets goals (expand, explore, invade, defend, sea control).
2. **Production manager**: early armies; transports + escorts once home landmass is
   secured; fighters for scouting; warships for sea control; responds to threats.
3. **Unit task managers**:
   - Armies: capture nearest reachable city; garrison threatened cities.
   - Explorers (armies early, then fighters/destroyers): reveal unknown areas.
   - **Invasion groups**: gather armies at a port, load transports, escort, land
     near target cities, return for more. Highest-risk behavior; most tested.
   - Fighters: scouting and strikes within fuel range.
   - Warships: hunt targets with good odds; protect sea lanes and transports.
4. **Tactics**: attack only with acceptable odds/expected value; damaged units
   retreat to repair.

**Difficulty:** Easy / Normal / Hard via decision quality; optional production
bonus at the highest level. Never via hidden-information cheating.

## 7. Storage
- Autosave each turn to IndexedDB; multiple named save slots.
- Export/import a save as a file (JSON: initial state + command log + snapshot).
- Save format is versioned for future migrations.

## 8. Testing
- **Engine unit tests (Vitest):** movement legality, fuel, loading/unloading,
  capacity reduction, combat restrictions, combat odds (statistical tests against
  expected probabilities), production timing incl. repeat bonus, repair, fog and
  last-seen decay, sub visibility, capture, elimination.
- **Determinism tests:** replaying a command log from the same seed yields an
  identical final state hash.
- **AI soak tests (headless):** AI-vs-AI games run many turns with no exceptions,
  no illegal commands, and no stalls; track win rates between AI versions.
- **Browser smoke test:** load page, start game, play a few turns.

## 9. Milestones
1. **Engine** — rules complete and tested, headless.
2. **Playable sandbox** — map generator, renderer, panels, turn flow, orders,
   save/load; hotseat humans.
3. **First solo game** — basic AI that expands, builds and invades; deployed to a
   static host. *(First "real game" point.)*
4. **Smarter AI + polish** — better invasions/naval play, difficulty levels,
   reports, visual polish.

## 10. Later (designed for, not built in v1)
- **Async multiplayer**: exchange each turn's command log as a file/link first;
  optional free backend for automatic delivery. Caveat: with pure file passing, a
  determined player could inspect the save to see through fog; acceptable among
  friends, hardenable later.
- **Alliances** (not in the original game): repair in ally cities, gift units to
  allies; enabled by the `areFriendly` relationship function.
- **Advanced rules**: terrain types, armor, bombers, airbases, city efficiency and
  specialization, unit support.
- **Spy unit** (user idea, 2026-10-15; inspired by Civilization):
  - No defense. It is destroyed if an enemy unit ends its move on the spy's square.
  - It sees adjacent squares, and inside or next to an enemy city it can see that city's production.
  - It can sabotage a city's production, with a chance of being discovered and killed.
  - Open questions: build cost, whether spies can enter enemy cities, sabotage odds and effect, and how the AI defends against spies.
- **Earth-based maps** (user idea, 2026-10-15): selectable real-geography maps as an alternative to random worlds.
  - Possible maps: a whole-world map plus regions such as Europe, the Pacific, the Mediterranean and North America.
  - Build them from public-domain geographic data (e.g. Natural Earth), converted to the game grid by our own tool. No maps are copied from other games.
  - Cities would sit at real locations with their real names, which pairs with the city-name feature.
  - Start positions are balanced per map.
  - These maps need the map/scenario format, so they come with the editor work.
- **Player history / service record** (the user shared an original screenshot, 2026-10-16):
  - A "Commanders" screen lists each human player name with missions played, won, lost, resigned, and current rank.
  - Rank rises with victories, e.g. starting as Ensign / 2nd Lieutenant and rising to Fleet Admiral / General of the Army. The rank names are generic military ranks; the promotion thresholds are our own.
  - Results are recorded automatically when a game ends (win, loss, resign, no survivors).
  - The record is stored in the browser (IndexedDB) and can be exported or imported like saves.
  - Optional extras: a victory screen showing the promotion; per-game stats (cities captured, units lost); best times.
- Map/scenario editor; sound.

## 11. Non-goals for v1
Real-time play, diplomacy beyond the alliance plan above, accounts/login,
server-side anything, phone-optimized layout.
