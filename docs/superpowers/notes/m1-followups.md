# Milestone 1 → Milestone 2 follow-ups

These came out of the Milestone 1 engine reviews (2026-10-14). They are not blocking; they're listed here so the M2 plan picks them up.

## Rules the engine still owes
- **Aircraft ending a turn on an occupied square.** A fighter may pass over a friendly unit but must not end its turn there (except in a city or on a carrier). M1 allows it because moves are single steps. M2 (go-to paths) must enforce it: reject the final step, or block End Turn. The engine already stops enemy units from advancing onto such a square.
- **Transports unload only at the destination.** M1 unloads armies at every friendly city a transport enters. Go-to orders should unload only at the target city, per the spec.
- **First turn start.** `createGame` doesn't call `startTurn` for player 0. Turn 1 has no `turnStarted` event, and player 0's production is one tick behind. Decide this when building the hotseat hand-off screen.
- **Failed city attacks.** `attackCity` doesn't reveal the attacker to the city's owner.
- **Balance question.** A transport hopping between adjacent friendly cities carries armies for free.

## API work before the UI and AI
- **Per-player event filter (`eventsFor(pid)`).** `apply`'s events mix players and can leak hidden information, such as how many armies a sunk transport carried. The spec's `EnemySighted` event doesn't exist yet.
- **`PlayerView`**
  - Add the set of currently visible squares, so the UI can tell fogged squares from squares in sight.
  - Consider not exposing real enemy unit ids.
- **Exports from `index.ts`.** Export the map helpers (`DIRS`, `step`, `neighbors`, `chebyshev`, `isCoastal`, `normalize`).
- **Move legality check.** Add a dry-run or legality check so the AI doesn't `structuredClone` the whole state for every probe.
- **Who sent a command.** Commands should carry `player` (or the host should check it), so a late `endTurn` from an AI worker can't act for the wrong player.
- **Map validation.** Map generation or `createGame` should enforce the spec's minimum map size (20×20).

## Tooling
- **Dependency pins.** Bump the `vite`/`vitest` pins to patched versions (npm audit flags dev-server advisories) when the Vite dev server first runs.
- **No-DOM type check.** Give `src/engine` its own tsconfig without the DOM lib, so the no-DOM rule is type-enforced.
- **Line endings.** Add `.gitattributes` for line endings, and remove the BOM in `tests/engine/determinism.test.ts`.
- **Refactors:**
  - Factor the spend/relocate/settle sequence that's repeated three times in `movement.ts`.
  - Break the `movement.ts` ↔ `attack.ts` import cycle.
- **Combat stat guard.** Add an assert in `resolveCombat` against zero attack+defense or zero shot, once stats are editable.
- **Fuzz test tuning.** The fuzz seed and step count (8000 steps, seed 10) are tuned so cargo occurs. Re-tune if the `cargoStates > 0` assertion trips after rule changes.

## Test gaps worth filling
- Expiry boundary for last-seen markers (age 2 vs 3).
- Diagonal wrap across the seam.
- Damaged transport and carrier capacity during movement.
- Fighter taking off from a carrier.
- Air attacker winning; loaded carrier winning.
- Restriction tests asserting that no move was spent and no events were emitted.
- Turn tests:
  - Player 0 eliminated (the turn counter wraps).
  - No repair in a neutral city.
  - Resign event contents.
  - The no-survivor ending reached through `apply`.
- A fuzz bias toward fighter/ship stacking, so the mixed-owner invariant gets real exercise.
