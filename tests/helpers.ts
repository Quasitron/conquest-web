import { parseAscii } from '../src/engine/ascii';
import { createGame } from '../src/engine/setup';
import { spawnUnit } from '../src/engine/query';
import type { RandomSource } from '../src/engine/rng';
import type { GameState, PlayerId, Unit, UnitType } from '../src/engine/types';

export function makeGame(
  rows: string[],
  opts: { wrap?: boolean; players?: number; starts?: number[]; seed?: number } = {},
): GameState {
  const players = opts.players ?? 2;
  return createGame({
    map: parseAscii(rows),
    wrap: opts.wrap ?? false,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, kind: 'human' as const })),
    startCityIndices: opts.starts ?? Array.from({ length: players }, (_, i) => i),
    seed: opts.seed ?? 1,
  });
}

export function addUnit(
  s: GameState, type: UnitType, owner: PlayerId, x: number, y: number, patch: Partial<Unit> = {},
): Unit {
  const u = spawnUnit(s, type, owner, x, y);
  Object.assign(u, patch);
  return u;
}

/** Random source that returns the given values in order, then repeats the last one. */
export function fixedRng(...values: number[]): RandomSource {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] };
}

/** In combat, a roll below A/(A+D) is an attacker hit. */
export const attackerAlwaysHits = () => fixedRng(0);
export const defenderAlwaysHits = () => fixedRng(0.999);
