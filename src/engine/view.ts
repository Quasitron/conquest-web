import type { City, GameState, LastSeen, PlayerId, Terrain, Unit } from './types';
import { index } from './map';
import { canPlayerSeeUnit } from './fog';

export interface PlayerView {
  me: PlayerId;
  turn: number;
  currentPlayer: PlayerId;
  winner: PlayerId | null;
  over: boolean;
  width: number;
  height: number;
  wrap: boolean;
  /** null = unexplored. */
  terrain: (Terrain | null)[];
  players: { id: PlayerId; name: string; eliminated: boolean }[];
  myUnits: Unit[];
  myCities: City[];
  knownCities: { id: number; x: number; y: number; owner: PlayerId | null }[];
  enemies: (LastSeen & { visibleNow: boolean })[];
}

export function getPlayerView(s: GameState, me: PlayerId): PlayerView {
  const fog = s.fog[me];
  return {
    me,
    turn: s.turn,
    currentPlayer: s.currentPlayer,
    winner: s.winner,
    over: s.over,
    width: s.width,
    height: s.height,
    wrap: s.wrap,
    terrain: s.terrain.map((t, i) => (fog.explored[i] ? t : null)),
    players: s.players.map((p) => ({ id: p.id, name: p.name, eliminated: p.eliminated })),
    myUnits: structuredClone(s.units.filter((u) => u.owner === me)),
    myCities: structuredClone(s.cities.filter((c) => c.owner === me)),
    knownCities: s.cities
      .filter((c) => fog.explored[index(s, c.x, c.y)])
      .map((c) => ({ id: c.id, x: c.x, y: c.y, owner: c.owner === me ? me : (fog.knownCityOwner[c.id] ?? null) })),
    enemies: Object.values(fog.lastSeen).map((e) => {
      const u = s.units.find((x) => x.id === e.unitId);
      const visibleNow = !!u && u.x === e.x && u.y === e.y && canPlayerSeeUnit(s, me, u);
      return { ...e, visibleNow };
    }),
  };
}
