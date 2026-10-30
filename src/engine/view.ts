import type { City, GameState, PlayerId, PlayerStats, Relief, Terrain, Unit, UnitType } from './types';
import { emptyStats } from './stats';
import type { HouseRules } from './rules';
import { index } from './map';
import { canPlayerSeeUnit, visibleSquares } from './fog';
import { riverNetOf } from './rivers';

export interface EnemyMarker {
  /** View-local id; not the engine's unit id. */
  markerId: number;
  type: UnitType;
  owner: PlayerId;
  x: number;
  y: number;
  turnSeen: number;
  visibleNow: boolean;
  /** Its promotion rank when last seen (only set when above 0). */
  rank?: number;
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
  /** The known ground on land squares (null = unexplored); absent on a map without terrain. */
  relief?: (Relief | null)[];
  /**
   * How the known rivers run (see RiverNet): flow and outlet per explored river square, null where unexplored. The
   * numbers come from the whole map, so a river is drawn the same width however much of it has been found.
   */
  riverNet?: { flow: (number | null)[]; down: (number | null)[]; up: (number | null)[] };
  /** Indices (y * width + x) of squares currently in sight, ascending. */
  visibleSquares: number[];
  players: { id: PlayerId; name: string; eliminated: boolean }[];
  myUnits: Unit[];
  myCities: City[];
  /** `damage` is the city's hits taken (city strength rule only; 0 otherwise). */
  knownCities: { id: number; name: string; x: number; y: number; owner: PlayerId | null; damage: number }[];
  enemies: EnemyMarker[];
  /** This player's own kill and loss totals. */
  stats: PlayerStats;
  /** Other players still in the game that hold no city any more, with how many units they have left (just the count). */
  cityless: { id: PlayerId; name: string; units: number }[];
}

function riverNetView(s: GameState, explored: ArrayLike<unknown>): Pick<PlayerView, 'riverNet'> {
  const net = riverNetOf(s);
  if (!net) return {};
  // The strongest stream feeding each square; `up` keeps it only where that square is still unexplored, so the river can run on to the edge of the known ground.
  const feeder = new Array<number>(net.flow.length).fill(-1);
  net.down.forEach((d, j) => {
    if (d >= 0 && (feeder[d] < 0 || net.flow[j] > net.flow[feeder[d]])) feeder[d] = j;
  });
  return {
    riverNet: {
      flow: net.flow.map((f, i) => (explored[i] ? f : null)),
      down: net.down.map((d, i) => (explored[i] ? d : null)),
      up: feeder.map((f, i) => (explored[i] && f >= 0 && !explored[f] ? f : null)),
    },
  };
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
    ...(s.relief ? { relief: s.relief.map((r, i) => (fog.explored[i] ? r : null)) } : {}),
    ...riverNetView(s, fog.explored),
    visibleSquares: [...visibleSquares(s, me)].sort((a, b) => a - b),
    players: s.players.map((p) => ({ id: p.id, name: p.name, eliminated: p.eliminated })),
    myUnits: structuredClone(s.units.filter((u) => u.owner === me)),
    myCities: structuredClone(s.cities.filter((c) => c.owner === me)),
    knownCities: s.cities
      .filter((c) => fog.explored[index(s, c.x, c.y)])
      .map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, owner: c.owner === me ? me : (fog.knownCityOwner[c.id] ?? null), damage: c.damage ?? 0 })),
    enemies: Object.values(fog.lastSeen)
      .sort((a, b) => a.y - b.y || a.x - b.x || a.turnSeen - b.turnSeen || a.type.localeCompare(b.type))
      .map((e, markerId) => {
        const u = s.units.find((x) => x.id === e.unitId);
        const visibleNow = !!u && u.x === e.x && u.y === e.y && canPlayerSeeUnit(s, me, u);
        return { markerId, type: e.type, owner: e.owner, x: e.x, y: e.y, turnSeen: e.turnSeen, visibleNow, ...(e.rank ? { rank: e.rank } : {}) };
      }),
    stats: structuredClone(s.stats?.[me] ?? emptyStats()),
    cityless: s.players
      .filter((p) => p.id !== me && !p.eliminated && !s.cities.some((c) => c.owner === p.id))
      .map((p) => ({ id: p.id, name: p.name, units: s.units.filter((x) => x.owner === p.id).length })),
  };
}
