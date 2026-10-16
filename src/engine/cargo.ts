import type { GameEvent, GameState, Unit } from './types';
import { UNIT_STATS, cargoCapacity } from './units';
import { cargoOf, cityAt } from './query';

export function inOwnCity(s: GameState, t: Unit): boolean {
  return cityAt(s, t.x, t.y)?.owner === t.owner;
}

/** Boards the given own armies (or fighters) onto a carrier standing in its owner's city. */
export function loadUnits(s: GameState, t: Unit, unitIds: number[]): string | null {
  const carries = UNIT_STATS[t.type].carries;
  if (!carries) return 'this unit cannot carry cargo';
  if (!inOwnCity(s, t)) return 'can only load in one of your cities';
  if (unitIds.length === 0 || new Set(unitIds).size !== unitIds.length) return 'nothing to load';
  const boarding: Unit[] = [];
  for (const id of unitIds) {
    const u = s.units.find((x) => x.id === id);
    if (!u || u.owner !== t.owner) return 'not your unit';
    if (u.carriedBy !== null || u.x !== t.x || u.y !== t.y || u.type !== carries) return 'unit cannot board here';
    boarding.push(u);
  }
  if (boarding.length > cargoCapacity(t) - cargoOf(s, t).length) return 'not enough room';
  for (const u of boarding) {
    u.carriedBy = t.id;
    u.orders = { kind: 'sentry' };
  }
  t.unloadNextTurn = false;
  return null;
}

/** Wakes cargo (null = all of it); in an own city it also leaves the transport. */
export function unloadCargo(s: GameState, t: Unit, unitIds: number[] | null, events: GameEvent[]): string | null {
  const cargo = cargoOf(s, t);
  const chosen = unitIds === null ? cargo : cargo.filter((c) => unitIds.includes(c.id));
  if (chosen.length === 0) return 'nothing to unload';
  if (unitIds !== null && !unitIds.every((id) => cargo.some((c) => c.id === id))) return 'unit is not aboard';
  const release = inOwnCity(s, t);
  for (const c of chosen) {
    c.orders = null;
    if (release) c.carriedBy = null;
  }
  events.push({ type: 'cargoUnloaded', transportId: t.id, owner: t.owner, unitIds: chosen.map((c) => c.id) });
  return null;
}
