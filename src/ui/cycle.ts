import type { LogEntry } from '../app/session';
import type { City, PlayerId, Unit, UnitType } from '../engine';

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

/** The unit after `id` in `ready`, wrapping; for an id that is no longer ready, the first greater id (else the first). */
export function nextReadyAfter(ready: readonly Unit[], id: number | null): Unit | null {
  if (ready.length === 0) return null;
  if (id === null) return ready[0];
  const at = ready.findIndex((u) => u.id === id);
  if (at >= 0) return ready[(at + 1) % ready.length];
  return ready.find((u) => u.id > id) ?? ready[0];
}

export interface ProductionReportItem { cityId: number; unitId: number; unitType: UnitType }

/**
 * This turn's unitProduced events as turn-start reports, ordered by city id then unit id.
 * When `cities` is given, only cities owned by `me` are reported (the log may hold other seats' events).
 */
export function reportQueue(
  entries: readonly LogEntry[], turn: number, me: PlayerId, cities?: readonly Pick<City, 'id' | 'owner'>[],
): ProductionReportItem[] {
  const mine = cities ? new Set(cities.filter((c) => c.owner === me).map((c) => c.id)) : null;
  const out: ProductionReportItem[] = [];
  for (const e of entries) {
    if (e.turn !== turn || e.event.type !== 'unitProduced') continue;
    if (mine && !mine.has(e.event.cityId)) continue;
    out.push({ cityId: e.event.cityId, unitId: e.event.unitId, unitType: e.event.unitType });
  }
  return out.sort((a, b) => a.cityId - b.cityId || a.unitId - b.unitId);
}