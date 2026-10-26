import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { hashState } from '../../src/engine/hash';
import { replay } from '../../src/engine/replay';
import { Rng } from '../../src/engine/rng';
import { UNIT_STATS, buildableTypes, cargoCapacity, cargoUsed } from '../../src/engine/units';
import type { Command, Dir, GameState } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const WORLD = [
  '*##....##*',
  '####..####',
  '.##*...*#.',
  '..##..##..',
  '*##....##*',
];

function checkInvariants(s: GameState): void {
  const ids = new Set<number>();
  for (const u of s.units) {
    expect(ids.has(u.id)).toBe(false);
    ids.add(u.id);
    expect(u.x >= 0 && u.x < s.width && u.y >= 0 && u.y < s.height).toBe(true);
    expect(u.damage).toBeLessThan(UNIT_STATS[u.type].hits);
    const terrain = s.terrain[u.y * s.width + u.x];
    const domain = UNIT_STATS[u.type].domain;
    if (u.carriedBy !== null) {
      const carrier = s.units.find((c) => c.id === u.carriedBy);
      expect(carrier).toBeDefined();
      expect([carrier!.x, carrier!.y]).toEqual([u.x, u.y]);
      expect(UNIT_STATS[carrier!.type].carries).toContain(u.type);
      expect(carrier!.carriedBy).toBeNull();
    } else if (domain === 'land') {
      expect(terrain).not.toBe('water');
    } else if (domain === 'sea') {
      expect(terrain).not.toBe('land');
    }
    const cargo = cargoUsed(s.units.filter((c) => c.carriedBy === u.id));
    expect(cargo).toBeLessThanOrEqual(cargoCapacity(u));
  }
  // Opposing units never share a square (cities aside).
  const ownerAt = new Map<number, number>();
  for (const u of s.units) {
    if (u.carriedBy !== null || s.cities.some((c) => c.x === u.x && c.y === u.y)) continue;
    const key = u.y * s.width + u.x;
    const seen = ownerAt.get(key);
    if (seen !== undefined) expect(u.owner).toBe(seen);
    ownerAt.set(key, u.owner);
  }
}

function playRandomly(initial: GameState, count: number, seed: number, extras = false) {
  const r = new Rng(seed);
  let s = initial;
  const commands: Command[] = [];
  let cargoStates = 0;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r.next() * xs.length)];
  for (let i = 0; i < count && !s.over; i++) {
    const me = s.currentPlayer;
    const units = s.units.filter((u) => u.owner === me);
    const cities = s.cities.filter((c) => c.owner === me);
    const extra = extras ? r.next() : 1;
    const roll = r.next();
    let cmd: Command;
    if (extra < 0.002) cmd = { type: 'resign', player: me };
    else if (extra < 0.022 && units.length) cmd = { type: 'disband', player: me, unitId: pick(units).id };
    else if (roll < 0.8 && units.length) cmd = { type: 'move', player: me, unitId: pick(units).id, dir: Math.floor(r.next() * 8) as Dir };
    else if (roll < 0.86 && cities.length) cmd = { type: 'setProduction', player: me, cityId: pick(cities).id, unitType: pick(buildableTypes(s.rules)) };
    else cmd = { type: 'endTurn', player: me };
    const res = apply(s, cmd);
    if (res.ok) {
      s = res.state;
      commands.push(cmd);
      checkInvariants(s);
      if (s.units.some((u) => u.carriedBy !== null)) cargoStates++;
    }
  }
  return { final: s, commands, cargoStates };
}

describe('determinism', () => {
  it('replaying the command log reproduces the exact final state', () => {
    const initial = makeGame(WORLD, { starts: [0, 5], seed: 2024 });
    const { final, commands, cargoStates } = playRandomly(initial, 8000, 3);
    expect(commands.length).toBeGreaterThan(100);
    expect(cargoStates).toBeGreaterThan(0);
    expect(hashState(replay(initial, commands))).toBe(hashState(final));
  });

  it('a three-player game with disbands and resignations replays exactly and never hangs', () => {
    let finished = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const initial = makeGame(WORLD, { players: 3, starts: [0, 5, 2], seed });
      const { final, commands } = playRandomly(initial, 6000, seed + 100, true);
      expect(commands.length).toBeGreaterThan(50);
      expect(hashState(replay(initial, commands))).toBe(hashState(final));
      if (final.over) finished++;
    }
    expect(finished).toBeGreaterThan(0);
  });

  it('the same seed and commands give the same result twice', () => {
    const a = playRandomly(makeGame(WORLD, { starts: [0, 5], seed: 5 }), 2000, 3);
    const b = playRandomly(makeGame(WORLD, { starts: [0, 5], seed: 5 }), 2000, 3);
    expect(hashState(a.final)).toBe(hashState(b.final));
  });

  it('a save round-tripped through JSON keeps playing identically', () => {
    const initial = makeGame(WORLD, { starts: [0, 5], seed: 11 });
    const { final: mid } = playRandomly(initial, 1500, 1);
    const loaded = JSON.parse(JSON.stringify(mid)) as GameState;
    const a = playRandomly(mid, 1500, 99);
    const b = playRandomly(loaded, 1500, 99);
    expect(hashState(b.final)).toBe(hashState(a.final));
  });

  it('replay with setOrders/goHome/load/unload reproduces the hash', () => {
    const initial = makeGame(['*##.*...*', '.........'], { starts: [0, 2], seed: 7 });
    for (const c of initial.cities) c.production = null;
    initial.cities[1].owner = 0;
    initial.fog[0].explored.fill(1);
    const transport = addUnit(initial, 'transport', 0, 0, 0);
    const armies = [1, 2].map(() => addUnit(initial, 'army', 0, 0, 0));
    const walker = addUnit(initial, 'army', 0, 2, 0);
    const patroller = addUnit(initial, 'destroyer', 0, 6, 1);
    const flyer = addUnit(initial, 'fighter', 0, 4, 0);
    const scout = addUnit(initial, 'fighter', 0, 4, 0);
    const ids = armies.map((a) => a.id);

    const script: Command[] = [
      { type: 'load', player: 0, transportId: transport.id, unitIds: ids },
      { type: 'unload', player: 0, transportId: transport.id, unitIds: null },
      { type: 'load', player: 0, transportId: transport.id, unitIds: ids },
      { type: 'setOrders', player: 0, unitId: transport.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } },
      { type: 'setOrders', player: 0, unitId: patroller.id, orders: { kind: 'patrol', a: { x: 5, y: 1 }, b: { x: 7, y: 1 }, toB: true } },
      { type: 'setOrders', player: 0, unitId: flyer.id, orders: { kind: 'goto', target: { x: 7, y: 1 } } },
      { type: 'setOrders', player: 0, unitId: scout.id, orders: { kind: 'patrol', a: { x: 4, y: 0 }, b: { x: 6, y: 1 }, toB: true } },
      { type: 'goHome', player: 0, unitId: walker.id },
    ];
    let s = initial;
    const log: Command[] = [];
    const play = (cmd: Command) => {
      const r = apply(s, cmd);
      if (r.ok) {
        s = r.state;
        log.push(cmd);
      }
      return r.ok;
    };
    for (const cmd of script) expect(play(cmd)).toBe(true);
    for (let i = 0; i < 6; i++) {
      expect(play({ type: 'endTurn', player: 0 })).toBe(true);
      expect(play({ type: 'endTurn', player: 1 })).toBe(true);
      if (i === 2) play({ type: 'goHome', player: 0, unitId: flyer.id });
    }
    expect(s.units.find((u) => u.id === transport.id)).toMatchObject({ x: 4, y: 0, orders: null });
    expect(s.units.find((u) => u.id === scout.id)).toMatchObject({ orders: { kind: 'patrol' } });
    expect(hashState(replay(initial, log))).toBe(hashState(s));
  });

  it('replay with a waiting goto and an Explore that ends cityFound reproduces the hash', () => {
    // Row 0 is a 1-wide corridor plugged by an own army; row 2 holds a neutral city for the explorer.
    const initial = makeGame(['*#########*', '...........', '#####*#####'], { starts: [0, 1], seed: 9 });
    for (const c of initial.cities) c.production = null;
    initial.fog[0].explored.fill(0);
    const mark = (x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) initial.fog[0].explored[y * initial.width + x] = 1;
    };
    mark(0, 4, 0, 0);
    mark(0, 2, 1, 2);
    const walker = addUnit(initial, 'army', 0, 1, 0);
    addUnit(initial, 'army', 0, 2, 0);
    const explorer = addUnit(initial, 'army', 0, 1, 2);
    const log: Command[] = [];
    let s = initial;
    const play = (cmd: Command) => {
      const r = apply(s, cmd);
      if (r.ok) {
        s = r.state;
        log.push(cmd);
      }
      return r.ok;
    };
    expect(play({ type: 'setOrders', player: 0, unitId: walker.id, orders: { kind: 'goto', target: { x: 3, y: 0 } } })).toBe(true);
    expect(play({ type: 'setOrders', player: 0, unitId: explorer.id, orders: { kind: 'explore' } })).toBe(true);
    const reasons: string[] = [];
    for (let i = 0; i < 12; i++) {
      for (const player of [0, 1]) {
        const r = apply(s, { type: 'endTurn', player });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        s = r.state;
        log.push({ type: 'endTurn', player });
        for (const e of r.events) if (e.type === 'ordersEnded') reasons.push(e.reason);
      }
    }
    expect(reasons).toContain('cityFound');
    expect(reasons).toContain('blocked');
    expect(hashState(replay(initial, log))).toBe(hashState(s));
  });
  it('replay reports the first rejected command', () => {
    const initial = makeGame(WORLD, { starts: [0, 5] });
    expect(() => replay(initial, [{ type: 'move', player: 0, unitId: 12345, dir: 0 }])).toThrow(/command 0/);
  });
});
