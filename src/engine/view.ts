import type { City, GameState, PlayerId, Terrain, Unit, UnitType } from './types';
import type { HouseRules } from './rules';
import { index } from './map';
import { canPlayerSeeUnit, visibleSquares } from './fog';

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

export interface PlayerView {
  me: PlayerId;
  turn: number;
  currentPlayer: PlayerId;
  winner: PlayerId | null;
  over: boolean;
  rules: HouseRules;
  width: number;
  height: number;
  wrap: boolean;
  /** null = unexplored. */
  terrain: (Terrain | null)[];
  /** Indices (y * width + x) of squares currently in sight, ascending. */
  visibleSquares: number[];
  players: { id: PlayerId; name: string; eliminated: boolean }[];
  myUnits: Unit[];
  myCities: City[];
  knownCities: { id: number; name: string; x: number; y: number; owner: PlayerId | null }[];
  enemies: EnemyMarker[];
}

export function getPlayerView(s: GameState, me: PlayerId): PlayerView {
  const fog = s.fog[me];
  return {
    me,
    turn: s.turn,
    currentPlayer: s.currentPlayer,
    winner: s.winner,
    over: s.over,
    rules: { ...s.rules },
    width: s.width,
    height: s.height,
    wrap: s.wrap,
    terrain: s.terrain.map((t, i) => (fog.explored[i] ? t : null)),
    visibleSquares: [...visibleSquares(s, me)].sort((a, b) => a - b),
    players: s.players.map((p) => ({ id: p.id, name: p.name, eliminated: p.eliminated })),
    myUnits: structuredClone(s.units.filter((u) => u.owner === me)),
    myCities: structuredClone(s.cities.filter((c) => c.owner === me)),
    knownCities: s.cities
      .filter((c) => fog.explored[index(s, c.x, c.y)])
      .map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, owner: c.owner === me ? me : (fog.knownCityOwner[c.id] ?? null) })),
    enemies: Object.values(fog.lastSeen)
      .sort((a, b) => a.y - b.y || a.x - b.x || a.turnSeen - b.turnSeen || a.type.localeCompare(b.type))
      .map((e, markerId) => {
        const u = s.units.find((x) => x.id === e.unitId);
        const visibleNow = !!u && u.x === e.x && u.y === e.y && canPlayerSeeUnit(s, me, u);
        return { markerId, type: e.type, owner: e.owner, x: e.x, y: e.y, turnSeen: e.turnSeen, visibleNow };
      }),
  };
}
