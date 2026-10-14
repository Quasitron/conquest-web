import type { City, DestroyReason, GameEvent, GameState, PlayerId, Unit, UnitType } from './types';
import { UNIT_STATS, cargoCapacity } from './units';
import { areFriendly } from './relations';

export function unitById(s: GameState, id: number): Unit | undefined {
  return s.units.find((u) => u.id === id);
}

export function cityAt(s: GameState, x: number, y: number): City | undefined {
  return s.cities.find((c) => c.x === x && c.y === y);
}

export function unitsAt(s: GameState, x: number, y: number): Unit[] {
  return s.units.filter((u) => u.x === x && u.y === y);
}

export function topLevelUnitsAt(s: GameState, x: number, y: number): Unit[] {
  return unitsAt(s, x, y).filter((u) => u.carriedBy === null);
}

export function cargoOf(s: GameState, carrier: Unit): Unit[] {
  return s.units.filter((u) => u.carriedBy === carrier.id);
}

/** Aircraft refuel on a carrier or in a friendly city. */
export function isAtRefuelPoint(s: GameState, u: Unit): boolean {
  if (u.carriedBy !== null) return true;
  const c = cityAt(s, u.x, u.y);
  return !!c && areFriendly(s, c.owner, u.owner);
}

export function spawnUnit(s: GameState, type: UnitType, owner: PlayerId, x: number, y: number): Unit {
  const st = UNIT_STATS[type];
  const u: Unit = {
    id: s.nextUnitId++, type, owner, x, y,
    damage: 0, movesLeft: st.move, fuel: st.range, carriedBy: null, movedThisTurn: false,
  };
  s.units.push(u);
  return u;
}

/** Removes a unit (and its cargo first). Safe to call on an already-removed unit. */
export function destroyUnit(s: GameState, u: Unit, reason: DestroyReason, events: GameEvent[]): void {
  if (!s.units.includes(u)) return;
  for (const c of cargoOf(s, u)) destroyUnit(s, c, 'cargoLost', events);
  s.units = s.units.filter((x) => x !== u);
  events.push({ type: 'unitDestroyed', unitId: u.id, owner: u.owner, unitType: u.type, reason });
}

/** Destroys cargo beyond the carrier's (damage-reduced) capacity, newest units first. */
export function trimCargo(s: GameState, carrier: Unit, events: GameEvent[]): void {
  const cargo = cargoOf(s, carrier).sort((a, b) => b.id - a.id);
  let excess = cargo.length - cargoCapacity(carrier);
  for (const c of cargo) {
    if (excess <= 0) break;
    destroyUnit(s, c, 'cargoLost', events);
    excess--;
  }
}
