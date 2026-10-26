import type { HouseRules } from './rules';

export type UnitType =
  | 'army' | 'armor' | 'fighter' | 'transport' | 'destroyer'
  | 'submarine' | 'cruiser' | 'battleship' | 'carrier';
export type Domain = 'land' | 'sea' | 'air';
export type Terrain = 'water' | 'land' | 'city';
export type PlayerId = number;
/** 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW */
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Pos {
  x: number;
  y: number;
}

export interface Unit {
  id: number;
  type: UnitType;
  owner: PlayerId;
  x: number;
  y: number;
  damage: number;
  /** Combat wins (promotions rule): rank is derived from it (see rankOf). */
  wins?: number;
  movesLeft: number;
  /** Remaining range for aircraft; null for all other units. */
  fuel: number | null;
  /** Id of the transport/carrier holding this unit, or null. */
  carriedBy: number | null;
  movedThisTurn: boolean;
  orders: Orders | null;
  unloadNextTurn: boolean;
  /** Player-given name, or null to show the default ordinal name. */
  name: string | null;
  /** Consecutive turns an order has been blocked (used by explore/goto retry logic). */
  blockedTurns: number;
}

export type Orders =
  | { kind: 'sentry' }
  | {
      kind: 'goto';
      target: Pos;
      /** Set on units following a city route: the destination city. Orders end if it is lost. */
      routeCity?: number;
      /** Turns a blocked path is waited out before the orders end (default 3). */
      wait?: number;
      /** What the unit does on arrival (default: wait for orders). */
      arrival?: 'sentry' | 'repair';
    }
  | {
      kind: 'patrol';
      a: Pos;
      b: Pos;
      toB: boolean;
      /** Aircraft patrols: the carrier that one end of the patrol is tied to; that end moves with it. */
      carrier?: { id: number; end: 'a' | 'b' };
    }
  | { kind: 'explore' }
  /** Sits in a friendly city until its damage is repaired, then wakes up. */
  | { kind: 'repair' }
  /** A warship that follows one of its own transports, staying beside it and fighting enemy ships that come next to it. */
  | { kind: 'escort'; transportId: number };

export type OrdersEndReason =
  | 'arrived' | 'blocked' | 'enemySighted' | 'lowFuel' | 'nothingToExplore' | 'cityFound' | 'returning' | 'destinationLost'
  | 'baseLost' | 'baseOutOfRange' | 'repaired' | 'cityLost' | 'escortLost' | 'crippled';

/** A city's standing route: matching units it builds head for another city of the owner. */
export interface CityRoute {
  destId: number;
  /** Unit types that follow the route. */
  types: UnitType[];
  /** Turns a unit waits when its way is blocked before it asks for orders. */
  blockWait: number;
  /** 'wait' leaves the unit awaiting orders at the destination; 'sentry' puts it on sentry. */
  arrival: 'wait' | 'sentry';
  /** The player who set the route; it lapses if the city changes hands. */
  by: PlayerId;
}

export interface City {
  id: number;
  name: string;
  x: number;
  y: number;
  owner: PlayerId | null;
  production: UnitType | null;
  progress: number;
  lastBuilt: UnitType | null;
  /** Hits taken in attacks (only with the city strength rule); heals one a turn. */
  damage?: number;
  /** Captures it has suffered lately (war-torn cities rule): each makes it build 25% slower; recovers over time. */
  warTorn?: number;
  /** Turns of its owner's time since it last recovered a step. */
  warTornClock?: number;
  route?: CityRoute;
}

export interface Player {
  id: PlayerId;
  name: string;
  kind: 'human' | 'ai';
  eliminated: boolean;
}

export interface LastSeen {
  unitId: number;
  type: UnitType;
  owner: PlayerId;
  x: number;
  y: number;
  turnSeen: number;
  /** Its promotion rank when seen (only set when above 0). */
  rank?: number;
}

export interface PlayerFog {
  /** 1 = explored, 0 = unexplored; indexed by y * width + x. */
  explored: number[];
  lastSeen: Record<number, LastSeen>;
  knownCityOwner: Record<number, PlayerId | null>;
}

/** One player's running totals of units destroyed, by unit type. */
export interface PlayerStats {
  /** Enemy units this player destroyed. */
  killed: Partial<Record<UnitType, number>>;
  /** This player's own units destroyed in combat, by cargo loss or by crashing. */
  lost: Partial<Record<UnitType, number>>;
}

export interface GameState {
  version: 3;
  rules: HouseRules;
  width: number;
  height: number;
  wrap: boolean;
  terrain: Terrain[];
  cities: City[];
  units: Unit[];
  players: Player[];
  /** Indexed by PlayerId. */
  fog: PlayerFog[];
  currentPlayer: PlayerId;
  turn: number;
  nextUnitId: number;
  rngState: number;
  winner: PlayerId | null;
  over: boolean;
  /** Per player, indexed by PlayerId; absent in games saved before the status report existed. */
  stats?: PlayerStats[];
}

export type Command =
  | { type: 'move'; player: PlayerId; unitId: number; dir: Dir }
  | { type: 'setProduction'; player: PlayerId; cityId: number; unitType: UnitType | null }
  | { type: 'disband'; player: PlayerId; unitId: number }
  | { type: 'load'; player: PlayerId; transportId: number; unitIds: number[] }
  | { type: 'unload'; player: PlayerId; transportId: number; unitIds: number[] | null }
  | { type: 'setOrders'; player: PlayerId; unitId: number; orders: Orders | null }
  /** `repair`: a damaged unit goes to the nearest suitable own city (or is already in one) and repairs there. */
  | { type: 'goHome'; player: PlayerId; unitId: number; repair?: boolean }
  | { type: 'setRoute'; player: PlayerId; cityId: number; route: Omit<CityRoute, 'by'> | null }
  | { type: 'renameCity'; player: PlayerId; cityId: number; name: string }
  | { type: 'renameUnit'; player: PlayerId; unitId: number; name: string | null }
  | { type: 'endTurn'; player: PlayerId }
  | { type: 'resign'; player: PlayerId };

export type DestroyReason =
  | 'combat' | 'cargoLost' | 'crashed' | 'cityCaptured'
  | 'garrison' | 'disbanded' | 'resigned';

export type CombatDefender =
  | { kind: 'unit'; unitId: number; owner: PlayerId; unitType: UnitType }
  | { kind: 'city'; cityId: number; owner: PlayerId | null };

export type GameEvent =
  | { type: 'unitMoved'; unitId: number; from: Pos; to: Pos }
  | {
      type: 'combat';
      attackerId: number;
      attackerOwner: PlayerId;
      attackerType: UnitType;
      /** The square the attacker fought from (before any move into the defender's square). */
      from?: Pos;
      defender: CombatDefender;
      x: number;
      y: number;
      attackerWon: boolean;
      /** Promotion ranks of the two units before the fight (only set when above 0). */
      attackerRank?: number;
      defenderRank?: number;
      attackerDamage: number;
      defenderDamage: number;
    }
  | { type: 'unitDestroyed'; unitId: number; owner: PlayerId; unitType: UnitType; reason: DestroyReason }
  | { type: 'cityCaptured'; cityId: number; by: PlayerId; from: PlayerId | null }
  | { type: 'unitProduced'; unitId: number; cityId: number; unitType: UnitType }
  | { type: 'unitPromoted'; unitId: number; owner: PlayerId; unitType: UnitType; rank: number }
  | { type: 'cargoUnloaded'; transportId: number; owner: PlayerId; unitIds: number[] }
  | { type: 'ordersEnded'; unitId: number; owner: PlayerId; reason: OrdersEndReason }
  | { type: 'turnStarted'; player: PlayerId; turn: number }
  | { type: 'playerEliminated'; player: PlayerId }
  | { type: 'gameOver'; winner: PlayerId | null };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
