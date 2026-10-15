# Milestone 2a — Playable Sandbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the game playable in a browser by hand: generated worlds, a canvas map with fog, unit moves and combat, production, hotseat play and Idle opponents, save/load and import/export, published to GitHub Pages.

**Architecture:**
- **Engine:** the M1 engine (`src/engine`) gets small API additions.
- **Map generator:** a pure, seeded generator in `src/mapgen`.
- **Storage:** `src/storage` holds the save format, its validation, and the save stores (IndexedDB, plus in-memory for tests).
- **Game session:** a `GameSession` class in `src/app` owns the game: it applies commands, runs Idle seats, handles hotseat hand-off, filters each player's log and autosaves.
- **UI:** `src/ui` holds pure TypeScript helpers (camera, keys, step targets, event text, canvas drawing) plus thin Preact components. The UI reads only `PlayerView`s and filtered events.

**Tech Stack:** TypeScript 5.9, Vite 6.4, Vitest 3.2, Preact 10.29 with `@preact/preset-vite`, HTML canvas, IndexedDB, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-14-m2a-playable-sandbox-design.md` (parent: `docs/superpowers/specs/2026-10-14-conquest-web-design.md`)

## Global Constraints

- **Engine stays pure.** `src/engine/**` and `src/mapgen/**` must not use DOM APIs, `Math.random()` or `Date`. All randomness comes from the engine's `Rng`.
- **State stays plain data.** `GameState` must stay JSON-serializable.
- **The UI never reads raw `GameState`.** It reads only `PlayerView` (`getPlayerView`), events filtered by `eventsFor`, and `GameSession` fields. The two exceptions are `GameSession` itself and save/export code.
- **One path for game changes.** Every game change goes through `GameSession.act`, which calls the engine's `apply`.
- **Pinned versions:** `typescript@5.9.3`, `vite@6.4.4`, `vitest@3.2.7`, `preact@10.29.8`, `@preact/preset-vite@2.10.6`.
- **Map size limits:** 20×20 to 150×200 (`validateMapSize`). Size presets: Small 40×30, Medium 60×45, Large 100×70, Huge 150×100.
- **Naming:** no original-game assets, names or text. The product name must not contain "Empire".
- **Published URL:** `https://quasitron.github.io/conquest-web/`. Vite `base` is `/conquest-web/` for production builds.

## Review Focus

1. **Loading a save from another device or a damaged file** must never crash the game or corrupt the slot list. Import rejects bad JSON, wrong format, a history that doesn't match the snapshot, or a seat count that doesn't match. Tests are in Task 6.
2. **Hotseat privacy:** a second human must never see the first player's view or log. The hand-off phase blocks commands, and logs are filtered per player. Tests are in Task 7.
3. **A turn that can't end:** if End Turn is refused (an aircraft on an occupied square), the player must be told why, and the offending unit must be selectable. Tests are in Task 2 (engine) and Task 10 (the UI shows the reason).
4. **Clicking across the wrap seam and at map edges** must map to the right square, or to nothing. Tests are in Task 8.
5. **Map generator edge settings** (6 players on a Small map, 85% water) must still produce a playable world or a clear error, never hang. Tests are in Task 5.

## File Structure

```
index.html, vite.config.ts, tsconfig.json, tsconfig.engine.json, .gitattributes
.github/workflows/pages.yml
src/engine/      (M1) + events.ts, limits.ts, globals.d.ts; edits to types.ts, apply.ts, turn.ts, view.ts, index.ts
src/mapgen/      options.ts, grid.ts, noise.ts, land.ts, cities.ts, starts.ts, generate.ts, index.ts
src/storage/     saveFormat.ts, store.ts, indexedDb.ts, index.ts
src/app/         session.ts
src/ui/          camera.ts, keys.ts, targets.ts, describe.ts, colors.ts, render.ts,
                 App.tsx, TitleScreen.tsx, GameScreen.tsx, MapCanvas.tsx, SidePanel.tsx, styles.css
src/main.tsx
tests/engine/    events.test.ts, limits.test.ts (+ edits to apply/turn/determinism/fog tests)
tests/mapgen/    mapgen.test.ts
tests/storage/   storage.test.ts
tests/app/       session.test.ts
tests/ui/        camera.test.ts, keys.test.ts, targets.test.ts, describe.test.ts, render.test.ts
```

---

### Task 1: Tooling upgrade, Preact, engine-only type check

**Files:**
- Modify: `package.json`, `tsconfig.json`, `tests/engine/determinism.test.ts` (remove the BOM only)
- Create: `tsconfig.engine.json`, `src/engine/globals.d.ts`, `vite.config.ts`, `.gitattributes`, `index.html`, `src/main.tsx`

**Interfaces:**
- Produces: `npm run typecheck` checks the whole project, then the engine without DOM types. `npm run build` produces `dist/`. `npm run dev` serves `index.html`.

- [ ] **Step 1: Replace `package.json`**

```json
{
  "name": "conquest-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run typecheck && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.engine.json"
  },
  "dependencies": {
    "preact": "10.29.8"
  },
  "devDependencies": {
    "@preact/preset-vite": "2.10.6",
    "typescript": "5.9.3",
    "vite": "6.4.4",
    "vitest": "3.2.7"
  }
}
```

Run: `npm install`
Expected: success. Run `npm audit --omit=dev` and record its output in your report. Dev-only advisories are acceptable; report them, don't fix them.

- [ ] **Step 2: Replace `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`tsconfig.engine.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": []
  },
  "include": ["src/engine"]
}
```

`src/engine/globals.d.ts`:
```ts
/** structuredClone exists in every target runtime; declared here so the engine type-checks without the DOM lib. */
declare function structuredClone<T>(value: T): T;
```

- [ ] **Step 3: Vite config, HTML entry, placeholder app**

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/conquest-web/' : '/',
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
}));
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Conquest Web</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx` (Task 10 replaces this):
```tsx
import { render } from 'preact';

render(<h1>Conquest Web</h1>, document.getElementById('app')!);
```

- [ ] **Step 4: Line endings and BOM**

`.gitattributes`:
```
* text=auto eol=lf
*.png binary
*.ico binary
```

Remove the BOM from `tests/engine/determinism.test.ts` (PowerShell):
```powershell
$p = "tests/engine/determinism.test.ts"; $c = [IO.File]::ReadAllText((Resolve-Path $p)); if ($c[0] -eq [char]0xFEFF) { [IO.File]::WriteAllText((Resolve-Path $p), $c.Substring(1), (New-Object Text.UTF8Encoding $false)) }
```

Then run: `git add --renormalize .`

- [ ] **Step 5: Verify**

Run: `npx vitest run` → Expected: all 94 existing tests pass.
Run: `npm run typecheck` → Expected: exit 0 for both configs.
Run: `npm run build` → Expected: `dist/index.html` exists and references `/conquest-web/assets/...`.
Run: `rg -n "window|document|Math\.random|Date" src/engine src/mapgen` → Expected: no matches. `src/mapgen` may not exist yet.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: upgrade tooling, add Preact and Vite app shell, engine-only typecheck"
```

---

### Task 2: Engine — fair first turn, player on commands, aircraft end-turn rule

**Files:**
- Modify: `src/engine/turn.ts` (startTurn), `src/engine/types.ts` (Command), `src/engine/apply.ts`
- Modify tests: `tests/engine/turn.test.ts`, `tests/engine/apply.test.ts`, `tests/engine/determinism.test.ts`

**Interfaces:**
- Produces: `Command` variants each carry `player: PlayerId`.
- Produces: `apply` errors:
  - `'not your turn'` when `cmd.player !== state.currentPlayer` (checked after the malformed-command check)
  - `'<Unit name> <id> cannot end its turn on an occupied square'` on a refused `endTurn`
- Produces: no production progress on turn 1.

- [ ] **Step 1: Update tests first**

In `tests/engine/turn.test.ts`, replace the whole test `'advances production only for the player whose turn starts'` with:
```ts
  it('advances production only for the player whose turn starts, from turn 2', () => {
    const s = makeGame(T);
    endTurn(s, []); // P1 starts turn 1: no production on turn 1
    expect(s.cities[1].progress).toBe(0);
    endTurn(s, []); // P0 starts turn 2
    expect(s.cities[0].progress).toBe(1);
    expect(s.cities[1].progress).toBe(0);
    endTurn(s, []); // P1 starts turn 2
    expect(s.cities[1].progress).toBe(1);
  });
```

In `tests/engine/apply.test.ts`:
- Add a `player` field to every `Command` object literal: `player: 0` everywhere. The `'end turn and disband work through apply'` test also uses `player: 0`, because player 0 is current in both states it applies to.
- Leave the non-object cases (`null`, the string `'endTurn'`) and the `{ type: 'launch' }` object unchanged. They must still be rejected.
- In the rejection list, add `{ type: 'endTurn', player: 1 }`. Player 0 is current, so it must be rejected.
- Add this test:

```ts
  it('refuses to end the turn while an aircraft sits on an occupied square', () => {
    const s = makeGame(M);
    addUnit(s, 'destroyer', 0, 4, 1);
    const f = addUnit(s, 'fighter', 0, 3, 1);
    const r1 = apply(s, { type: 'move', player: 0, unitId: f.id, dir: 2 });
    if (!r1.ok) throw new Error(r1.error);
    const r2 = apply(r1.state, { type: 'endTurn', player: 0 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/occupied/);
    const r3 = apply(r1.state, { type: 'move', player: 0, unitId: f.id, dir: 2 });
    if (!r3.ok) throw new Error(r3.error);
    expect(apply(r3.state, { type: 'endTurn', player: 0 }).ok).toBe(true);
  });
```

In `tests/engine/determinism.test.ts`:
- In `playRandomly`, add `player: me` to every command it builds: move, setProduction, endTurn, and the disband/resign extras.
- In the test `'replay reports the first rejected command'`, add `player: 0` to the literal.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine`
Expected:
- The type check doesn't run in vitest, but the new turn test fails (P1 progress 1 instead of 0).
- The aircraft test fails, because `endTurn` currently succeeds.
- The `player: 1` endTurn rejection fails.

- [ ] **Step 3: Implement**

`src/engine/types.ts` — replace the `Command` type with:
```ts
export type Command =
  | { type: 'move'; player: PlayerId; unitId: number; dir: Dir }
  | { type: 'setProduction'; player: PlayerId; cityId: number; unitType: UnitType | null }
  | { type: 'disband'; player: PlayerId; unitId: number }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'resign'; player: PlayerId };
```

`src/engine/turn.ts`: in `startTurn`, replace `advanceProduction(s, pid, events);` with:
```ts
  // Nobody's cities progress on turn 1, so every player's first production tick is on turn 2.
  if (s.turn > 1) advanceProduction(s, pid, events);
```

`src/engine/apply.ts`:
- Add imports:

```ts
import { UNIT_STATS, UNIT_TYPES } from './units';
import { cityAt, destroyUnit, topLevelUnitsAt, unitById } from './query';
```

  These replace the existing `UNIT_TYPES` and `query` imports.
- Right after the malformed-command check, add:

```ts
  if ((cmd as { player?: unknown }).player !== state.currentPlayer) return { ok: false, error: 'not your turn' };
```

- Replace the `case 'endTurn':` block with:

```ts
    case 'endTurn': {
      const stuck = s.units.find(
        (u) =>
          u.owner === actor &&
          UNIT_STATS[u.type].domain === 'air' &&
          u.carriedBy === null &&
          !cityAt(s, u.x, u.y) &&
          topLevelUnitsAt(s, u.x, u.y).length > 1,
      );
      if (stuck) error = `${UNIT_STATS[stuck.type].name} ${stuck.id} cannot end its turn on an occupied square`;
      else endTurn(s, events);
      break;
    }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run` then `npm run typecheck`
Expected: all pass. If the determinism test's `cargoStates > 0` assertion fails because production timing shifted, re-tune the random-play seed or step count in the replay test, but only those values. Report the numbers you chose. Never weaken an invariant.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): fair first turn, commands carry player, aircraft end-turn rule"
```

---

### Task 3: Engine — per-player events, PlayerView privacy, map-size limits, exports

**Files:**
- Create: `src/engine/events.ts`, `src/engine/limits.ts`
- Modify: `src/engine/view.ts`, `src/engine/index.ts`
- Test: `tests/engine/events.test.ts`, `tests/engine/limits.test.ts`; add a test in `tests/engine/fog.test.ts`

**Interfaces:**
- Consumes: `visibleSquares`, `canPlayerSeeUnit` (fog.ts), `index` (map.ts), `areFriendly`.
- Produces:
  - `eventsFor(s: GameState, events: readonly GameEvent[], pid: PlayerId): GameEvent[]`
  - `MIN_MAP`, `MAX_MAP`, `validateMapSize(width, height): string | null`
  - `interface EnemyMarker { markerId; type; owner; x; y; turnSeen; visibleNow }`
  - `PlayerView.visibleSquares: number[]` and `PlayerView.enemies: EnemyMarker[]`
- Produces (index.ts additionally exports): `DIRS`, `step`, `normalize`, `neighbors`, `chebyshev`, `isCoastal`, `index`, `terrainAt`, type `MapLike`, `eventsFor`, type `EnemyMarker`, `validateMapSize`, `MIN_MAP`, `MAX_MAP`.

- [ ] **Step 1: Write failing tests**

`tests/engine/events.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { eventsFor } from '../../src/engine/events';
import { moveUnit } from '../../src/engine/movement';
import type { GameEvent } from '../../src/engine/types';
import { addUnit, attackerAlwaysHits, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];

describe('eventsFor', () => {
  it('keeps own events and hides unseen enemy moves', () => {
    const s = makeGame(M);
    const mine = addUnit(s, 'army', 0, 1, 1);
    const r = apply(s, { type: 'move', player: 0, unitId: mine.id, dir: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(eventsFor(r.state, r.events, 0)).toEqual(r.events);
    expect(eventsFor(r.state, r.events, 1)).toEqual([]);
  });

  it('shows an enemy move that ends in sight', () => {
    const s = makeGame(M);
    const d = addUnit(s, 'destroyer', 0, 3, 1);
    const r = apply(s, { type: 'move', player: 0, unitId: d.id, dir: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(eventsFor(r.state, r.events, 1)).toEqual([]);
    const r2 = apply(r.state, { type: 'move', player: 0, unitId: d.id, dir: 2 });
    if (!r2.ok) throw new Error(r2.error);
    expect(eventsFor(r2.state, r2.events, 1)).toEqual(r2.events);
  });

  it('reports an enemy transport sinking without revealing its cargo', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 1, 4, 1);
    for (let i = 0; i < 3; i++) addUnit(s, 'army', 1, 4, 1, { carriedBy: t.id });
    const d = addUnit(s, 'destroyer', 0, 3, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, attackerAlwaysHits(), d, 2, events)).toBeNull();
    const destroyedForAttacker = eventsFor(s, events, 0).filter((e) => e.type === 'unitDestroyed');
    expect(destroyedForAttacker).toEqual([expect.objectContaining({ unitId: t.id, reason: 'combat' })]);
    expect(eventsFor(s, events, 1).filter((e) => e.type === 'unitDestroyed')).toHaveLength(4);
  });

  it('hides combat between other players far from you', () => {
    const s = makeGame(M, { players: 3 });
    addUnit(s, 'destroyer', 1, 5, 1);
    const d = addUnit(s, 'destroyer', 0, 4, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, attackerAlwaysHits(), d, 2, events)).toBeNull();
    expect(eventsFor(s, events, 2)).toEqual([]);
    expect(eventsFor(s, events, 1).some((e) => e.type === 'combat')).toBe(true);
  });

  it('shows production only to its owner and turn starts to everyone', () => {
    const s = makeGame(M);
    const u = addUnit(s, 'army', 0, 0, 0);
    const events: GameEvent[] = [
      { type: 'unitProduced', unitId: u.id, cityId: 0, unitType: 'army' },
      { type: 'turnStarted', player: 1, turn: 2 },
    ];
    expect(eventsFor(s, events, 0)).toEqual(events);
    expect(eventsFor(s, events, 1)).toEqual([events[1]]);
  });
});
```

`tests/engine/limits.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateMapSize } from '../../src/engine/limits';

describe('validateMapSize', () => {
  it('accepts sizes within 20x20..150x200', () => {
    expect(validateMapSize(20, 20)).toBeNull();
    expect(validateMapSize(150, 200)).toBeNull();
    expect(validateMapSize(60, 45)).toBeNull();
  });
  it('rejects sizes outside the limits or non-integers', () => {
    expect(validateMapSize(19, 40)).toMatch(/at least/);
    expect(validateMapSize(40, 201)).toMatch(/at most/);
    expect(validateMapSize(40.5, 40)).toMatch(/whole/);
  });
});
```

Append to the `describe('player view', …)` block in `tests/engine/fog.test.ts`:
```ts
  it('lists squares in sight and hides real enemy unit ids', () => {
    const s = makeGame(land);
    addUnit(s, 'army', 0, 2, 1);
    addUnit(s, 'army', 1, 3, 1);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    expect(v.visibleSquares).toContain(index(s, 0, 0));
    expect(v.visibleSquares).toContain(index(s, 3, 2));
    expect(v.visibleSquares).not.toContain(index(s, 5, 0));
    expect(v.enemies).toHaveLength(1);
    expect(v.enemies[0]).toMatchObject({ markerId: 0, type: 'army', owner: 1, x: 3, y: 1, visibleNow: true });
    expect('unitId' in v.enemies[0]).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/engine/events.test.ts tests/engine/limits.test.ts tests/engine/fog.test.ts`
Expected: FAIL. The modules are missing, and `visibleSquares`/`markerId` are undefined.

- [ ] **Step 3: Implement**

`src/engine/events.ts`:
```ts
import type { GameEvent, GameState, PlayerId } from './types';
import { index } from './map';
import { canPlayerSeeUnit, visibleSquares } from './fog';
import { areFriendly } from './relations';

/**
 * Filters one command's events down to what player `pid` may know.
 * `s` must be the state after the command was applied.
 */
export function eventsFor(s: GameState, events: readonly GameEvent[], pid: PlayerId): GameEvent[] {
  const vis = visibleSquares(s, pid);
  const seen = (x: number, y: number) => vis.has(index(s, x, y));
  const owners = new Map<number, PlayerId>();
  for (const u of s.units) owners.set(u.id, u.owner);
  for (const e of events) if (e.type === 'unitDestroyed') owners.set(e.unitId, e.owner);
  const mine = (owner: PlayerId | null | undefined) => owner !== undefined && owner !== null && areFriendly(s, owner, pid);
  const combatUnits = new Set<number>();
  const out: GameEvent[] = [];

  for (const e of events) {
    switch (e.type) {
      case 'unitMoved': {
        if (mine(owners.get(e.unitId))) {
          out.push(e);
          break;
        }
        const u = s.units.find((x) => x.id === e.unitId);
        if (u && seen(e.to.x, e.to.y) && canPlayerSeeUnit(s, pid, u)) out.push(e);
        break;
      }
      case 'combat':
        if (mine(e.attackerOwner) || mine(e.defender.owner) || seen(e.x, e.y)) {
          out.push(e);
          combatUnits.add(e.attackerId);
          if (e.defender.kind === 'unit') combatUnits.add(e.defender.unitId);
        }
        break;
      case 'unitDestroyed':
        if (mine(e.owner) || (e.reason !== 'cargoLost' && combatUnits.has(e.unitId))) out.push(e);
        break;
      case 'cityCaptured': {
        const c = s.cities.find((x) => x.id === e.cityId);
        if (mine(e.by) || mine(e.from) || (c !== undefined && seen(c.x, c.y))) out.push(e);
        break;
      }
      case 'unitProduced':
        if (mine(owners.get(e.unitId))) out.push(e);
        break;
      default:
        out.push(e);
    }
  }
  return out;
}
```

`src/engine/limits.ts`:
```ts
export const MIN_MAP = { width: 20, height: 20 } as const;
export const MAX_MAP = { width: 150, height: 200 } as const;

export function validateMapSize(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 'map size must be whole numbers';
  if (width < MIN_MAP.width || height < MIN_MAP.height) return `map must be at least ${MIN_MAP.width}×${MIN_MAP.height}`;
  if (width > MAX_MAP.width || height > MAX_MAP.height) return `map must be at most ${MAX_MAP.width}×${MAX_MAP.height}`;
  return null;
}
```

`src/engine/view.ts`:
- Import `UnitType` from './types' and `visibleSquares` from './fog'.
- Add the interface:

```ts
export interface EnemyMarker {
  /** View-local id; not the engine's unit id. */
  markerId: number;
  type: UnitType;
  owner: PlayerId;
  x: number;
  y: number;
  turnSeen: number;
  visibleNow: boolean;
}
```

- In `PlayerView`, replace the `enemies` field with `enemies: EnemyMarker[];` and add `visibleSquares: number[];` after `terrain`.
- In `getPlayerView`, add `visibleSquares: [...visibleSquares(s, me)].sort((a, b) => a - b),` after `terrain`, and replace the `enemies` builder with:

```ts
    enemies: Object.values(fog.lastSeen)
      .sort((a, b) => a.y - b.y || a.x - b.x || a.turnSeen - b.turnSeen || a.type.localeCompare(b.type))
      .map((e, markerId) => {
        const u = s.units.find((x) => x.id === e.unitId);
        const visibleNow = !!u && u.x === e.x && u.y === e.y && canPlayerSeeUnit(s, me, u);
        return { markerId, type: e.type, owner: e.owner, x: e.x, y: e.y, turnSeen: e.turnSeen, visibleNow };
      }),
```

- Remove the now-unused `LastSeen` import.

`src/engine/index.ts` — append:
```ts
export { DIRS, step, normalize, neighbors, chebyshev, isCoastal, index, terrainAt } from './map';
export type { MapLike } from './map';
export { eventsFor } from './events';
export type { EnemyMarker } from './view';
export { validateMapSize, MIN_MAP, MAX_MAP } from './limits';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run` then `npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): per-player event filter, private enemy markers, visible squares, map-size limits"
```

---

### Task 4: Map generator — options, noise, land and water

**Files:**
- Create: `src/mapgen/options.ts`, `src/mapgen/grid.ts`, `src/mapgen/noise.ts`, `src/mapgen/land.ts`
- Test: `tests/mapgen/mapgen.test.ts` (this task creates the file; Task 5 appends to it)

**Interfaces:**
- Produces (options.ts): `SizePreset`, `SIZE_PRESETS`, `Landmass`, `CityDensity`, `WorldOptions`, `DEFAULT_WORLD`, `LAND_PER_CITY`, `BASE_CELL`
- Produces (grid.ts): `wrapX(w, wrap, x): number | null`, `forNeighbors(w, h, wrap, x, y, fn)`, `chebyshevDist(w, wrap, ax, ay, bx, by)`
- Produces (noise.ts): `heightField(width, height, wrap, baseCell, seed, octaves = 4): number[]` (values in [0, 1])
- Produces (land.ts): `thresholdLand(h, width, height, waterPercent): boolean[]`, `labelLand(land, width, height, wrap, minSize): { land: boolean[]; labels: number[]; sizes: number[] }`

- [ ] **Step 1: Write failing tests** — `tests/mapgen/mapgen.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { heightField } from '../../src/mapgen/noise';
import { labelLand, thresholdLand } from '../../src/mapgen/land';
import { chebyshevDist, forNeighbors } from '../../src/mapgen/grid';

describe('grid helpers', () => {
  it('wraps neighbors and distance horizontally only when wrap is on', () => {
    const seen: string[] = [];
    forNeighbors(5, 5, true, 0, 0, (x, y) => seen.push(`${x},${y}`));
    expect(seen).toContain('4,1');
    expect(seen).toHaveLength(5);
    expect(chebyshevDist(10, true, 0, 0, 9, 0)).toBe(1);
    expect(chebyshevDist(10, false, 0, 0, 9, 0)).toBe(9);
  });
});

describe('heightField', () => {
  it('is deterministic, in range, and differs by seed', () => {
    const a = heightField(40, 30, false, 10, 7);
    const b = heightField(40, 30, false, 10, 7);
    const c = heightField(40, 30, false, 10, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(1200);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
  });

  it('is seamless across the wrap edge', () => {
    const w = 60;
    const h = heightField(w, 20, true, 10, 3, 1);
    for (let y = 0; y < 20; y++) {
      expect(Math.abs(h[y * w] - h[y * w + w - 1])).toBeLessThan(0.25);
    }
  });
});

describe('land', () => {
  it('thresholds to the requested water share in the interior and keeps edge rows water', () => {
    const w = 60, hgt = 45;
    const land = thresholdLand(heightField(w, hgt, false, 10, 11), w, hgt, 70);
    for (let x = 0; x < w; x++) {
      expect(land[x]).toBe(false);
      expect(land[(hgt - 1) * w + x]).toBe(false);
    }
    const interior = land.slice(w, (hgt - 1) * w);
    const water = interior.filter((l) => !l).length / interior.length;
    expect(water).toBeGreaterThan(0.68);
    expect(water).toBeLessThan(0.72);
  });

  it('removes land components smaller than the minimum and labels the rest', () => {
    // 6x4: a 1-square speck at (1,1) and a 4-square block at (3..4,1..2)
    const w = 6, h = 4;
    const land = new Array(w * h).fill(false);
    for (const [x, y] of [[1, 1], [3, 1], [4, 1], [3, 2], [4, 2]]) land[y * w + x] = true;
    const r = labelLand(land, w, h, false, 4);
    expect(r.land[1 * w + 1]).toBe(false);
    expect(r.labels[1 * w + 3]).toBe(r.labels[2 * w + 4]);
    expect(r.labels[0]).toBe(-1);
    expect(r.sizes[r.labels[1 * w + 3]]).toBe(4);
  });

  it('joins land across the wrap seam', () => {
    const w = 6, h = 3;
    const land = new Array(w * h).fill(false);
    for (const [x, y] of [[0, 1], [5, 1], [0, 2], [5, 2]]) land[y * w + x] = true;
    const r = labelLand(land, w, h, true, 4);
    expect(r.labels[1 * w + 0]).toBe(r.labels[1 * w + 5]);
    expect(r.land[1 * w + 0]).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mapgen/mapgen.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/mapgen/options.ts`:
```ts
export type SizePreset = 'small' | 'medium' | 'large' | 'huge';
export type Landmass = 'islands' | 'mixed' | 'continents';
export type CityDensity = 'low' | 'normal' | 'high';

export const SIZE_PRESETS: Record<SizePreset, { width: number; height: number }> = {
  small: { width: 40, height: 30 },
  medium: { width: 60, height: 45 },
  large: { width: 100, height: 70 },
  huge: { width: 150, height: 100 },
};

export interface WorldOptions {
  width: number;
  height: number;
  wrap: boolean;
  /** 60..85 */
  waterPercent: number;
  landmass: Landmass;
  cityDensity: CityDensity;
  /** 2..6 */
  players: number;
}

export const DEFAULT_WORLD: WorldOptions = {
  ...SIZE_PRESETS.medium,
  wrap: false,
  waterPercent: 70,
  landmass: 'mixed',
  cityDensity: 'normal',
  players: 2,
};

/** Land squares per city. */
export const LAND_PER_CITY: Record<CityDensity, number> = { low: 30, normal: 20, high: 13 };

/** Noise lattice spacing in squares for the first octave. */
export const BASE_CELL: Record<Landmass, number> = { islands: 6, mixed: 10, continents: 16 };
```

`src/mapgen/grid.ts`:
```ts
export function wrapX(w: number, wrap: boolean, x: number): number | null {
  if (wrap) return ((x % w) + w) % w;
  return x >= 0 && x < w ? x : null;
}

export function forNeighbors(
  w: number, h: number, wrap: boolean, x: number, y: number, fn: (nx: number, ny: number) => void,
): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      const nx = wrapX(w, wrap, x + dx);
      if (nx !== null) fn(nx, ny);
    }
  }
}

export function chebyshevDist(w: number, wrap: boolean, ax: number, ay: number, bx: number, by: number): number {
  let dx = Math.abs(ax - bx);
  if (wrap) dx = Math.min(dx, w - dx);
  return Math.max(dx, Math.abs(ay - by));
}
```

`src/mapgen/noise.ts`:
```ts
import { Rng } from '../engine/rng';

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Seeded multi-octave value noise, normalized to [0, 1]. Wraps horizontally when `wrap` is true. */
export function heightField(
  width: number, height: number, wrap: boolean, baseCell: number, seed: number, octaves = 4,
): number[] {
  const rng = new Rng(seed);
  const out = new Array<number>(width * height).fill(0);
  let amp = 1;
  let totalAmp = 0;
  let cell = baseCell;
  for (let o = 0; o < octaves; o++) {
    const cols = Math.max(1, Math.round(width / cell));
    const rows = Math.max(1, Math.round(height / cell));
    const cellX = width / cols;
    const cellY = height / rows;
    const gridW = cols + 1;
    const grid = Array.from({ length: gridW * (rows + 1) }, () => rng.next());
    const at = (i: number, j: number) => grid[j * gridW + (wrap ? i % cols : i)];
    for (let y = 0; y < height; y++) {
      const fy = (y + 0.5) / cellY;
      const j0 = Math.min(rows - 1, Math.floor(fy));
      const ty = smooth(Math.min(1, fy - j0));
      for (let x = 0; x < width; x++) {
        const fx = (x + 0.5) / cellX;
        const i0 = Math.min(cols - 1, Math.floor(fx));
        const tx = smooth(Math.min(1, fx - i0));
        const top = at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx;
        const bottom = at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx;
        out[y * width + x] += amp * (top * (1 - ty) + bottom * ty);
      }
    }
    totalAmp += amp;
    amp /= 2;
    cell = Math.max(2, cell / 2);
  }
  return out.map((v) => v / totalAmp);
}
```

`src/mapgen/land.ts`:
```ts
import { forNeighbors } from './grid';

/**
 * Land = interior squares whose height is at or above the waterPercent percentile of interior heights.
 * The top and bottom rows are always water.
 */
export function thresholdLand(h: number[], width: number, height: number, waterPercent: number): boolean[] {
  const interior = h.slice(width, (height - 1) * width);
  const sorted = [...interior].sort((a, b) => a - b);
  const cut = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * waterPercent) / 100))];
  return h.map((v, i) => {
    const y = Math.floor(i / width);
    return y > 0 && y < height - 1 && v >= cut;
  });
}

/** Labels 8-connected land components; components smaller than minSize become water (label -1). */
export function labelLand(
  input: boolean[], width: number, height: number, wrap: boolean, minSize: number,
): { land: boolean[]; labels: number[]; sizes: number[] } {
  const land = [...input];
  const labels = new Array<number>(land.length).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < land.length; start++) {
    if (!land[start] || labels[start] !== -1) continue;
    const id = sizes.length;
    const members = [start];
    labels[start] = id;
    for (let k = 0; k < members.length; k++) {
      const i = members[k];
      forNeighbors(width, height, wrap, i % width, Math.floor(i / width), (nx, ny) => {
        const n = ny * width + nx;
        if (land[n] && labels[n] === -1) {
          labels[n] = id;
          members.push(n);
        }
      });
    }
    if (members.length < minSize) {
      for (const i of members) {
        land[i] = false;
        labels[i] = -2; // removed; reset below
      }
      sizes.push(0);
    } else {
      sizes.push(members.length);
    }
  }
  for (let i = 0; i < labels.length; i++) if (labels[i] === -2) labels[i] = -1;
  return { land, labels, sizes };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/mapgen/mapgen.test.ts`, then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mapgen): world options, seeded value noise, land/water and landmass labeling"
```

---

### Task 5: Map generator — cities, fair starts, generateWorld

**Files:**
- Create: `src/mapgen/cities.ts`, `src/mapgen/starts.ts`, `src/mapgen/generate.ts`, `src/mapgen/index.ts`
- Test: append to `tests/mapgen/mapgen.test.ts`

**Interfaces:**
- Consumes: Task 4 modules; `Rng`, `createGame`, `validateMapSize`, `ParsedMap`, `Pos`, `Terrain` from the engine.
- Produces:
  - `placeCities(land, width, height, wrap, target, rng): Pos[]` (row-major order)
  - `chooseStarts(cities, labels, width, wrap, players, minOthers): number[] | null`
  - `interface GeneratedWorld { map: ParsedMap; startCityIndices: number[]; seedUsed: number }`
  - `generateWorld(opts: WorldOptions, seed: number): GeneratedWorld`
  - `src/mapgen/index.ts` re-exports `generateWorld`, `GeneratedWorld`, everything from `options.ts`

- [ ] **Step 1: Write failing tests** — append to `tests/mapgen/mapgen.test.ts`

```ts
import { placeCities } from '../../src/mapgen/cities';
import { chooseStarts } from '../../src/mapgen/starts';
import { generateWorld } from '../../src/mapgen/generate';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen/options';
import { Rng } from '../../src/engine/rng';
import { createGame } from '../../src/engine/setup';

describe('cities and starts', () => {
  it('places cities on land at least 3 apart', () => {
    const w = 60, h = 45;
    const { land } = labelLand(thresholdLand(heightField(w, h, false, 10, 5), w, h, 70), w, h, false, 4);
    const cities = placeCities(land, w, h, false, 40, new Rng(1));
    expect(cities.length).toBeGreaterThan(10);
    for (const c of cities) expect(land[c.y * w + c.x]).toBe(true);
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        expect(chebyshevDist(w, false, cities[i].x, cities[i].y, cities[j].x, cities[j].y)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('returns null when not enough qualifying cities exist', () => {
    const cities = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
    const labels = new Array(10).fill(-1);
    labels[0] = 0;
    labels[5] = 1;
    expect(chooseStarts(cities, labels, 10, false, 2, 3)).toBeNull();
    expect(chooseStarts(cities, labels, 10, false, 2, 0)).toEqual(expect.arrayContaining([0, 1]));
  });
});

describe('generateWorld', () => {
  const opts = { ...DEFAULT_WORLD };

  it('is deterministic for a seed', () => {
    expect(generateWorld(opts, 42)).toEqual(generateWorld(opts, 42));
    expect(generateWorld(opts, 42).map.terrain).not.toEqual(generateWorld(opts, 43).map.terrain);
  });

  it('hits the water target, has no tiny islands, and spaces cities', () => {
    const { map } = generateWorld(opts, 9);
    const water = map.terrain.filter((t) => t === 'water').length / map.terrain.length;
    expect(water).toBeGreaterThan(0.67);
    expect(water).toBeLessThan(0.75);
    const land = map.terrain.map((t) => t !== 'water');
    const r = labelLand(land, map.width, map.height, false, 1);
    for (const size of r.sizes) if (size > 0) expect(size).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < map.cities.length; i++) {
      for (let j = i + 1; j < map.cities.length; j++) {
        const a = map.cities[i], b = map.cities[j];
        expect(chebyshevDist(map.width, false, a.x, a.y, b.x, b.y)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('produces valid, distinct starts that createGame accepts, for 2..6 players', () => {
    for (let players = 2; players <= 6; players++) {
      const w = generateWorld({ ...opts, players }, 100 + players);
      expect(new Set(w.startCityIndices).size).toBe(players);
      const s = createGame({
        map: w.map,
        players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, kind: 'human' as const })),
        startCityIndices: w.startCityIndices,
        seed: w.seedUsed,
      });
      expect(s.cities.filter((c) => c.owner !== null)).toHaveLength(players);
    }
  });

  it('gives 2-4 players at least 3 other cities on their start landmass with default settings', () => {
    for (let players = 2; players <= 4; players++) {
      const w = generateWorld({ ...opts, players }, 7);
      const land = w.map.terrain.map((t) => t !== 'water');
      const { labels } = labelLand(land, w.map.width, w.map.height, false, 1);
      for (const si of w.startCityIndices) {
        const c = w.map.cities[si];
        const label = labels[c.y * w.map.width + c.x];
        const others = w.map.cities.filter((o) => labels[o.y * w.map.width + o.x] === label).length - 1;
        expect(others).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('handles edge settings without hanging', () => {
    expect(() => generateWorld({ ...opts, ...SIZE_PRESETS.small, players: 6 }, 1)).not.toThrow();
    expect(() => generateWorld({ ...opts, waterPercent: 85 }, 1)).not.toThrow();
  });

  it('rejects invalid options', () => {
    expect(() => generateWorld({ ...opts, width: 10 }, 1)).toThrow(/at least/);
    expect(() => generateWorld({ ...opts, players: 7 }, 1)).toThrow(/players/);
    expect(() => generateWorld({ ...opts, waterPercent: 95 }, 1)).toThrow(/water/);
  });

  it('generates a Huge map in under a second', () => {
    const t0 = performance.now();
    generateWorld({ ...opts, ...SIZE_PRESETS.huge, players: 6 }, 3);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/mapgen/mapgen.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/mapgen/cities.ts`:
```ts
import type { Pos } from '../engine/types';
import type { RandomSource } from '../engine/rng';
import { chebyshevDist, forNeighbors } from './grid';

const MIN_CITY_SPACING = 3;
const COASTAL_SHARE = 0.7;

function shuffle<T>(xs: T[], rng: RandomSource): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** Places up to `target` cities on land, MIN_CITY_SPACING apart, about 70% coastal. Row-major order. */
export function placeCities(
  land: boolean[], width: number, height: number, wrap: boolean, target: number, rng: RandomSource,
): Pos[] {
  const coastal: Pos[] = [];
  const inland: Pos[] = [];
  for (let i = 0; i < land.length; i++) {
    if (!land[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    let nearWater = false;
    forNeighbors(width, height, wrap, x, y, (nx, ny) => {
      if (!land[ny * width + nx]) nearWater = true;
    });
    (nearWater ? coastal : inland).push({ x, y });
  }
  shuffle(coastal, rng);
  shuffle(inland, rng);

  const picked: Pos[] = [];
  const fits = (p: Pos) => picked.every((q) => chebyshevDist(width, wrap, p.x, p.y, q.x, q.y) >= MIN_CITY_SPACING);
  const take = (pool: Pos[], limit: number) => {
    for (const p of pool) {
      if (picked.length >= limit) return;
      if (fits(p)) picked.push(p);
    }
  };
  take(coastal, Math.round(target * COASTAL_SHARE));
  take(inland, target);
  take(coastal, target);
  return picked.sort((a, b) => a.y - b.y || a.x - b.x);
}
```

`src/mapgen/starts.ts`:
```ts
import type { Pos } from '../engine/types';
import { chebyshevDist } from './grid';

/**
 * Picks one start city per player. Candidates are cities whose landmass holds at least `minOthers` other cities.
 * Greedy farthest-point selection, preferring landmasses not yet used. Returns indices into `cities`, or null.
 */
export function chooseStarts(
  cities: Pos[], labels: number[], width: number, wrap: boolean, players: number, minOthers: number,
): number[] | null {
  const labelOf = (i: number) => labels[cities[i].y * width + cities[i].x];
  const perLandmass = new Map<number, number>();
  cities.forEach((_, i) => perLandmass.set(labelOf(i), (perLandmass.get(labelOf(i)) ?? 0) + 1));
  const candidates = cities.map((_, i) => i).filter((i) => (perLandmass.get(labelOf(i)) ?? 0) >= minOthers + 1);
  if (candidates.length < players) return null;

  // First start: a city on the landmass with the most cities (lowest index on ties).
  let first = candidates[0];
  for (const i of candidates) {
    if ((perLandmass.get(labelOf(i)) ?? 0) > (perLandmass.get(labelOf(first)) ?? 0)) first = i;
  }
  const chosen = [first];
  const usedLandmasses = new Set([labelOf(first)]);
  while (chosen.length < players) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of candidates) {
      if (chosen.includes(i)) continue;
      const minDist = Math.min(
        ...chosen.map((c) => chebyshevDist(width, wrap, cities[i].x, cities[i].y, cities[c].x, cities[c].y)),
      );
      const score = (usedLandmasses.has(labelOf(i)) ? 0 : 1_000_000) + minDist;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1) return null;
    chosen.push(best);
    usedLandmasses.add(labelOf(best));
  }
  return chosen;
}
```

`src/mapgen/generate.ts`:
```ts
import type { ParsedMap } from '../engine/ascii';
import type { Terrain } from '../engine/types';
import { Rng } from '../engine/rng';
import { validateMapSize } from '../engine/limits';
import { BASE_CELL, LAND_PER_CITY, type WorldOptions } from './options';
import { heightField } from './noise';
import { labelLand, thresholdLand } from './land';
import { placeCities } from './cities';
import { chooseStarts } from './starts';

export interface GeneratedWorld {
  map: ParsedMap;
  startCityIndices: number[];
  seedUsed: number;
}

const ATTEMPTS = 50;
const MIN_ISLAND = 4;

function attempt(o: WorldOptions, seed: number, minOthers: number): GeneratedWorld | null {
  const { width, height, wrap } = o;
  const h = heightField(width, height, wrap, BASE_CELL[o.landmass], seed);
  const { land, labels } = labelLand(thresholdLand(h, width, height, o.waterPercent), width, height, wrap, MIN_ISLAND);
  const landCount = land.filter(Boolean).length;
  const target = Math.max(o.players * (minOthers + 1), Math.round(landCount / LAND_PER_CITY[o.cityDensity]));
  const cities = placeCities(land, width, height, wrap, target, new Rng(seed ^ 0x9e3779b9));
  const starts = chooseStarts(cities, labels, width, wrap, o.players, minOthers);
  if (!starts) return null;
  const terrain: Terrain[] = land.map((l) => (l ? 'land' : 'water'));
  for (const c of cities) terrain[c.y * width + c.x] = 'city';
  return { map: { width, height, terrain, cities }, startCityIndices: starts, seedUsed: seed };
}

export function generateWorld(o: WorldOptions, seed: number): GeneratedWorld {
  const sizeError = validateMapSize(o.width, o.height);
  if (sizeError) throw new Error(sizeError);
  if (!Number.isInteger(o.players) || o.players < 2 || o.players > 6) throw new Error('players must be 2 to 6');
  if (o.waterPercent < 60 || o.waterPercent > 85) throw new Error('water must be 60% to 85%');
  for (let k = 0; k < ATTEMPTS; k++) {
    const w = attempt(o, (seed + k) | 0, 3);
    if (w) return w;
  }
  for (let k = 0; k < ATTEMPTS; k++) {
    const w = attempt(o, (seed + k) | 0, 0);
    if (w) return w;
  }
  throw new Error('could not generate a playable world; try less water or a larger map');
}
```

`src/mapgen/index.ts`:
```ts
export * from './options';
export { generateWorld } from './generate';
export type { GeneratedWorld } from './generate';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/mapgen/mapgen.test.ts`, then the full suite and `npm run typecheck`
Expected: PASS. If the water-share test lands just outside 0.67–0.75 for seed 9, try seeds 10–20. Report the seed you picked. Don't widen the bounds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mapgen): city placement, fair start selection, generateWorld with retries"
```

---

### Task 6: Storage — save format, validation, save stores

**Files:**
- Create: `src/storage/saveFormat.ts`, `src/storage/store.ts`, `src/storage/indexedDb.ts`, `src/storage/index.ts`
- Test: `tests/storage/storage.test.ts`

**Interfaces:**
- Consumes: `replay`, `hashState`, `Command`, `GameState` from the engine.
- Produces:
  - `interface SeatConfig { name: string; kind: 'human' | 'idle'; color: string }`
  - `interface SaveFile { format: 1; savedAt: string; name: string; seats: SeatConfig[]; initial: GameState; commands: Command[]; snapshot: GameState }`
  - `serializeSave(save): string`
  - `parseSave(text): { ok: true; save: SaveFile } | { ok: false; error: string }`
  - `interface SaveSummary { name: string; savedAt: string; turn: number }`
  - `interface SaveStore { list(): Promise<SaveSummary[]>; get(name): Promise<SaveFile | undefined>; put(save): Promise<void>; delete(name): Promise<void> }`
  - `class MemorySaveStore implements SaveStore`
  - `class IndexedDbSaveStore implements SaveStore`

- [ ] **Step 1: Write failing tests** — `tests/storage/storage.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import type { Command, GameState } from '../../src/engine/types';
import { MemorySaveStore, parseSave, serializeSave, type SaveFile } from '../../src/storage';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];
const seats = [
  { name: 'Ann', kind: 'human' as const, color: '#d7263d' },
  { name: 'Bot', kind: 'idle' as const, color: '#1b98e0' },
];

function sampleSave(name = 'slot'): SaveFile {
  const initial = makeGame(M);
  const u = addUnit(initial, 'army', 0, 1, 1);
  const commands: Command[] = [{ type: 'move', player: 0, unitId: u.id, dir: 2 }, { type: 'endTurn', player: 0 }];
  let s: GameState = initial;
  for (const c of commands) {
    const r = apply(s, c);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return { format: 1, savedAt: '2026-10-14T12:00:00.000Z', name, seats, initial, commands, snapshot: s };
}

describe('parseSave', () => {
  it('accepts a valid save', () => {
    const r = parseSave(serializeSave(sampleSave()));
    expect(r.ok).toBe(true);
  });

  it('rejects bad JSON, wrong format, tampering and seat mismatch', () => {
    const good = sampleSave();
    expect(parseSave('{nope').ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...good, format: 2 })).ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...good, commands: 'x' })).ok).toBe(false);
    const tampered = structuredClone(good);
    tampered.snapshot.turn = 99;
    const t = parseSave(serializeSave(tampered));
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toMatch(/damaged/);
    expect(parseSave(JSON.stringify({ ...good, seats: [seats[0]] })).ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...good, commands: [{ type: 'move', player: 0, unitId: 999, dir: 0 }] })).ok).toBe(false);
  });
});

describe('MemorySaveStore', () => {
  it('puts, lists newest first, gets and deletes', async () => {
    const store = new MemorySaveStore();
    await store.put({ ...sampleSave('a'), savedAt: '2026-10-14T10:00:00.000Z' });
    await store.put({ ...sampleSave('b'), savedAt: '2026-10-14T11:00:00.000Z' });
    expect((await store.list()).map((x) => x.name)).toEqual(['b', 'a']);
    expect((await store.list())[0].turn).toBe(1);
    expect((await store.get('a'))?.name).toBe('a');
    await store.delete('a');
    expect(await store.get('a')).toBeUndefined();
  });

  it('returns copies so callers cannot mutate stored saves', async () => {
    const store = new MemorySaveStore();
    await store.put(sampleSave('a'));
    const got = await store.get('a');
    got!.snapshot.turn = 50;
    expect((await store.get('a'))!.snapshot.turn).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/storage/storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/storage/saveFormat.ts`:
```ts
import type { Command, GameState } from '../engine';
import { hashState, replay } from '../engine';

export interface SeatConfig {
  name: string;
  kind: 'human' | 'idle';
  color: string;
}

export interface SaveFile {
  format: 1;
  savedAt: string;
  name: string;
  seats: SeatConfig[];
  initial: GameState;
  commands: Command[];
  snapshot: GameState;
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isSeat(v: unknown): v is SeatConfig {
  return isObj(v) && typeof v.name === 'string' && (v.kind === 'human' || v.kind === 'idle') && typeof v.color === 'string';
}

export function parseSave(text: string): { ok: true; save: SaveFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not a valid save file (unreadable JSON)' };
  }
  if (!isObj(raw) || raw.format !== 1) return { ok: false, error: 'unsupported save format' };
  const { name, savedAt, seats, initial, commands, snapshot } = raw;
  if (typeof name !== 'string' || typeof savedAt !== 'string') return { ok: false, error: 'save file is missing its name or date' };
  if (!Array.isArray(seats) || !seats.every(isSeat)) return { ok: false, error: 'save file has invalid player seats' };
  if (!isObj(initial) || !isObj(snapshot) || !Array.isArray(commands)) return { ok: false, error: 'save file is incomplete' };
  if (initial.version !== 1 || !Array.isArray(initial.players)) return { ok: false, error: 'unsupported game version' };
  if (seats.length !== initial.players.length) return { ok: false, error: 'save file seats do not match its players' };
  try {
    const replayed = replay(initial as unknown as GameState, commands as Command[]);
    if (hashState(replayed) !== hashState(snapshot as unknown as GameState)) {
      return { ok: false, error: 'save file is damaged (history does not match)' };
    }
  } catch {
    return { ok: false, error: 'save file is damaged (history could not be replayed)' };
  }
  return { ok: true, save: raw as unknown as SaveFile };
}
```

`src/storage/store.ts`:
```ts
import type { SaveFile } from './saveFormat';

export interface SaveSummary {
  name: string;
  savedAt: string;
  turn: number;
}

export interface SaveStore {
  list(): Promise<SaveSummary[]>;
  get(name: string): Promise<SaveFile | undefined>;
  put(save: SaveFile): Promise<void>;
  delete(name: string): Promise<void>;
}

export function summarize(save: SaveFile): SaveSummary {
  return { name: save.name, savedAt: save.savedAt, turn: save.snapshot.turn };
}

export function newestFirst(a: SaveSummary, b: SaveSummary): number {
  return b.savedAt.localeCompare(a.savedAt);
}

export class MemorySaveStore implements SaveStore {
  private saves = new Map<string, string>();

  async list(): Promise<SaveSummary[]> {
    return [...this.saves.values()].map((t) => summarize(JSON.parse(t) as SaveFile)).sort(newestFirst);
  }

  async get(name: string): Promise<SaveFile | undefined> {
    const t = this.saves.get(name);
    return t === undefined ? undefined : (JSON.parse(t) as SaveFile);
  }

  async put(save: SaveFile): Promise<void> {
    this.saves.set(save.name, JSON.stringify(save));
  }

  async delete(name: string): Promise<void> {
    this.saves.delete(name);
  }
}
```

`src/storage/indexedDb.ts`:
```ts
import type { SaveFile } from './saveFormat';
import { newestFirst, summarize, type SaveStore, type SaveSummary } from './store';

const DB_NAME = 'conquest-web';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

/** Browser save slots in IndexedDB. Not unit-tested; covered by the manual browser check. */
export class IndexedDbSaveStore implements SaveStore {
  async list(): Promise<SaveSummary[]> {
    const all = await run<SaveFile[]>('readonly', (s) => s.getAll() as IDBRequest<SaveFile[]>);
    return all.map(summarize).sort(newestFirst);
  }

  async get(name: string): Promise<SaveFile | undefined> {
    return run<SaveFile | undefined>('readonly', (s) => s.get(name) as IDBRequest<SaveFile | undefined>);
  }

  async put(save: SaveFile): Promise<void> {
    await run('readwrite', (s) => s.put(save));
  }

  async delete(name: string): Promise<void> {
    await run('readwrite', (s) => s.delete(name));
  }
}
```

`src/storage/index.ts`:
```ts
export * from './saveFormat';
export * from './store';
export { IndexedDbSaveStore } from './indexedDb';
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/storage/storage.test.ts`, then the full suite and `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(storage): versioned save format with replay validation, memory and IndexedDB stores"
```

---

### Task 7: GameSession

**Files:**
- Create: `src/app/session.ts`
- Test: `tests/app/session.test.ts`

**Interfaces:**
- Consumes: the engine (`apply`, `createGame`, `eventsFor`, `getPlayerView`), the map generator (`generateWorld`, `WorldOptions`) and storage (`SaveFile`, `SeatConfig`, `SaveStore`).
- Produces:
  - `type SessionCommand`: a `Command` without its `player` field (the session fills it in)
  - `type SessionPhase = 'playing' | 'handoff' | 'over'`
  - `interface LogEntry { turn: number; event: GameEvent }`
  - `interface NewSessionOptions { world: WorldOptions; seed: number; seats: SeatConfig[] }`
  - `class GameSession`:
    - creation: `static create(o, store)`, `static fromSave(save, store)`
    - fields: `phase`, `seats`, `state`, `initial`, `commands`, `name`
    - views and logs: `viewer`, `view()`, `revealedView()`, `log(pid)`, `lastEvents`
    - actions: `act(cmd): string | null`, `confirmHandoff()`
    - saving: `toSave(name?)`, `saveAs(name)`, `autosave()`
    - listeners: `subscribe(fn): () => void`

- [ ] **Step 1: Write failing tests** — `tests/app/session.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/app/session';
import { hashState } from '../../src/engine/hash';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen';
import { MemorySaveStore, parseSave, serializeSave, type SeatConfig } from '../../src/storage';

const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.small };
const human = (name: string): SeatConfig => ({ name, kind: 'human', color: '#d7263d' });
const idle = (name: string): SeatConfig => ({ name, kind: 'idle', color: '#1b98e0' });

describe('GameSession', () => {
  it('plays Idle seats automatically and returns to the human', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, null);
    expect(s.phase).toBe('playing');
    expect(s.state.currentPlayer).toBe(0);
    expect(s.act({ type: 'endTurn' })).toBeNull();
    expect(s.state.currentPlayer).toBe(0);
    expect(s.state.turn).toBe(2);
    expect(s.phase).toBe('playing');
  });

  it('runs a hotseat hand-off between humans and blocks commands during it', () => {
    const s = GameSession.create({ world: { ...world, players: 2 }, seed: 5, seats: [human('Ann'), human('Ben')] }, null);
    expect(s.phase).toBe('handoff');
    expect(s.act({ type: 'endTurn' })).toMatch(/not accepting/);
    s.confirmHandoff();
    expect(s.phase).toBe('playing');
    expect(s.act({ type: 'endTurn' })).toBeNull();
    expect(s.phase).toBe('handoff');
    expect(s.viewer).toBe(1);
  });

  it('keeps each player log private', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, null);
    for (let i = 0; i < 9; i++) expect(s.act({ type: 'endTurn' })).toBeNull();
    const botUnits = new Set(s.state.units.filter((u) => u.owner === 1).map((u) => u.id));
    expect(botUnits.size).toBeGreaterThan(0);
    const leaked = s.log(0).filter((e) => e.event.type === 'unitProduced' && botUnits.has(e.event.unitId));
    expect(leaked).toEqual([]);
    expect(s.log(0).some((e) => e.event.type === 'unitProduced')).toBe(true);
  });

  it('autosaves on every turn change, and saves load back identically', async () => {
    const store = new MemorySaveStore();
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, store);
    s.act({ type: 'endTurn' });
    await s.autosave();
    const saved = await store.get('autosave');
    expect(saved).toBeDefined();
    expect(hashState(saved!.snapshot)).toBe(hashState(s.state));
    const parsed = parseSave(serializeSave(saved!));
    if (!parsed.ok) throw new Error(parsed.error);
    const loaded = GameSession.fromSave(parsed.save, store);
    expect(hashState(loaded.state)).toBe(hashState(s.state));
    expect(loaded.phase).toBe('playing');
  });

  it('validates seats', () => {
    expect(() => GameSession.create({ world, seed: 1, seats: [human('Ann')] }, null)).toThrow(/seat/);
    expect(() => GameSession.create({ world, seed: 1, seats: [idle('A'), idle('B')] }, null)).toThrow(/human/);
  });

  it('notifies subscribers and reports engine errors', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, null);
    let calls = 0;
    const off = s.subscribe(() => calls++);
    expect(s.act({ type: 'move', unitId: 999, dir: 0 })).toMatch(/no such unit/);
    expect(s.act({ type: 'endTurn' })).toBeNull();
    off();
    s.act({ type: 'endTurn' });
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/app/session.ts`

```ts
import {
  apply, createGame, eventsFor, getPlayerView,
  type Command, type GameEvent, type GameState, type PlayerId, type PlayerView,
} from '../engine';
import { generateWorld, type WorldOptions } from '../mapgen';
import type { SaveFile, SaveStore, SeatConfig } from '../storage';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A command without `player`; the session fills in the current player. */
export type SessionCommand = DistributiveOmit<Command, 'player'>;
export type SessionPhase = 'playing' | 'handoff' | 'over';

export interface LogEntry {
  turn: number;
  event: GameEvent;
}

export interface NewSessionOptions {
  world: WorldOptions;
  seed: number;
  seats: SeatConfig[];
}

const IDLE_GUARD = 10_000;

export class GameSession {
  phase: SessionPhase = 'playing';
  /** Events from the last successful act, filtered for the player who acted. */
  lastEvents: GameEvent[] = [];
  private logs: LogEntry[][];
  private listeners = new Set<() => void>();
  private lastHuman: PlayerId;

  private constructor(
    readonly seats: SeatConfig[],
    readonly initial: GameState,
    public state: GameState,
    readonly commands: Command[],
    private store: SaveStore | null,
    public name: string,
  ) {
    this.logs = seats.map(() => []);
    this.lastHuman = seats.findIndex((s) => s.kind === 'human');
  }

  static create(o: NewSessionOptions, store: SaveStore | null): GameSession {
    if (o.seats.length !== o.world.players) throw new Error('seat count must match the number of players');
    if (!o.seats.some((s) => s.kind === 'human')) throw new Error('at least one seat must be human');
    const world = generateWorld(o.world, o.seed);
    const initial = createGame({
      map: world.map,
      wrap: o.world.wrap,
      players: o.seats.map((s) => ({ name: s.name, kind: s.kind === 'human' ? 'human' : 'ai' })),
      startCityIndices: world.startCityIndices,
      seed: world.seedUsed,
    });
    const session = new GameSession(o.seats, initial, initial, [], store, 'autosave');
    session.afterTurnChange();
    return session;
  }

  static fromSave(save: SaveFile, store: SaveStore | null): GameSession {
    const session = new GameSession(save.seats, save.initial, save.snapshot, [...save.commands], store, save.name);
    session.phase = save.snapshot.over ? 'over' : 'playing';
    if (!save.snapshot.over) session.lastHuman = save.snapshot.currentPlayer;
    return session;
  }

  /** The human whose view the UI shows. */
  get viewer(): PlayerId {
    if (this.state.over) return this.lastHuman;
    return this.state.currentPlayer;
  }

  view(): PlayerView {
    return getPlayerView(this.state, this.viewer);
  }

  /** The viewer's view with the whole map explored (game-over "View Map"). */
  revealedView(): PlayerView {
    const s = structuredClone(this.state);
    s.fog[this.viewer].explored.fill(1);
    return getPlayerView(s, this.viewer);
  }

  log(pid: PlayerId): readonly LogEntry[] {
    return this.logs[pid];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  act(cmd: SessionCommand): string | null {
    if (this.phase !== 'playing') return 'not accepting commands now';
    const actor = this.state.currentPlayer;
    const full = { ...cmd, player: actor } as Command;
    const result = this.applyCommand(full);
    if (typeof result === 'string') return result;
    this.lastEvents = eventsFor(this.state, result, actor);
    if (full.type === 'endTurn' || full.type === 'resign') this.afterTurnChange();
    else if (this.state.over) this.phase = 'over';
    this.emit();
    return null;
  }

  confirmHandoff(): void {
    if (this.phase !== 'handoff') return;
    this.phase = 'playing';
    this.emit();
  }

  toSave(name: string = this.name): SaveFile {
    return {
      format: 1,
      savedAt: new Date().toISOString(),
      name,
      seats: this.seats,
      initial: this.initial,
      commands: this.commands,
      snapshot: this.state,
    };
  }

  async saveAs(name: string): Promise<void> {
    this.name = name;
    if (this.store) await this.store.put(this.toSave(name));
  }

  async autosave(): Promise<void> {
    if (this.store) await this.store.put(this.toSave('autosave'));
  }

  /** Applies a full command; returns its raw events, or an error message. */
  private applyCommand(cmd: Command): GameEvent[] | string {
    const r = apply(this.state, cmd);
    if (!r.ok) return r.error;
    this.state = r.state;
    this.commands.push(cmd);
    this.seats.forEach((_, pid) => {
      for (const event of eventsFor(r.state, r.events, pid)) this.logs[pid].push({ turn: r.state.turn, event });
    });
    return r.events;
  }

  private afterTurnChange(): void {
    let guard = 0;
    while (!this.state.over && this.seats[this.state.currentPlayer].kind === 'idle') {
      const pid = this.state.currentPlayer;
      const r = this.applyCommand({ type: 'endTurn', player: pid });
      if (typeof r === 'string') this.applyCommand({ type: 'resign', player: pid });
      if (++guard > IDLE_GUARD) throw new Error('idle players did not finish');
    }
    if (this.state.over) {
      this.phase = 'over';
    } else {
      this.lastHuman = this.state.currentPlayer;
      const humans = this.seats.filter((s) => s.kind === 'human').length;
      this.phase = humans > 1 ? 'handoff' : 'playing';
    }
    void this.autosave();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/app/session.test.ts`, then the full suite and `npm run typecheck`
Expected: PASS. The privacy test needs the Idle seat to have produced a unit within 9 rounds; armies take 6 turns from turn 2. If `botUnits.size` is 0, raise the loop count. Don't remove the assertion.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): GameSession with Idle seats, hotseat hand-off, private logs, autosave"
```

---

### Task 8: UI logic — camera, keys, step targets, event text, colors

**Files:**
- Create: `src/ui/camera.ts`, `src/ui/keys.ts`, `src/ui/targets.ts`, `src/ui/describe.ts`, `src/ui/colors.ts`
- Test: `tests/ui/camera.test.ts`, `tests/ui/keys.test.ts`, `tests/ui/targets.test.ts`, `tests/ui/describe.test.ts`

**Interfaces:**
- Produces (camera.ts):
  - `interface Camera { x: number; y: number; tile: number }`. `x`/`y` are the map coordinates (in squares, fractional) at the viewport's top-left.
  - `MIN_TILE = 12`, `MAX_TILE = 48`
  - `screenToMap(cam, mapW, mapH, wrap, sx, sy): Pos | null`
  - `mapToScreen(cam, x, y): { sx: number; sy: number }`
  - `zoomAt(cam, factor, sx, sy): Camera`
  - `pan(cam, dxPx, dyPx): Camera`
  - `centerOn(cam, x, y, viewW, viewH): Camera`
  - `clampCamera(cam, mapW, mapH, viewW, viewH, wrap): Camera`
- Produces (keys.ts): `type KeyAction` and `keyToAction(key: string, code: string): KeyAction | null`
- Produces (targets.ts):
  - `interface StepTarget { x: number; y: number; dir: Dir; attack: boolean }`
  - `stepTargets(view: PlayerView, unit: Unit): StepTarget[]`
  - `dirTo(view, from: Pos, to: Pos): Dir | null`
- Produces (describe.ts): `describeEvent(e: GameEvent, me: PlayerId, names: string[]): string | null`
- Produces (colors.ts): `PLAYER_COLORS: string[]`, `TERRAIN_COLORS`, `UNIT_GLYPH: Record<UnitType, string>`

- [ ] **Step 1: Write failing tests**

`tests/ui/camera.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { centerOn, clampCamera, mapToScreen, screenToMap, zoomAt, MAX_TILE, MIN_TILE } from '../../src/ui/camera';

describe('camera', () => {
  const cam = { x: 2, y: 3, tile: 20 };

  it('converts screen points to map squares', () => {
    expect(screenToMap(cam, 40, 30, false, 0, 0)).toEqual({ x: 2, y: 3 });
    expect(screenToMap(cam, 40, 30, false, 39, 59)).toEqual({ x: 3, y: 5 });
    expect(mapToScreen(cam, 3, 5)).toEqual({ sx: 20, sy: 40 });
  });

  it('returns null off the map edges and wraps across the seam', () => {
    expect(screenToMap({ x: -1, y: 0, tile: 20 }, 40, 30, false, 5, 5)).toBeNull();
    expect(screenToMap({ x: 0, y: -1, tile: 20 }, 40, 30, true, 5, 5)).toBeNull();
    expect(screenToMap({ x: -1, y: 0, tile: 20 }, 40, 30, true, 5, 5)).toEqual({ x: 39, y: 0 });
    expect(screenToMap({ x: 39, y: 0, tile: 20 }, 40, 30, true, 25, 5)).toEqual({ x: 0, y: 0 });
  });

  it('zooms around the cursor and clamps tile size', () => {
    const z = zoomAt(cam, 2, 100, 100);
    expect(z.tile).toBe(40);
    expect(screenToMap(z, 40, 30, false, 100, 100)).toEqual(screenToMap(cam, 40, 30, false, 100, 100));
    expect(zoomAt(cam, 100, 0, 0).tile).toBe(MAX_TILE);
    expect(zoomAt(cam, 0.01, 0, 0).tile).toBe(MIN_TILE);
  });

  it('centers on a square and clamps to the map', () => {
    const c = centerOn(cam, 10, 10, 200, 100);
    expect(screenToMap(c, 40, 30, false, 100, 50)).toEqual({ x: 10, y: 10 });
    const clamped = clampCamera({ x: -100, y: 500, tile: 20 }, 40, 30, 200, 100, false);
    expect(clamped.x).toBeGreaterThanOrEqual(-5);
    expect(clamped.y).toBeLessThanOrEqual(30);
    expect(clampCamera({ x: 45, y: 0, tile: 20 }, 40, 30, 200, 100, true).x).toBe(5);
  });
});
```

`tests/ui/keys.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { keyToAction } from '../../src/ui/keys';

describe('keyToAction', () => {
  it('maps numpad codes and letter keys to directions', () => {
    expect(keyToAction('8', 'Numpad8')).toEqual({ kind: 'move', dir: 0 });
    expect(keyToAction('ArrowUp', 'Numpad8')).toEqual({ kind: 'move', dir: 0 });
    expect(keyToAction('3', 'Numpad3')).toEqual({ kind: 'move', dir: 3 });
    expect(keyToAction('q', 'KeyQ')).toEqual({ kind: 'move', dir: 7 });
    expect(keyToAction('C', 'KeyC')).toEqual({ kind: 'move', dir: 3 });
    expect(keyToAction('a', 'KeyA')).toEqual({ kind: 'move', dir: 6 });
  });

  it('maps commands and panning', () => {
    expect(keyToAction(' ', 'Space')).toEqual({ kind: 'next' });
    expect(keyToAction('n', 'KeyN')).toEqual({ kind: 'next' });
    expect(keyToAction('s', 'KeyS')).toEqual({ kind: 'skip' });
    expect(keyToAction('Enter', 'Enter')).toEqual({ kind: 'endTurn' });
    expect(keyToAction('f', 'KeyF')).toEqual({ kind: 'center' });
    expect(keyToAction('Escape', 'Escape')).toEqual({ kind: 'deselect' });
    expect(keyToAction('ArrowLeft', 'ArrowLeft')).toEqual({ kind: 'pan', dx: -3, dy: 0 });
    expect(keyToAction('y', 'KeyY')).toBeNull();
  });
});
```

`tests/ui/targets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { updateFog } from '../../src/engine/fog';
import { dirTo, stepTargets } from '../../src/ui/targets';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];

describe('stepTargets', () => {
  it('offers land squares to an army and marks enemies as attacks', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    addUnit(s, 'army', 1, 2, 0);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    const t = stepTargets(v, v.myUnits.find((u) => u.id === a.id)!);
    const at = (x: number, y: number) => t.find((p) => p.x === x && p.y === y);
    expect(at(0, 1)).toMatchObject({ attack: false });
    expect(at(2, 0)).toMatchObject({ attack: true });
    expect(at(2, 2)).toMatchObject({ attack: true });
    expect(at(0, 0)).toMatchObject({ attack: false });
  });

  it('offers nothing to a unit with no moves, and water only to ships', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 1, 1, { movesLeft: 0 });
    addUnit(s, 'destroyer', 0, 4, 1);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    expect(stepTargets(v, v.myUnits[0])).toEqual([]);
    const d = stepTargets(v, v.myUnits[1]);
    expect(d.every((p) => v.terrain[p.y * v.width + p.x] === 'water')).toBe(true);
  });

  it('finds the direction between adjacent squares, including across the seam', () => {
    const s = makeGame(M, { wrap: true });
    const v = getPlayerView(s, 0);
    expect(dirTo(v, { x: 1, y: 1 }, { x: 2, y: 1 })).toBe(2);
    expect(dirTo(v, { x: 0, y: 1 }, { x: 6, y: 1 })).toBe(6);
    expect(dirTo(v, { x: 0, y: 1 }, { x: 3, y: 1 })).toBeNull();
  });
});
```

`tests/ui/describe.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { describeEvent } from '../../src/ui/describe';

const names = ['Ann', 'Ben'];

describe('describeEvent', () => {
  it('describes key events from the viewer perspective', () => {
    expect(describeEvent({ type: 'cityCaptured', cityId: 3, by: 0, from: null }, 0, names)).toBe('You captured a city.');
    expect(describeEvent({ type: 'cityCaptured', cityId: 3, by: 1, from: 0 }, 0, names)).toBe('Ben captured one of your cities!');
    expect(describeEvent({ type: 'unitProduced', unitId: 1, cityId: 0, unitType: 'army' }, 0, names)).toBe('New Army ready.');
    expect(describeEvent({ type: 'gameOver', winner: null }, 0, names)).toBe('Game over: no survivors.');
    expect(describeEvent({ type: 'gameOver', winner: 1 }, 0, names)).toBe('Ben wins!');
    expect(describeEvent({ type: 'unitMoved', unitId: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, 0, names)).toBeNull();
    expect(
      describeEvent({ type: 'unitDestroyed', unitId: 4, owner: 0, unitType: 'fighter', reason: 'crashed' }, 0, names),
    ).toBe('Your Fighter ran out of fuel and crashed.');
  });

  it('describes combat', () => {
    const text = describeEvent(
      {
        type: 'combat', attackerId: 1, attackerOwner: 1, attackerType: 'destroyer',
        defender: { kind: 'unit', unitId: 2, owner: 0, unitType: 'transport' },
        x: 0, y: 0, attackerWon: true, attackerDamage: 1, defenderDamage: 3,
      },
      0,
      names,
    );
    expect(text).toBe("Ben's Destroyer attacked your Transport and won.");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/ui/camera.ts`:
```ts
import type { Pos } from '../engine';

export interface Camera {
  /** Map coordinates (squares, fractional) at the viewport's top-left. */
  x: number;
  y: number;
  /** Tile size in CSS pixels. */
  tile: number;
}

export const MIN_TILE = 12;
export const MAX_TILE = 48;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function screenToMap(cam: Camera, mapW: number, mapH: number, wrap: boolean, sx: number, sy: number): Pos | null {
  let x = Math.floor(cam.x + sx / cam.tile);
  const y = Math.floor(cam.y + sy / cam.tile);
  if (y < 0 || y >= mapH) return null;
  if (wrap) x = mod(x, mapW);
  else if (x < 0 || x >= mapW) return null;
  return { x, y };
}

export function mapToScreen(cam: Camera, x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - cam.x) * cam.tile, sy: (y - cam.y) * cam.tile };
}

export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): Camera {
  const tile = Math.min(MAX_TILE, Math.max(MIN_TILE, cam.tile * factor));
  const px = cam.x + sx / cam.tile;
  const py = cam.y + sy / cam.tile;
  return { tile, x: px - sx / tile, y: py - sy / tile };
}

export function pan(cam: Camera, dxPx: number, dyPx: number): Camera {
  return { ...cam, x: cam.x - dxPx / cam.tile, y: cam.y - dyPx / cam.tile };
}

export function centerOn(cam: Camera, x: number, y: number, viewW: number, viewH: number): Camera {
  return { ...cam, x: x + 0.5 - viewW / (2 * cam.tile), y: y + 0.5 - viewH / (2 * cam.tile) };
}

/** Keeps at least half a viewport of map in view; wraps x on wrapping maps. */
export function clampCamera(cam: Camera, mapW: number, mapH: number, viewW: number, viewH: number, wrap: boolean): Camera {
  const halfW = viewW / cam.tile / 2;
  const halfH = viewH / cam.tile / 2;
  const y = Math.min(mapH - halfH, Math.max(-halfH, cam.y));
  const x = wrap ? mod(cam.x, mapW) : Math.min(mapW - halfW, Math.max(-halfW, cam.x));
  return { ...cam, x, y };
}
```

`src/ui/keys.ts`:
```ts
import type { Dir } from '../engine';

export type KeyAction =
  | { kind: 'move'; dir: Dir }
  | { kind: 'next' }
  | { kind: 'skip' }
  | { kind: 'endTurn' }
  | { kind: 'center' }
  | { kind: 'deselect' }
  | { kind: 'pan'; dx: number; dy: number };

const NUMPAD: Record<string, Dir> = {
  Numpad8: 0, Numpad9: 1, Numpad6: 2, Numpad3: 3, Numpad2: 4, Numpad1: 5, Numpad4: 6, Numpad7: 7,
};
const LETTERS: Record<string, Dir> = { w: 0, e: 1, d: 2, c: 3, x: 4, z: 5, a: 6, q: 7 };
const PAN: Record<string, [number, number]> = {
  ArrowUp: [0, -3], ArrowDown: [0, 3], ArrowLeft: [-3, 0], ArrowRight: [3, 0],
};

export function keyToAction(key: string, code: string): KeyAction | null {
  if (code in NUMPAD) return { kind: 'move', dir: NUMPAD[code] };
  if (code in PAN) return { kind: 'pan', dx: PAN[code][0], dy: PAN[code][1] };
  const k = key.toLowerCase();
  if (k in LETTERS) return { kind: 'move', dir: LETTERS[k] };
  if (k === ' ' || k === 'n') return { kind: 'next' };
  if (k === 's') return { kind: 'skip' };
  if (k === 'enter') return { kind: 'endTurn' };
  if (k === 'f') return { kind: 'center' };
  if (k === 'escape') return { kind: 'deselect' };
  return null;
}
```

`src/ui/targets.ts`:
```ts
import { UNIT_STATS, cargoCapacity, step, type Dir, type MapLike, type PlayerView, type Pos, type Unit } from '../engine';

export interface StepTarget {
  x: number;
  y: number;
  dir: Dir;
  attack: boolean;
}

const mapOf = (v: PlayerView): MapLike => ({ width: v.width, height: v.height, wrap: v.wrap, terrain: [] });

export function dirTo(v: PlayerView, from: Pos, to: Pos): Dir | null {
  for (let d = 0; d < 8; d++) {
    const p = step(mapOf(v), from.x, from.y, d as Dir);
    if (p && p.x === to.x && p.y === to.y) return d as Dir;
  }
  return null;
}

/** Adjacent squares this unit could plausibly step to, judged only from what the player knows. */
export function stepTargets(v: PlayerView, u: Unit): StepTarget[] {
  if (u.movesLeft <= 0) return [];
  const domain = UNIT_STATS[u.type].domain;
  const out: StepTarget[] = [];
  for (let d = 0; d < 8; d++) {
    const p = step(mapOf(v), u.x, u.y, d as Dir);
    if (!p) continue;
    const terrain = v.terrain[p.y * v.width + p.x];
    if (terrain === null) {
      out.push({ ...p, dir: d as Dir, attack: false });
      continue;
    }
    const city = v.knownCities.find((c) => c.x === p.x && c.y === p.y);
    const ownCity = city !== undefined && city.owner === v.me;
    const enemyHere = v.enemies.some((e) => e.visibleNow && e.x === p.x && e.y === p.y);
    if (city && !ownCity) {
      if (domain === 'land') out.push({ ...p, dir: d as Dir, attack: true });
      continue;
    }
    if (enemyHere) {
      out.push({ ...p, dir: d as Dir, attack: true });
      continue;
    }
    const friends = v.myUnits.filter((o) => o.x === p.x && o.y === p.y && o.carriedBy === null && o.id !== u.id);
    const host = friends.find(
      (o) => UNIT_STATS[o.type].carries === u.type &&
        v.myUnits.filter((c) => c.carriedBy === o.id).length < cargoCapacity(o),
    );
    if (ownCity || host) {
      out.push({ ...p, dir: d as Dir, attack: false });
      continue;
    }
    const fits = domain === 'air' || (domain === 'land' ? terrain === 'land' : terrain === 'water');
    if (fits && (friends.length === 0 || domain === 'air')) out.push({ ...p, dir: d as Dir, attack: false });
  }
  return out;
}
```

`src/ui/describe.ts`:
```ts
import { UNIT_STATS, type DestroyReason, type GameEvent, type PlayerId } from '../engine';

const REASON: Record<DestroyReason, string | null> = {
  combat: 'was destroyed in combat',
  cargoLost: 'was lost with its carrier',
  crashed: 'ran out of fuel and crashed',
  cityCaptured: 'was lost when its city fell',
  garrison: null,
  disbanded: 'was disbanded',
  resigned: null,
};

export function describeEvent(e: GameEvent, me: PlayerId, names: string[]): string | null {
  const whose = (owner: PlayerId | null, capital: boolean) =>
    owner === me ? (capital ? 'Your' : 'your') : owner === null ? 'a neutral' : `${names[owner]}'s`;
  switch (e.type) {
    case 'unitMoved':
      return null;
    case 'combat': {
      const target =
        e.defender.kind === 'city'
          ? `${whose(e.defender.owner, false)} city`
          : `${whose(e.defender.owner, false)} ${UNIT_STATS[e.defender.unitType].name}`;
      return `${whose(e.attackerOwner, true)} ${UNIT_STATS[e.attackerType].name} attacked ${target} and ${e.attackerWon ? 'won' : 'lost'}.`;
    }
    case 'unitDestroyed': {
      const reason = REASON[e.reason];
      return reason === null ? null : `${whose(e.owner, true)} ${UNIT_STATS[e.unitType].name} ${reason}.`;
    }
    case 'cityCaptured':
      if (e.by === me) return 'You captured a city.';
      if (e.from === me) return `${names[e.by]} captured one of your cities!`;
      return `${names[e.by]} captured a city.`;
    case 'unitProduced':
      return `New ${UNIT_STATS[e.unitType].name} ready.`;
    case 'turnStarted':
      return `Turn ${e.turn}: ${names[e.player]}.`;
    case 'playerEliminated':
      return e.player === me ? 'You have been eliminated.' : `${names[e.player]} has been eliminated.`;
    case 'gameOver':
      return e.winner === null ? 'Game over: no survivors.' : `${names[e.winner]} wins!`;
  }
}
```

`src/ui/colors.ts`:
```ts
import type { UnitType } from '../engine';

/** Six distinct player colors that stay readable on both land and water. */
export const PLAYER_COLORS = ['#d7263d', '#1b98e0', '#f4a259', '#2e933c', '#8e44ad', '#e8c547'];

export const TERRAIN_COLORS = {
  water: '#24527a',
  land: '#5f8f4a',
  neutralCity: '#e6e6e6',
  unexplored: '#0e1116',
  fog: 'rgba(0, 0, 0, 0.42)',
  selection: '#ffffff',
  moveTarget: 'rgba(255, 255, 255, 0.35)',
  attackTarget: 'rgba(255, 80, 80, 0.55)',
} as const;

export const UNIT_GLYPH: Record<UnitType, string> = {
  army: 'A', fighter: 'F', transport: 'T', destroyer: 'D',
  submarine: 'S', cruiser: 'C', battleship: 'B', carrier: 'K',
};
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui`, then the full suite and `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): camera math, key mapping, step targets, event descriptions, palette"
```

---

### Task 9: Canvas renderer and minimap

**Files:**
- Create: `src/ui/render.ts`
- Test: `tests/ui/render.test.ts`

**Interfaces:**
- Consumes: `Camera`, `mapToScreen` (camera.ts), `StepTarget` (targets.ts), and `PLAYER_COLORS`, `TERRAIN_COLORS`, `UNIT_GLYPH` (colors.ts).
- Produces:
  - `interface DrawOptions { view: PlayerView; cam: Camera; width: number; height: number; selected: Pos | null; targets: StepTarget[]; colors: string[] }`. `colors` holds the per-seat colors.
  - `drawMap(ctx: CanvasRenderingContext2D, o: DrawOptions): void`
  - `drawMinimap(ctx: CanvasRenderingContext2D, view: PlayerView, colors: string[], w: number, h: number, cam: Camera, viewW: number, viewH: number): void`

- [ ] **Step 1: Write the failing test** — `tests/ui/render.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { drawMap, drawMinimap } from '../../src/ui/render';
import { PLAYER_COLORS } from '../../src/ui/colors';
import { addUnit, makeGame } from '../helpers';

/** Records fillRect and fillText calls; every other canvas method is a no-op. */
function fakeCtx() {
  const calls = { fillRect: 0, fillText: [] as string[] };
  const target = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: () => { calls.fillRect++; },
    fillText: (t: string) => { calls.fillText.push(t); },
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}),
    set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const M = ['*##...*', '###...#', '##*....'];

describe('render', () => {
  it('draws every on-screen square and own unit glyphs', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 1, 1);
    const view = getPlayerView(s, 0);
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, { view, cam: { x: 0, y: 0, tile: 20 }, width: 140, height: 60, selected: { x: 1, y: 1 }, targets: [], colors: PLAYER_COLORS });
    // background + 9 explored squares + the city's inner square
    expect(calls.fillRect).toBeGreaterThanOrEqual(11);
    expect(calls.fillText).toContain('A');
  });

  it('draws a minimap without throwing', () => {
    const s = makeGame(M);
    const { ctx, calls } = fakeCtx();
    drawMinimap(ctx, getPlayerView(s, 0), PLAYER_COLORS, 70, 30, { x: 0, y: 0, tile: 20 }, 140, 60);
    expect(calls.fillRect).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ui/render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/ui/render.ts`

```ts
import { UNIT_STATS, isCrippled, type PlayerView, type Pos } from '../engine';
import type { Camera } from './camera';
import type { StepTarget } from './targets';
import { TERRAIN_COLORS, UNIT_GLYPH } from './colors';

export interface DrawOptions {
  view: PlayerView;
  cam: Camera;
  width: number;
  height: number;
  selected: Pos | null;
  targets: StepTarget[];
  /** Color per seat, indexed by PlayerId. */
  colors: string[];
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function drawMap(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  const { view, cam, width, height, colors } = o;
  const t = cam.tile;
  const visible = new Set(view.visibleSquares);
  ctx.fillStyle = TERRAIN_COLORS.unexplored;
  ctx.fillRect(0, 0, width, height);

  const x0 = Math.floor(cam.x);
  const y0 = Math.max(0, Math.floor(cam.y));
  const cols = Math.ceil(width / t) + 1;
  const rows = Math.ceil(height / t) + 1;
  /** Calls fn for each on-screen square with its map coords and screen position. */
  const each = (fn: (mx: number, my: number, sx: number, sy: number) => void) => {
    for (let j = 0; j < rows; j++) {
      const my = y0 + j;
      if (my >= view.height) break;
      for (let i = 0; i < cols; i++) {
        const rawX = x0 + i;
        if (!view.wrap && (rawX < 0 || rawX >= view.width)) continue;
        fn(mod(rawX, view.width), my, (rawX - cam.x) * t, (my - cam.y) * t);
      }
    }
  };

  // Terrain, cities and fog.
  each((mx, my, sx, sy) => {
    const i = my * view.width + mx;
    const terrain = view.terrain[i];
    if (terrain === null) return;
    ctx.fillStyle = terrain === 'water' ? TERRAIN_COLORS.water : TERRAIN_COLORS.land;
    ctx.fillRect(sx, sy, t, t);
    if (terrain === 'city') {
      const city = view.knownCities.find((c) => c.x === mx && c.y === my);
      ctx.fillStyle = city && city.owner !== null ? colors[city.owner] : TERRAIN_COLORS.neutralCity;
      ctx.fillRect(sx + t * 0.15, sy + t * 0.15, t * 0.7, t * 0.7);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + t * 0.15, sy + t * 0.15, t * 0.7, t * 0.7);
    }
    if (!visible.has(i)) {
      ctx.fillStyle = TERRAIN_COLORS.fog;
      ctx.fillRect(sx, sy, t, t);
    }
  });

  // Move/attack targets.
  for (const target of o.targets) {
    each((mx, my, sx, sy) => {
      if (mx !== target.x || my !== target.y) return;
      ctx.fillStyle = target.attack ? TERRAIN_COLORS.attackTarget : TERRAIN_COLORS.moveTarget;
      ctx.fillRect(sx + t * 0.3, sy + t * 0.3, t * 0.4, t * 0.4);
    });
  }

  const glyph = (sx: number, sy: number, color: string, text: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx + t / 2, sy + t / 2, t * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(t * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx + t / 2, sy + t / 2 + 1);
    ctx.globalAlpha = 1;
  };

  // Enemy markers (fade with age).
  for (const e of view.enemies) {
    const age = view.turn - e.turnSeen;
    const alpha = e.visibleNow ? 1 : age < 1 ? 0.7 : 0.4;
    each((mx, my, sx, sy) => {
      if (mx === e.x && my === e.y) glyph(sx, sy, colors[e.owner], UNIT_GLYPH[e.type], alpha);
    });
  }

  // Own top-level units outside cities (units in cities are listed in the side panel).
  const cityAt = (x: number, y: number) => view.knownCities.some((c) => c.x === x && c.y === y);
  for (const u of view.myUnits) {
    if (u.carriedBy !== null || cityAt(u.x, u.y)) continue;
    each((mx, my, sx, sy) => {
      if (mx !== u.x || my !== u.y) return;
      glyph(sx, sy, colors[view.me], UNIT_GLYPH[u.type], u.movesLeft > 0 ? 1 : 0.6);
      const hasCargo = view.myUnits.some((c) => c.carriedBy === u.id);
      if (hasCargo) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx + t * 0.7, sy + t * 0.1, t * 0.18, t * 0.18);
      }
      if (isCrippled(u)) {
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(sx + t * 0.1, sy + t * 0.1, t * 0.18, t * 0.18);
      }
      const range = UNIT_STATS[u.type].range;
      if (range !== null && u.fuel !== null && u.fuel <= Math.ceil(range / 4)) {
        ctx.fillStyle = '#ffb000';
        ctx.fillRect(sx + t * 0.1, sy + t * 0.72, t * 0.18, t * 0.18);
      }
    });
  }

  // Selection.
  if (o.selected) {
    const sel = o.selected;
    each((mx, my, sx, sy) => {
      if (mx !== sel.x || my !== sel.y) return;
      ctx.strokeStyle = TERRAIN_COLORS.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, t - 2, t - 2);
    });
  }
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D, view: PlayerView, colors: string[],
  w: number, h: number, cam: Camera, viewW: number, viewH: number,
): void {
  const sx = w / view.width;
  const sy = h / view.height;
  ctx.fillStyle = TERRAIN_COLORS.unexplored;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const terrain = view.terrain[y * view.width + x];
      if (terrain === null) continue;
      ctx.fillStyle = terrain === 'water' ? TERRAIN_COLORS.water : TERRAIN_COLORS.land;
      ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
    }
  }
  for (const c of view.knownCities) {
    ctx.fillStyle = c.owner === null ? TERRAIN_COLORS.neutralCity : colors[c.owner];
    ctx.fillRect(c.x * sx - 1, c.y * sy - 1, Math.max(2, sx) + 1, Math.max(2, sy) + 1);
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cam.x * sx, cam.y * sy, (viewW / cam.tile) * sx, (viewH / cam.tile) * sy);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/ui/render.test.ts`, then the full suite and `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): canvas map renderer with fog, markers, targets, and minimap"
```

---

### Task 10: Preact screens and wiring

**Files:**
- Create:
  - `src/ui/App.tsx`, `src/ui/TitleScreen.tsx`, `src/ui/GameScreen.tsx`, `src/ui/MapCanvas.tsx`, `src/ui/SidePanel.tsx`, `src/ui/styles.css`
  - `src/ui/exportFile.ts`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes:
  - `GameSession` and `SessionCommand` (Task 7)
  - `IndexedDbSaveStore`, `parseSave`, `serializeSave`, `SeatConfig` (Task 6)
  - `DEFAULT_WORLD`, `SIZE_PRESETS`, `WorldOptions` (Tasks 4–5)
  - camera, keys, targets, describe, colors and render (Tasks 8–9)
  - engine exports `validateMapSize`, `buildTime`, `UNIT_TYPES`, `UNIT_STATS`, `isCoastal`, `chebyshev`
- Produces: the playable app. No new library interfaces.

This task is UI wiring, so it has no automated tests of its own. The pure logic was tested in Tasks 7–9. Verify with `npm run typecheck`, `npm run build` and the manual browser check in Task 11.

- [ ] **Step 1: Create the files**

`src/ui/exportFile.ts`:
```ts
import { serializeSave, type SaveFile } from '../storage';

export function downloadSave(save: SaveFile): void {
  const blob = new Blob([serializeSave(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${save.name.replace(/[^\w-]+/g, '_') || 'conquest-save'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function pickFileText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}
```

`src/main.tsx`:
```tsx
import { render } from 'preact';
import { App } from './ui/App';
import './ui/styles.css';

render(<App />, document.getElementById('app')!);
```

`src/ui/App.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { GameSession } from '../app/session';
import { IndexedDbSaveStore } from '../storage';
import { TitleScreen } from './TitleScreen';
import { GameScreen } from './GameScreen';

const store = new IndexedDbSaveStore();

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  return session ? (
    <GameScreen session={session} store={store} onQuit={() => setSession(null)} />
  ) : (
    <TitleScreen store={store} onStart={setSession} />
  );
}
```

`src/ui/TitleScreen.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { GameSession } from '../app/session';
import { validateMapSize } from '../engine';
import { DEFAULT_WORLD, SIZE_PRESETS, type CityDensity, type Landmass, type SizePreset, type WorldOptions } from '../mapgen';
import { parseSave, type SaveStore, type SaveSummary, type SeatConfig } from '../storage';
import { PLAYER_COLORS } from './colors';
import { pickFileText } from './exportFile';

interface Props {
  store: SaveStore;
  onStart: (s: GameSession) => void;
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);
const defaultSeats = (n: number, prev: SeatConfig[]): SeatConfig[] =>
  Array.from({ length: n }, (_, i) =>
    prev[i] ?? { name: i === 0 ? 'Player 1' : `Player ${i + 1}`, kind: i === 0 ? 'human' : 'idle', color: PLAYER_COLORS[i] },
  );

export function TitleScreen({ store, onStart }: Props) {
  const [world, setWorld] = useState<WorldOptions>({ ...DEFAULT_WORLD });
  const [seats, setSeats] = useState<SeatConfig[]>(defaultSeats(2, []));
  const [seed, setSeed] = useState(randomSeed());
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    store.list().then(setSaves).catch(() => setSaves([]));
  }, [store]);

  const setPlayers = (n: number) => {
    setWorld({ ...world, players: n });
    setSeats(defaultSeats(n, seats));
  };
  const updateSeat = (i: number, patch: Partial<SeatConfig>) =>
    setSeats(seats.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const start = () => {
    const sizeError = validateMapSize(world.width, world.height);
    if (sizeError) return setError(sizeError);
    try {
      onStart(GameSession.create({ world, seed, seats }, store));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const load = async (name: string) => {
    const save = await store.get(name);
    if (save) onStart(GameSession.fromSave(save, store));
  };
  const importFile = async () => {
    const text = await pickFileText();
    if (text === null) return;
    const r = parseSave(text);
    if (!r.ok) return setError(r.error);
    onStart(GameSession.fromSave(r.save, store));
  };

  const autosave = saves.find((s) => s.name === 'autosave');
  const named = saves.filter((s) => s.name !== 'autosave');

  return (
    <main class="title">
      <h1>Conquest Web</h1>
      {autosave && (
        <button class="primary" onClick={() => load('autosave')}>Continue (turn {autosave.turn})</button>
      )}
      <section>
        <h2>New game</h2>
        <label>Map size{' '}
          <select onChange={(e) => {
            const preset = (e.target as HTMLSelectElement).value as SizePreset;
            setWorld({ ...world, ...SIZE_PRESETS[preset] });
          }} value={(Object.keys(SIZE_PRESETS) as SizePreset[]).find((k) => SIZE_PRESETS[k].width === world.width && SIZE_PRESETS[k].height === world.height) ?? 'medium'}>
            <option value="small">Small (40×30)</option>
            <option value="medium">Medium (60×45)</option>
            <option value="large">Large (100×70)</option>
            <option value="huge">Huge (150×100)</option>
          </select>
        </label>
        <label>Water {world.waterPercent}%{' '}
          <input type="range" min={60} max={85} value={world.waterPercent}
            onInput={(e) => setWorld({ ...world, waterPercent: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label>Landmass{' '}
          <select value={world.landmass} onChange={(e) => setWorld({ ...world, landmass: (e.target as HTMLSelectElement).value as Landmass })}>
            <option value="islands">Many islands</option>
            <option value="mixed">Mixed</option>
            <option value="continents">Few continents</option>
          </select>
        </label>
        <label>Cities{' '}
          <select value={world.cityDensity} onChange={(e) => setWorld({ ...world, cityDensity: (e.target as HTMLSelectElement).value as CityDensity })}>
            <option value="low">Few</option>
            <option value="normal">Normal</option>
            <option value="high">Many</option>
          </select>
        </label>
        <label><input type="checkbox" checked={world.wrap}
          onChange={(e) => setWorld({ ...world, wrap: (e.target as HTMLInputElement).checked })} /> Wrap east–west</label>
        <label>Players{' '}
          <select value={world.players} onChange={(e) => setPlayers(Number((e.target as HTMLSelectElement).value))}>
            {[2, 3, 4, 5, 6].map((n) => <option value={n}>{n}</option>)}
          </select>
        </label>
        <table class="seats">
          {seats.map((s, i) => (
            <tr>
              <td><span class="swatch" style={{ background: s.color }} /></td>
              <td><input value={s.name} onInput={(e) => updateSeat(i, { name: (e.target as HTMLInputElement).value })} /></td>
              <td>
                <select value={s.kind} onChange={(e) => updateSeat(i, { kind: (e.target as HTMLSelectElement).value as SeatConfig['kind'] })}>
                  <option value="human">Human</option>
                  <option value="idle">Idle</option>
                </select>
              </td>
            </tr>
          ))}
        </table>
        <label>Seed{' '}
          <input type="number" value={seed} onInput={(e) => setSeed(Number((e.target as HTMLInputElement).value) | 0)} />
        </label>
        <button class="primary" onClick={start}>Start</button>
      </section>
      <section>
        <h2>Saved games</h2>
        {named.length === 0 && <p>No saved games yet.</p>}
        <ul>
          {named.map((s) => (
            <li><button onClick={() => load(s.name)}>{s.name}</button> turn {s.turn} · {new Date(s.savedAt).toLocaleString()}</li>
          ))}
        </ul>
        <button onClick={importFile}>Import save file…</button>
      </section>
      {error && <p class="error" role="alert">{error}</p>}
    </main>
  );
}
```

`src/ui/MapCanvas.tsx`:
```tsx
import { useEffect, useRef } from 'preact/hooks';
import type { PlayerView, Pos } from '../engine';
import { clampCamera, pan, screenToMap, zoomAt, type Camera } from './camera';
import { drawMap } from './render';
import type { StepTarget } from './targets';

interface Props {
  view: PlayerView;
  cam: Camera;
  setCam: (c: Camera) => void;
  selected: Pos | null;
  targets: StepTarget[];
  colors: string[];
  onSquare: (p: Pos) => void;
  onDeselect: () => void;
}

export function MapCanvas(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const pinchDist = useRef(0);
  const camRef = useRef(p.cam);
  camRef.current = p.cam;

  const size = () => {
    const c = ref.current!;
    return { w: c.clientWidth, h: c.clientHeight };
  };
  const setCam = (c: Camera) => {
    const { w, h } = size();
    p.setCam(clampCamera(c, p.view.width, p.view.height, w, h, p.view.wrap));
  };

  useEffect(() => {
    const c = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = size();
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawMap(ctx, { view: p.view, cam: p.cam, width: w, height: h, selected: p.selected, targets: p.targets, colors: p.colors });
  });

  useEffect(() => {
    const redraw = () => p.setCam({ ...camRef.current });
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, []);

  const local = (e: PointerEvent | WheelEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={ref}
      class="map"
      onContextMenu={(e) => { e.preventDefault(); p.onDeselect(); }}
      onWheel={(e) => {
        e.preventDefault();
        const pt = local(e);
        setCam(zoomAt(p.cam, Math.pow(1.1, -e.deltaY / 100), pt.x, pt.y));
      }}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, local(e));
        dragged.current = false;
        if (pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()];
          pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
        }
      }}
      onPointerMove={(e) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        const pt = local(e);
        if (pointers.current.size === 2) {
          pointers.current.set(e.pointerId, pt);
          const [a, b] = [...pointers.current.values()];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchDist.current > 0) setCam(zoomAt(camRef.current, dist / pinchDist.current, (a.x + b.x) / 2, (a.y + b.y) / 2));
          pinchDist.current = dist;
          dragged.current = true;
          return;
        }
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        if (dragged.current || Math.hypot(dx, dy) > 4) {
          dragged.current = true;
          pointers.current.set(e.pointerId, pt);
          setCam(pan(camRef.current, dx, dy));
        }
      }}
      onPointerUp={(e) => {
        const wasDrag = dragged.current;
        const pt = local(e);
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0 && !wasDrag && e.button === 0) {
          const sq = screenToMap(p.cam, p.view.width, p.view.height, p.view.wrap, pt.x, pt.y);
          if (sq) p.onSquare(sq);
        }
      }}
    />
  );
}
```

`src/ui/SidePanel.tsx`:
```tsx
import { UNIT_STATS, UNIT_TYPES, buildTime, isCoastal, type City, type PlayerView, type Unit, type UnitType } from '../engine';

export type Selection = { kind: 'unit'; id: number } | { kind: 'city'; id: number } | null;

interface Props {
  view: PlayerView;
  selection: Selection;
  onSelectUnit: (id: number) => void;
  onProduction: (cityId: number, type: UnitType | null) => void;
  onDisband: (id: number) => void;
}

function UnitDetails({ u, view }: { u: Unit; view: PlayerView }) {
  const st = UNIT_STATS[u.type];
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id);
  return (
    <div>
      <h3>{st.name} #{u.id}</h3>
      <p>Moves {u.movesLeft}/{st.move} · Hits {st.hits - u.damage}/{st.hits}</p>
      {u.fuel !== null && <p>Fuel {u.fuel}/{st.range}</p>}
      {cargo.length > 0 && <p>Carrying: {cargo.map((c) => UNIT_STATS[c.type].name).join(', ')}</p>}
    </div>
  );
}

function CityDetails({ city, view, onProduction, onSelectUnit }: {
  city: City; view: PlayerView; onProduction: Props['onProduction']; onSelectUnit: Props['onSelectUnit'];
}) {
  const coastal = isCoastal(
    { width: view.width, height: view.height, wrap: view.wrap, terrain: view.terrain.map((t) => t ?? 'land') },
    city.x, city.y,
  );
  const here = view.myUnits.filter((u) => u.x === city.x && u.y === city.y && u.carriedBy === null);
  return (
    <div>
      <h3>City #{city.id}</h3>
      <label>Building{' '}
        <select value={city.production ?? ''} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          onProduction(city.id, v === '' ? null : (v as UnitType));
        }}>
          <option value="">Nothing</option>
          {UNIT_TYPES.map((t) => (
            <option value={t} disabled={UNIT_STATS[t].domain === 'sea' && !coastal}>
              {UNIT_STATS[t].name} ({buildTime(city, t)} turns)
            </option>
          ))}
        </select>
      </label>
      {city.production && <p>Progress {city.progress}/{buildTime(city, city.production)}</p>}
      {here.length > 0 && (
        <div>
          <h4>Units here</h4>
          {here.map((u) => (
            <button onClick={() => onSelectUnit(u.id)}>{UNIT_STATS[u.type].name} ({u.movesLeft} moves)</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SidePanel({ view, selection, onSelectUnit, onProduction, onDisband }: Props) {
  if (!selection) return <aside class="panel"><p>Select a unit or city.</p></aside>;
  if (selection.kind === 'unit') {
    const u = view.myUnits.find((x) => x.id === selection.id);
    if (!u) return <aside class="panel"><p>That unit is gone.</p></aside>;
    return (
      <aside class="panel">
        <UnitDetails u={u} view={view} />
        <button onClick={() => onDisband(u.id)}>Disband</button>
      </aside>
    );
  }
  const own = view.myCities.find((c) => c.id === selection.id);
  if (own) {
    return (
      <aside class="panel">
        <CityDetails city={own} view={view} onProduction={onProduction} onSelectUnit={onSelectUnit} />
      </aside>
    );
  }
  const known = view.knownCities.find((c) => c.id === selection.id);
  const owner = known?.owner;
  return (
    <aside class="panel">
      <h3>City #{selection.id}</h3>
      <p>{owner === null || owner === undefined ? 'Neutral (last known)' : `${view.players[owner].name} (last known)`}</p>
    </aside>
  );
}
```

`src/ui/GameScreen.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { GameSession, SessionCommand } from '../app/session';
import type { Pos } from '../engine';
import type { SaveStore } from '../storage';
import { centerOn, clampCamera, pan, type Camera } from './camera';
import { describeEvent } from './describe';
import { downloadSave } from './exportFile';
import { keyToAction } from './keys';
import { MapCanvas } from './MapCanvas';
import { drawMinimap } from './render';
import { SidePanel, type Selection } from './SidePanel';
import { dirTo, stepTargets } from './targets';

interface Props {
  session: GameSession;
  store: SaveStore;
  onQuit: () => void;
}

export function GameScreen({ session, onQuit }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => session.subscribe(() => setTick((t) => t + 1)), [session]);

  const [revealed, setRevealed] = useState(false);
  const view = revealed ? session.revealedView() : session.view();
  const colors = session.seats.map((s) => s.color);
  const names = view.players.map((p) => p.name);
  const [cam, setCamRaw] = useState<Camera>({ x: 0, y: 0, tile: 28 });
  const [selection, setSelection] = useState<Selection>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const viewport = () => {
    const el = document.querySelector('canvas.map') as HTMLCanvasElement | null;
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
  };
  const setCam = (c: Camera) => {
    const { w, h } = viewport();
    setCamRaw(clampCamera(c, view.width, view.height, w, h, view.wrap));
  };
  const focus = (p: Pos) => {
    const { w, h } = viewport();
    setCam(centerOn(cam, p.x, p.y, w, h));
  };

  const selectedUnit = selection?.kind === 'unit' ? view.myUnits.find((u) => u.id === selection.id) ?? null : null;
  const selectedPos: Pos | null =
    selectedUnit ?? (selection?.kind === 'city' ? view.knownCities.find((c) => c.id === selection.id) ?? null : null);
  const targets = useMemo(
    () => (selectedUnit && session.phase === 'playing' ? stepTargets(view, selectedUnit) : []),
    [selectedUnit, view, session.phase],
  );

  const ready = () =>
    view.myUnits.filter((u) => u.movesLeft > 0 && !skipped.has(u.id)).sort((a, b) => a.id - b.id);
  const selectNext = () => {
    const list = ready();
    if (list.length === 0) {
      setSelection(null);
      setMessage('All units have moved. Press Enter to end your turn.');
      return;
    }
    const after = list.find((u) => selectedUnit === null || u.id > selectedUnit.id) ?? list[0];
    setSelection({ kind: 'unit', id: after.id });
    focus(after);
  };

  // New turn for the viewing player: reset skips and pick the first unit.
  const turnKey = `${view.turn}:${view.currentPlayer}:${session.phase}`;
  useEffect(() => {
    if (session.phase !== 'playing') return;
    setSkipped(new Set());
    const first = view.myUnits.filter((u) => u.movesLeft > 0).sort((a, b) => a.id - b.id)[0];
    if (first) {
      setSelection({ kind: 'unit', id: first.id });
      focus(first);
    } else if (view.myCities[0]) {
      focus(view.myCities[0]);
    }
  }, [turnKey]);

  const act = (cmd: SessionCommand): boolean => {
    const err = session.act(cmd);
    if (err) {
      setMessage(err);
      const stuck = /(\d+) cannot end its turn/.exec(err);
      if (stuck) setSelection({ kind: 'unit', id: Number(stuck[1]) });
      return false;
    }
    setMessage(null);
    const captured = session.lastEvents.find((e) => e.type === 'cityCaptured' && e.by === view.me);
    if (captured && captured.type === 'cityCaptured') setSelection({ kind: 'city', id: captured.cityId });
    return true;
  };

  const moveSelected = (dir: number) => {
    if (!selectedUnit) return;
    if (act({ type: 'move', unitId: selectedUnit.id, dir: dir as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 })) {
      const still = session.view().myUnits.find((u) => u.id === selectedUnit.id);
      if (still) focus(still);
    }
  };

  const onSquare = (p: Pos) => {
    if (session.phase !== 'playing') return;
    if (selectedUnit) {
      const dir = dirTo(view, selectedUnit, p);
      if (dir !== null) return moveSelected(dir);
    }
    const city = view.knownCities.find((c) => c.x === p.x && c.y === p.y);
    if (city) return setSelection({ kind: 'city', id: city.id });
    const unit = view.myUnits.find((u) => u.x === p.x && u.y === p.y && u.carriedBy === null);
    if (unit) return setSelection({ kind: 'unit', id: unit.id });
    setSelection(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      const a = keyToAction(e.key, e.code);
      if (!a) return;
      e.preventDefault();
      if (a.kind === 'pan') return setCam(pan(cam, -a.dx * cam.tile, -a.dy * cam.tile));
      if (session.phase !== 'playing') return;
      if (a.kind === 'move') moveSelected(a.dir);
      else if (a.kind === 'next') selectNext();
      else if (a.kind === 'skip' && selectedUnit) {
        setSkipped(new Set(skipped).add(selectedUnit.id));
        selectNext();
      } else if (a.kind === 'endTurn') act({ type: 'endTurn' });
      else if (a.kind === 'center' && selectedPos) focus(selectedPos);
      else if (a.kind === 'deselect') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Minimap.
  useEffect(() => {
    const c = document.querySelector('canvas.minimap') as HTMLCanvasElement | null;
    if (!c) return;
    const { w, h } = viewport();
    drawMinimap(c.getContext('2d')!, view, colors, c.width, c.height, cam, w, h);
  });

  const log = session.log(view.me)
    .map((entry) => describeEvent(entry.event, view.me, names))
    .filter((t): t is string => t !== null)
    .slice(-40)
    .reverse();
  const current = view.players[view.currentPlayer];

  return (
    <div class="game">
      <header class="topbar">
        <span>Turn {view.turn}</span>
        <span><span class="swatch" style={{ background: colors[view.currentPlayer] }} /> {current.name}</span>
        <button class="primary" onClick={() => act({ type: 'endTurn' })} disabled={session.phase !== 'playing'}>End Turn</button>
        <button onClick={() => {
          const name = window.prompt('Save name?', session.name === 'autosave' ? 'My game' : session.name);
          if (name) session.saveAs(name).then(() => setMessage(`Saved as "${name}".`));
        }}>Save</button>
        <button onClick={() => downloadSave(session.toSave())}>Export</button>
        <button onClick={onQuit}>Quit</button>
        {message && <span class="message" role="status">{message}</span>}
      </header>
      <MapCanvas
        view={view} cam={cam} setCam={setCamRaw} selected={selectedPos} targets={targets} colors={colors}
        onSquare={onSquare} onDeselect={() => setSelection(null)}
      />
      <div class="side">
        <canvas class="minimap" width={200} height={140} onClick={(e) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * view.width);
          const y = Math.floor(((e.clientY - r.top) / r.height) * view.height);
          focus({ x, y });
        }} />
        <SidePanel
          view={view}
          selection={selection}
          onSelectUnit={(id) => setSelection({ kind: 'unit', id })}
          onProduction={(cityId, unitType) => act({ type: 'setProduction', cityId, unitType })}
          onDisband={(id) => { if (window.confirm('Disband this unit?')) act({ type: 'disband', unitId: id }); }}
        />
        <ol class="log">{log.map((line) => <li>{line}</li>)}</ol>
      </div>
      {session.phase === 'handoff' && (
        <div class="overlay handoff">
          <div class="card">
            <h2>Pass to {session.seats[session.state.currentPlayer].name}</h2>
            <button class="primary" onClick={() => session.confirmHandoff()}>I'm ready</button>
          </div>
        </div>
      )}
      {session.phase === 'over' && !revealed && (
        <div class="overlay">
          <div class="card">
            <h2>{view.winner === null ? 'Game over: no survivors' : `${names[view.winner]} wins!`}</h2>
            <button class="primary" onClick={onQuit}>New game</button>
            <button onClick={() => setRevealed(true)}>View map</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

`src/ui/styles.css`:
```css
:root {
  --bg: #12161c;
  --panel: #1b2129;
  --text: #e8ecf1;
  --muted: #9aa5b1;
  --accent: #3d8bfd;
  --error: #ff6b6b;
  color-scheme: dark;
  font-family: system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body, #app { margin: 0; height: 100%; background: var(--bg); color: var(--text); }
button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid #333c48; background: #222a34; color: var(--text); cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button:disabled { opacity: 0.5; cursor: default; }
input, select { font: inherit; background: #0f1318; color: var(--text); border: 1px solid #333c48; border-radius: 4px; padding: 4px 6px; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; vertical-align: middle; }
.error { color: var(--error); }

.title { max-width: 640px; margin: 0 auto; padding: 24px 16px; display: flex; flex-direction: column; gap: 16px; }
.title section { background: var(--panel); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.title h2 { margin: 0; font-size: 1.1rem; }
.seats td { padding: 2px 6px 2px 0; }

.game { display: grid; grid-template-columns: 1fr 260px; grid-template-rows: auto 1fr; height: 100%; }
.topbar { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 8px 12px; background: var(--panel); }
.topbar .message { color: var(--muted); }
canvas.map { width: 100%; height: 100%; display: block; touch-action: none; cursor: pointer; }
.side { display: flex; flex-direction: column; gap: 8px; padding: 8px; background: var(--panel); overflow: hidden; }
canvas.minimap { width: 100%; aspect-ratio: 200 / 140; border-radius: 6px; cursor: pointer; }
.panel h3 { margin: 4px 0; }
.panel button { margin: 2px 4px 2px 0; }
.log { flex: 1; overflow-y: auto; margin: 0; padding-left: 18px; font-size: 0.85rem; color: var(--muted); }
.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.85); display: grid; place-items: center; z-index: 10; }
/* Hotseat hand-off must hide the next player's map completely. */
.overlay.handoff { background: var(--bg); }
.card { background: var(--panel); padding: 24px; border-radius: 12px; display: flex; flex-direction: column; gap: 12px; min-width: 260px; text-align: center; }

@media (max-width: 760px) {
  .game { grid-template-columns: 1fr; grid-template-rows: auto 1fr auto; }
  .side { max-height: 40vh; }
}
```

- [ ] **Step 2: Verify**

Run: `npm run typecheck` → Expected: exit 0.
Run: `npx vitest run` → Expected: all pass.
Run: `npm run build` → Expected: success.
Run: `rg -n "session\.state|\.state\." src/ui` → Expected: only `session.state.currentPlayer` in the hand-off overlay (the next seat's name). The UI reads only views. If any other match exists, change it to use `view` or a session method.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(ui): title screen, game screen, map canvas, side panel, hotseat and game-over overlays"
```

---

### Task 11: GitHub Pages publishing and launch config

**Files:**
- Create: `.github/workflows/pages.yml`, `.claude/launch.json`

**Interfaces:**
- Produces: on every push to `main`, the workflow runs the tests, builds, and deploys `dist/` to Pages. `.claude/launch.json` defines a `dev` preview server for the browser check.

- [ ] **Step 1: Create the workflow** — `.github/workflows/pages.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Create `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "--", "--port", "5173", "--strictPort"],
      "port": 5173
    }
  ]
}
```

- [ ] **Step 3: Verify the build output works under the Pages base path**

Run: `npm run build`, then `npx vite preview --port 4173 --strictPort` in the background.
Expected: `http://localhost:4173/conquest-web/` serves the title screen. Check with an HTTP request that the response contains `<div id="app">`. Then stop the preview server.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml .claude/launch.json
git commit -m "ci: build and deploy to GitHub Pages; add dev launch config"
```

**Controller follow-up (not the implementer's):**
1. Run the manual browser check with the `dev` launch config:
   - New game (Small map, 1 Human + 1 Idle).
   - Move a unit with a click and with keys.
   - Capture a neutral city and set its production.
   - End turns until a unit is produced.
   - Save, quit, Continue.
   - Export, then import that file.
   - Start a 2-human game and confirm the hand-off overlay.
2. After merging to `main`, walk the user through Settings → Pages → Source: "GitHub Actions".

---

## Definition of Done (Milestone 2a)

- `npx vitest run` passes, and `npm run typecheck` is clean for both configs.
- `npm run build` succeeds, and the preview serves at `/conquest-web/`.
- `rg -n "window|document|Math\.random|Date" src/engine src/mapgen` returns nothing.
- The manual browser check list above passes.
- After merge, the Pages workflow deploys and `https://quasitron.github.io/conquest-web/` loads the title screen.
