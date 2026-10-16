import type { LogEntry } from '../app/session';
import type { Unit } from '../engine';

/**
 * Units the unit cycle should visit this turn: awake, with moves left, not held.
 * Newly built units come first, then the rest, both by id; skipped units go last in skip order.
 */
export function readyUnits(
  units: readonly Unit[], newIds: ReadonlySet<number>, held: ReadonlySet<number>, skipped: readonly number[],
): Unit[] {
  const ready = units.filter((u) => u.movesLeft > 0 && u.orders === null && !held.has(u.id));
  const skippedSet = new Set(skipped);
  const byId = (a: Unit, b: Unit) => a.id - b.id;
  const fresh = ready.filter((u) => newIds.has(u.id) && !skippedSet.has(u.id)).sort(byId);
  const rest = ready.filter((u) => !newIds.has(u.id) && !skippedSet.has(u.id)).sort(byId);
  const tail: Unit[] = [];
  for (const id of skipped) {
    const u = ready.find((x) => x.id === id);
    if (u && !tail.includes(u)) tail.push(u);
  }
  return [...fresh, ...rest, ...tail];
}

/** Ids of the units produced during the given turn. */
export function builtThisTurn(entries: readonly LogEntry[], turn: number): Set<number> {
  const built = new Set<number>();
  for (const e of entries) {
    if (e.turn === turn && e.event.type === 'unitProduced') built.add(e.event.unitId);
  }
  return built;
}
