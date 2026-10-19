import { UNIT_STATS, type Orders, type PlayerView, type Unit } from '../engine';
import type { ActionId } from './keys';

const inOwnCity = (v: PlayerView, u: Pick<Unit, 'x' | 'y'>) => v.myCities.some((c) => c.x === u.x && c.y === u.y);

/** Own units on the transport's square that could board it, by id. */
export function loadCandidates(view: PlayerView, t: Unit): Unit[] {
  const carries = UNIT_STATS[t.type].carries;
  if (!carries) return [];
  return view.myUnits
    .filter((u) => u.id !== t.id && u.type === carries && u.carriedBy === null && u.x === t.x && u.y === t.y)
    .sort((a, b) => a.id - b.id);
}

export const UNIT_BUTTONS: ActionId[] = [
  'next', 'skip', 'hold', 'sentry', 'repair', 'moveTo', 'explore', 'load', 'unload', 'patrol', 'goHome', 'clearOrders', 'center', 'info', 'disband',
];

export function availableActions(view: PlayerView, u: Unit): Record<ActionId, boolean> {
  const st = UNIT_STATS[u.type];
  const air = st.domain === 'air';
  const inCity = inOwnCity(view, u);
  const hasCargo = view.myUnits.some((c) => c.carriedBy === u.id);
  return {
    next: true,
    skip: true,
    hold: true,
    moveTo: true,
    center: true,
    endTurn: true,
    disband: true,
    load: st.carries !== null && inCity && loadCandidates(view, u).length > 0,
    unload: hasCargo,
    goHome: view.myCities.length > 0 && !inCity,
    patrol: true,
    info: true,
    fit: true,
    explore: !air,
    sentry: !air || inCity || u.carriedBy !== null,
    clearOrders: u.orders !== null,
    // Damaged and in a city of ours: sit there until repaired, then wake up.
    repair: u.damage > 0 && inCity && u.carriedBy === null && u.orders?.kind !== 'repair',
  };
}

/** The unit-panel buttons that apply to u, in UNIT_BUTTONS order. */
export function visibleButtons(view: PlayerView, u: Unit): ActionId[] {
  const avail = availableActions(view, u);
  return UNIT_BUTTONS.filter((id) => avail[id]);
}

export function describeOrders(o: Orders | null): string {
  if (o === null) return 'None';
  switch (o.kind) {
    case 'sentry': return 'Sentry';
    case 'goto': return `Go-to ${o.target.x},${o.target.y}`;
    case 'patrol': return `Patrol ${o.a.x},${o.a.y} ↔ ${o.b.x},${o.b.y}`;
    case 'explore': return 'Explore';
    case 'repair': return 'Repair';
  }
}
