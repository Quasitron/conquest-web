import type { ParsedMap } from './ascii';
import type { GameState } from './types';
import type { HouseRules } from './rules';
import { CLASSIC_RULES } from './rules';
import { updateFog } from './fog';
import { advanceProduction } from './production';
import { defaultCityName } from './names';
import { emptyStats } from './stats';

/** The most players a game takes. */
export const MAX_PLAYERS = 8;

export interface NewGameOptions {
  map: ParsedMap;
  wrap?: boolean;
  players: { name: string; kind: 'human' | 'ai'; team?: number }[];
  /** For each player, the index into map.cities of their starting city. */
  startCityIndices: number[];
  seed: number;
  rules?: Partial<HouseRules>;
  /** Optional names for map.cities by index; missing entries get default names. */
  cityNames?: string[];
}

export function createGame(o: NewGameOptions): GameState {
  const n = o.players.length;
  if (n < 2 || n > MAX_PLAYERS) throw new Error(`a game needs 2 to ${MAX_PLAYERS} players`);
  if (o.startCityIndices.length !== n) throw new Error('each player needs exactly one start city');
  if (new Set(o.startCityIndices).size !== n) throw new Error('start cities must be distinct');
  for (const i of o.startCityIndices) {
    if (i < 0 || i >= o.map.cities.length) throw new Error(`start city index ${i} out of range`);
  }

  const size = o.map.width * o.map.height;
  const s: GameState = {
    version: 3,
    rules: { ...CLASSIC_RULES, ...o.rules },
    width: o.map.width,
    height: o.map.height,
    wrap: o.wrap ?? false,
    terrain: [...o.map.terrain],
    ...(o.map.relief ? { relief: [...o.map.relief] } : {}),
    cities: o.map.cities.map((p, id) => ({
      id, name: o.cityNames?.[id] ?? defaultCityName(id), x: p.x, y: p.y, owner: null, production: null, progress: 0, lastBuilt: null,
    })),
    units: [],
    players: o.players.map((p, id) => ({ id, name: p.name, kind: p.kind, eliminated: false, ...(p.team !== undefined ? { team: p.team } : {}) })),
    fog: o.players.map(() => ({ explored: new Array(size).fill(0), lastSeen: {}, knownCityOwner: {} })),
    currentPlayer: 0,
    turn: 1,
    nextUnitId: 1,
    rngState: o.seed | 0,
    winner: null,
    over: false,
    stats: o.players.map(emptyStats),
  };
  o.startCityIndices.forEach((ci, pid) => {
    s.cities[ci].owner = pid;
    s.cities[ci].production = 'army';
  });
  for (const p of s.players) updateFog(s, p.id);
  if (!s.rules.fairFirstTurn) advanceProduction(s, 0, []);
  return s;
}
