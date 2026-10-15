import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { hashState } from '../../src/engine/hash';
import { replay } from '../../src/engine/replay';
import { Rng } from '../../src/engine/rng';
import { UNIT_STATS, UNIT_TYPES, cargoCapacity } from '../../src/engine/units';
import type { Command, Dir, GameState } from '../../src/engine/types';
import { makeGame } from '../helpers';

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
      expect(UNIT_STATS[carrier!.type].carries).toBe(u.type);
      expect(carrier!.carriedBy).toBeNull();
    } else if (domain === 'land') {
      expect(terrain).not.toBe('water');
    } else if (domain === 'sea') {
      expect(terrain).not.toBe('land');
    }
    const cargo = s.units.filter((c) => c.carriedBy === u.id).length;
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
    else if (roll < 0.86 && cities.length) cmd = { type: 'setProduction', player: me, cityId: pick(cities).id, unitType: pick(UNIT_TYPES) };
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

  it('replay reports the first rejected command', () => {
    const initial = makeGame(WORLD, { starts: [0, 5] });
    expect(() => replay(initial, [{ type: 'move', player: 0, unitId: 12345, dir: 0 }])).toThrow(/command 0/);
  });
});
