import type { HouseRules } from './rules';

export type UnitType =
  | 'army' | 'fighter' | 'transport' | 'destroyer'
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
  movesLeft: number;
  /** Remaining range for aircraft; null for all other units. */
  fuel: number | null;
  /** Id of the transport/carrier holding this unit, or null. */
  carriedBy: number | null;
  movedThisTurn: boolean;
  orders: Orders | null;
  unloadNextTurn: boolean;
}

export type Orders =
  | { kind: 'sentry' }
  | { kind: 'goto'; target: Pos }
  | { kind: 'patrol'; a: Pos; b: Pos; toB: boolean }
  | { kind: 'explore' };

export interface City {
  id: number;
  x: number;
  y: number;
  owner: PlayerId | null;
  production: UnitType | null;
  progress: number;
  lastBuilt: UnitType | null;
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
}

export interface PlayerFog {
  /** 1 = explored, 0 = unexplored; indexed by y * width + x. */
  explored: number[];
  lastSeen: Record<number, LastSeen>;
  knownCityOwner: Record<number, PlayerId | null>;
}

export interface GameState {
  version: 2;
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
}

export type Command =
  | { type: 'move'; player: PlayerId; unitId: number; dir: Dir }
  | { type: 'setProduction'; player: PlayerId; cityId: number; unitType: UnitType | null }
  | { type: 'disband'; player: PlayerId; unitId: number }
  | { type: 'load'; player: PlayerId; transportId: number; unitIds: number[] }
  | { type: 'unload'; player: PlayerId; transportId: number; unitIds: number[] | null }
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
      defender: CombatDefender;
      x: number;
      y: number;
      attackerWon: boolean;
      attackerDamage: number;
      defenderDamage: number;
    }
  | { type: 'unitDestroyed'; unitId: number; owner: PlayerId; unitType: UnitType; reason: DestroyReason }
  | { type: 'cityCaptured'; cityId: number; by: PlayerId; from: PlayerId | null }
  | { type: 'unitProduced'; unitId: number; cityId: number; unitType: UnitType }
  | { type: 'cargoUnloaded'; transportId: number; owner: PlayerId; unitIds: number[] }
  | { type: 'turnStarted'; player: PlayerId; turn: number }
  | { type: 'playerEliminated'; player: PlayerId }
  | { type: 'gameOver'; winner: PlayerId | null };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
