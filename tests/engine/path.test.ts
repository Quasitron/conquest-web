import { describe, it, expect } from 'vitest';
import {
  arrivalTurn, dirBetween, findFrontier, findPath, getPlayerView, pathMapFromState, pathMapFromView,
} from '../../src/engine';
import type { GameState } from '../../src/engine';
import { parseAscii } from '../../src/engine';
import { addUnit, makeGame } from '../helpers';

/** A blank game on the given map: no cities, units or knowledge. */
function game(rows: string[], wrap = false): GameState {
  const s = makeGame(['*.*'], { wrap });
  const map = parseAscii(rows);
  s.width = map.width; s.height = map.height; s.terrain = map.terrain;
  s.cities = map.cities.map((c, id) => ({ id, name: 'C' + id, x: c.x, y: c.y, owner: null, production: null, progress: 0, lastBuilt: null }));
  s.units = [];
  s.fog = s.fog.map(() => ({ explored: map.terrain.map(() => 0), lastSeen: {}, knownCityOwner: {} }));
  return s;
}

function exploreAll(s: GameState, pid = 0) {
  s.fog[pid].explored = s.fog[pid].explored.map(() => 1);
}
const pm = (s: GameState, pid = 0) => pathMapFromState(s, pid);

describe('findPath', () => {
  it('finds a shortest land path', () => {
    const s = game(['*######', '#######', '######*']);
    exploreAll(s);
    const p = findPath(pm(s), { type: 'army', x: 0, y: 0 }, { x: 5, y: 2 })!;
    expect(p).toHaveLength(5);
    expect(p[p.length - 1]).toEqual({ x: 5, y: 2 });
    expect(findPath(pm(s), { type: 'army', x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('uses the wrap seam when shorter', () => {
    const s = game(['*#####*', '#######'], true);
    exploreAll(s);
    const p = findPath(pm(s), { type: 'army', x: 0, y: 1 }, { x: 6, y: 1 })!;
    expect(p).toEqual([{ x: 6, y: 1 }]);
  });

  it('armies never path over water; ships pass friendly cities but not neutral ones', () => {
    const s = game(['*#.....', '.......', '.....#*', '.......']);
    exploreAll(s);
    expect(findPath(pm(s), { type: 'army', x: 1, y: 0 }, { x: 3, y: 0 })).toBeNull();
    expect(findPath(pm(s), { type: 'transport', x: 3, y: 0 }, { x: 0, y: 2 })).toHaveLength(3);
    const t = game(['..*..', '.....']);
    exploreAll(t);
    t.cities[0].owner = 0;
    const own = findPath(pm(t), { type: 'destroyer', x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(own).toContainEqual({ x: 2, y: 0 });
    t.cities[0].owner = null;
    t.fog[0].knownCityOwner[t.cities[0].id] = null;
    const neutral = findPath(pm(t), { type: 'destroyer', x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(neutral).toHaveLength(4);
    expect(neutral).not.toContainEqual({ x: 2, y: 0 });
  });

  it('unexplored squares block, and an unexplored target returns null', () => {
    const s = game(['######', '######', '######']);
    exploreAll(s);
    const idx = (x: number, y: number) => y * 6 + x;
    for (const y of [0, 1, 2]) s.fog[0].explored[idx(2, y)] = 0;
    expect(findPath(pm(s), { type: 'army', x: 0, y: 1 }, { x: 4, y: 1 })).toBeNull();
    s.fog[0].explored[idx(2, 1)] = 1;
    expect(findPath(pm(s), { type: 'army', x: 0, y: 1 }, { x: 4, y: 1 })).not.toBeNull();
    expect(findPath(pm(s), { type: 'army', x: 0, y: 1 }, { x: 2, y: 0 })).toBeNull();
  });

  it('an enemy seen this turn blocks; one seen last turn does not', () => {
    const s = game(['#####', '#####', '#####']);
    exploreAll(s);
    const wall = [0, 1, 2].map((y) => y);
    s.turn = 5;
    for (const y of wall) {
      s.fog[0].lastSeen[100 + y] = { unitId: 100 + y, type: 'army', owner: 1, x: 2, y, turnSeen: 5 };
    }
    expect(findPath(pm(s), { type: 'army', x: 0, y: 1 }, { x: 4, y: 1 })).toBeNull();
    for (const y of wall) s.fog[0].lastSeen[100 + y].turnSeen = 4;
    expect(findPath(pm(s), { type: 'army', x: 0, y: 1 }, { x: 4, y: 1 })).toHaveLength(4);
  });

  it('with blockOwn, an own army outside a city blocks another army; inside an own city it does not', () => {
    const s = game(['#####', '#####', '#####']);
    exploreAll(s);
    for (const y of [0, 1, 2]) addUnit(s, 'army', 0, 2, y);
    expect(findPath(pathMapFromState(s, 0, { blockOwn: true }), { type: 'army', x: 0, y: 1 }, { x: 4, y: 1 })).toBeNull();
    expect(findPath(pm(s), { type: 'army', x: 0, y: 1 }, { x: 4, y: 1 })).toHaveLength(4);

    const c = game(['#*###', '#####']);
    exploreAll(c);
    c.terrain = ['#', '*', '#', '#', '#', '#', '#', '#', '#', '#'].map((ch) => (ch === '*' ? 'city' : 'land')) as GameState['terrain'];
    c.cities = [{ id: 0, name: 'C0', x: 1, y: 0, owner: 0, production: null, progress: 0, lastBuilt: null }];
    addUnit(c, 'army', 0, 1, 0);
    const p = findPath(pathMapFromState(c, 0, { blockOwn: true }), { type: 'army', x: 0, y: 0 }, { x: 2, y: 0 })!;
    expect(p).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  it('a land path passes through a square with an own army unless blockOwn is set', () => {
    const s = game(['#####', '#####', '#####']);
    exploreAll(s);
    const from = { type: 'army' as const, x: 0, y: 1 };
    const to = { x: 4, y: 1 };
    const plain = findPath(pm(s), from, to)!;
    const mid = plain[1];
    addUnit(s, 'army', 0, mid.x, mid.y);
    expect(findPath(pm(s), from, to)).toEqual(plain);
    const around = findPath(pathMapFromState(s, 0, { blockOwn: true }), from, to)!;
    expect(around).toHaveLength(plain.length);
    expect(around).not.toContainEqual(mid);
  });

  it('a target square holding an own army with no room is unreachable either way', () => {
    const s = game(['#####', '#####', '#####']);
    exploreAll(s);
    addUnit(s, 'army', 0, 4, 1);
    const from = { type: 'army' as const, x: 0, y: 1 };
    expect(findPath(pm(s), from, { x: 4, y: 1 })).toBeNull();
    expect(findPath(pathMapFromState(s, 0, { blockOwn: true }), from, { x: 4, y: 1 })).toBeNull();
  });

  it('an army may target a transport with room, not a full one', () => {
    const s = game(['*#...', '.....']);
    exploreAll(s);
    const tr = addUnit(s, 'transport', 0, 2, 0);
    expect(findPath(pm(s), { type: 'army', x: 1, y: 0 }, { x: 2, y: 0 })).toEqual([{ x: 2, y: 0 }]);
    for (let i = 0; i < 6; i++) addUnit(s, 'army', 0, 2, 0, { carriedBy: tr.id });
    expect(findPath(pm(s), { type: 'army', x: 1, y: 0 }, { x: 2, y: 0 })).toBeNull();
  });

  it('aircraft pass over own units but cannot end on them', () => {
    const s = game(['*....', '.....', '.....']);
    exploreAll(s);
    for (const y of [0, 1, 2]) addUnit(s, 'army', 0, 2, y);
    const f = { type: 'fighter' as const, x: 0, y: 1 };
    expect(findPath(pm(s), f, { x: 4, y: 1 })).toHaveLength(4);
    expect(findPath(pm(s), f, { x: 2, y: 1 })).toBeNull();
    addUnit(s, 'carrier', 0, 3, 1);
    expect(findPath(pm(s), f, { x: 3, y: 1 })).toHaveLength(3);
  });

  it('pathMapFromState and pathMapFromView give identical paths', () => {
    const s = game(['*##.....', '###.....', '##*....#', '........']);
    exploreAll(s);
    s.turn = 3;
    addUnit(s, 'army', 0, 1, 1);
    addUnit(s, 'transport', 0, 3, 1);
    addUnit(s, 'army', 0, 3, 1, { carriedBy: s.nextUnitId - 1 });
    addUnit(s, 'fighter', 0, 4, 2);
    const e = addUnit(s, 'destroyer', 1, 5, 1);
    s.fog[0].lastSeen[e.id] = { unitId: e.id, type: 'destroyer', owner: 1, x: 5, y: 1, turnSeen: 3 };
    const view = getPlayerView(s, 0);
    const a = pathMapFromState(s, 0);
    const b = pathMapFromView(view);
    expect(b.own).toEqual(a.own);
    expect(b.enemy).toEqual(a.enemy);
    expect(b.cityOwner).toEqual(a.cityOwner);
    const cases: [Parameters<typeof findPath>[1], { x: number; y: number }][] = [
      [{ type: 'army', x: 1, y: 1 }, { x: 3, y: 1 }],
      [{ type: 'transport', x: 3, y: 1 }, { x: 6, y: 3 }],
      [{ type: 'fighter', x: 4, y: 2 }, { x: 0, y: 0 }],
      [{ type: 'destroyer', x: 3, y: 3 }, { x: 7, y: 3 }],
    ];
    for (const [u, to] of cases) expect(findPath(b, u, to)).toEqual(findPath(a, u, to));
    expect(findPath(a, cases[1][0], cases[1][1])).not.toBeNull();
  });

  it('findPath is deterministic', () => {
    const s = game(['########', '########', '########', '########']);
    exploreAll(s);
    const u = { type: 'army' as const, x: 0, y: 0 };
    expect(findPath(pm(s), u, { x: 7, y: 3 })).toEqual(findPath(pm(s), u, { x: 7, y: 3 }));
  });
});

describe('findFrontier', () => {
  it('returns the nearest explored square bordering unexplored, lowest index on ties; null when nothing is left', () => {
    const s = game(['#######', '#######', '#######']);
    exploreAll(s);
    const idx = (x: number, y: number) => y * 7 + x;
    for (const y of [0, 1, 2]) for (const x of [4, 5, 6]) s.fog[0].explored[idx(x, y)] = 0;
    const m = pm(s);
    expect(findFrontier(m, { type: 'army', x: 0, y: 1 })).toEqual({ x: 3, y: 0 });
    expect(findFrontier(m, { type: 'army', x: 3, y: 1 })).toEqual({ x: 3, y: 0 });
    exploreAll(s);
    expect(findFrontier(pm(s), { type: 'army', x: 0, y: 1 })).toBeNull();
  });
});

describe('arrivalTurn', () => {
  it('counts turns from moves left then the full move rate', () => {
    expect(arrivalTurn({ type: 'army', damage: 0, movesLeft: 1 }, 1, 5)).toBe(5);
    expect(arrivalTurn({ type: 'army', damage: 0, movesLeft: 1 }, 3, 5)).toBe(7);
    expect(arrivalTurn({ type: 'fighter', damage: 0, movesLeft: 2 }, 12, 5)).toBe(7);
    expect(arrivalTurn({ type: 'transport', damage: 2, movesLeft: 0 }, 2, 3)).toBe(5);
  });
});

describe('dirBetween', () => {
  it('maps adjacent squares to a Dir, wrap-aware, and null otherwise', () => {
    const m = { width: 5, height: 3, wrap: true };
    expect(dirBetween(m, { x: 0, y: 1 }, { x: 0, y: 0 })).toBe(0);
    expect(dirBetween(m, { x: 0, y: 1 }, { x: 4, y: 2 })).toBe(5);
    expect(dirBetween(m, { x: 0, y: 1 }, { x: 2, y: 1 })).toBeNull();
  });
});


