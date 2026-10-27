import { UNIT_STATS, canBecomeAirbase, canCarry, unitDisplayName, type Orders, type PlayerView, type Unit } from '../engine';
import type { ActionId } from './keys';

const inOwnCity = (v: PlayerView, u: Pick<Unit, 'x' | 'y'>) => v.myCities.some((c) => c.x === u.x && c.y === u.y);

/** Own units on the transport's square that could board it, by id. */
export function loadCandidates(view: PlayerView, t: Unit): Unit[] {
  if (UNIT_STATS[t.type].carries.length === 0) return [];
  return view.myUnits
    .filter((u) => u.id !== t.id && canCarry(t.type, u.type) && u.carriedBy === null && u.x === t.x && u.y === t.y)
    .sort((a, b) => a.id - b.id);
}

/** Own transports an escort could be sent to: not carried, with no escort of their own yet (apart from u itself). */
export function escortable(view: PlayerView, u: Unit): Unit[] {
  return view.myUnits.filter((t) => t.type === 'transport' && t.carriedBy === null
    && !view.myUnits.some((e) => e.id !== u.id && e.orders?.kind === 'escort' && e.orders.transportId === t.id));
}

export const UNIT_BUTTONS: ActionId[] = [
  'next', 'skip', 'hold', 'sentry', 'repair', 'moveTo', 'explore', 'load', 'unload', 'patrol', 'escort', 'airbase', 'goHome', 'clearOrders', 'center', 'info', 'disband',
];

export function availableActions(view: PlayerView, u: Unit): Record<ActionId, boolean> {
  const st = UNIT_STATS[u.type];
  const air = st.domain === 'air';
  const inCity = inOwnCity(view, u);
  const hasCargo = view.myUnits.some((c) => c.carriedBy === u.id);
  const fixed = u.type === 'airbase'; // an Airbase never moves
  return {
    next: true,
    skip: !fixed,
    hold: !fixed,
    moveTo: !fixed,
    center: true,
    endTurn: true,
    disband: true,
    load: st.carries.length > 0 && inCity && loadCandidates(view, u).length > 0,
    unload: hasCargo,
    goHome: view.myCities.length > 0 && !inCity && !fixed,
    patrol: !fixed,
    // A warship (not a transport) can escort when a transport of ours at sea has no escort yet.
    escort: st.domain === 'sea' && u.type !== 'transport' && u.carriedBy === null && escortable(view, u).length > 0,
    info: true,
    fit: true,
    explore: !air && !fixed,
    sentry: !fixed && (!air || inCity || u.carriedBy !== null),
    // An Army or Armor on open land can turn itself into an Airbase (Advanced units rule); it is for good.
    airbase: view.rules.advancedUnits && canBecomeAirbase(u.type) && u.carriedBy === null && !inCity
      && view.terrain[u.y * view.width + u.x] === 'land',
    clearOrders: u.orders !== null,
    // Damaged: in a city of ours it sits there until repaired, elsewhere it first goes to the nearest suitable city.
    repair: !fixed && u.damage > 0 && u.carriedBy === null && u.orders?.kind !== 'repair' && (inCity || view.myCities.length > 0),
  };
}

/** The unit-panel buttons that apply to u, in UNIT_BUTTONS order. */
export function visibleButtons(view: PlayerView, u: Unit): ActionId[] {
  const avail = availableActions(view, u);
  return UNIT_BUTTONS.filter((id) => avail[id]);
}

/** The orders of u in words, naming the transport an escort follows. */
export function ordersText(view: PlayerView, u: Unit): string {
  return describeOrders(u.orders, (id) => {
    const t = view.myUnits.find((x) => x.id === id);
    return t ? unitDisplayName(t) : undefined;
  });
}

export function describeOrders(o: Orders | null, nameOf?: (id: number) => string | undefined): string {
  if (o === null) return 'None';
  switch (o.kind) {
    case 'sentry': return 'Sentry';
    case 'goto': return `Go-to ${o.target.x},${o.target.y}`;
    case 'patrol': return `Patrol ${o.a.x},${o.a.y} ↔ ${o.b.x},${o.b.y}`;
    case 'explore': return 'Explore';
    case 'repair': return 'Repair';
    case 'escort': { const n = nameOf?.(o.transportId); return n ? `Escort ${n}` : 'Escort'; }
  }
}
