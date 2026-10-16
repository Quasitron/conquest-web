import type { ParsedMap } from './ascii';
import type { GameState } from './types';
import type { HouseRules } from './rules';
import { CLASSIC_RULES } from './rules';
import { updateFog } from './fog';
import { advanceProduction } from './production';
import { defaultCityName } from './names';

export interface NewGameOptions {
  map: ParsedMap;
  wrap?: boolean;
  players: { name: string; kind: 'human' | 'ai' }[];
  /** For each player, the index into map.cities of their starting city. */
  startCityIndices: number[];
  seed: number;
  rules?: Partial<HouseRules>;
  /** Optional names for map.cities by index; missing entries get default names. */
  cityNames?: string[];
}

export function createGame(o: NewGameOptions): GameState {
  const n = o.players.length;
  if (n < 2 || n > 6) throw new Error('a game needs 2 to 6 players');
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
    cities: o.map.cities.map((p, id) => ({
      id, name: o.cityNames?.[id] ?? defaultCityName(id), x: p.x, y: p.y, owner: null, production: null, progress: 0, lastBuilt: null,
    })),
    units: [],
    players: o.players.map((p, id) => ({ id, name: p.name, kind: p.kind, eliminated: false })),
    fog: o.players.map(() => ({ explored: new Array(size).fill(0), lastSeen: {}, knownCityOwner: {} })),
    currentPlayer: 0,
    turn: 1,
    nextUnitId: 1,
    rngState: o.seed | 0,
    winner: null,
    over: false,
  };
  o.startCityIndices.forEach((ci, pid) => {
    s.cities[ci].owner = pid;
    s.cities[ci].production = 'army';
  });
  for (const p of s.players) updateFog(s, p.id);
  if (!s.rules.fairFirstTurn) advanceProduction(s, 0, []);
  return s;
}
