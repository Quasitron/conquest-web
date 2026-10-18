import type { PlayerView, Pos, Unit } from '../engine';
import type { Camera } from './camera';
import { availableActions } from './actions';
import type { ActionId } from './keys';

/**
 * The box dragged in Group mode, in squares. On a wrapping map x may run outside 0..width-1 (a box dragged across
 * the seam), so x0..x1 is the unwrapped span; y is always inside the map.
 */
export interface GroupBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The orders a group can be given, with the action each one needs to be available for a unit. */
export const GROUP_ORDERS = [
  { id: 'sentry', action: 'sentry', label: 'Sentry' },
  { id: 'moveTo', action: 'moveTo', label: 'Move To' },
  { id: 'explore', action: 'explore', label: 'Explore' },
  { id: 'goHome', action: 'goHome', label: 'Go Home' },
  { id: 'clearOrders', action: 'clearOrders', label: 'Clear Orders' },
  { id: 'hold', action: 'hold', label: 'Hold Position' },
] as const satisfies readonly { id: string; action: ActionId; label: string }[];

export type GroupOrderId = (typeof GROUP_ORDERS)[number]['id'];

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** The (unwrapped) square under a point of the map canvas; y and, on flat maps, x are kept inside the map. */
export function rawSquareAt(cam: Camera, mapW: number, mapH: number, wrap: boolean, sx: number, sy: number): Pos {
  const x = Math.floor(cam.x + sx / cam.tile);
  const y = Math.floor(cam.y + sy / cam.tile);
  return {
    x: wrap ? x : Math.min(mapW - 1, Math.max(0, x)),
    y: Math.min(mapH - 1, Math.max(0, y)),
  };
}

/** The box between two dragged squares; never wider than the map. */
export function boxBetween(a: Pos, b: Pos, mapW: number): GroupBox {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.min(Math.max(a.x, b.x), x0 + mapW - 1);
  return { x0, x1, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
}

export function inBox(box: GroupBox, mapW: number, p: Pos): boolean {
  if (p.y < box.y0 || p.y > box.y1) return false;
  return mod(p.x - box.x0, mapW) <= box.x1 - box.x0;
}

/**
 * Your units caught by the box: everything standing on a square inside it (in a city too), except units aboard a
 * ship, which are caught only when awake (no orders), since a sentried passenger is deliberately left alone.
 */
export function unitsInBox(view: PlayerView, box: GroupBox): Unit[] {
  return view.myUnits
    .filter((u) => inBox(box, view.width, u) && (u.carriedBy === null || u.orders === null))
    .sort((a, b) => a.id - b.id);
}

/** The units of `units` (looked up afresh in `view`) for which this group order is available. */
export function eligibleFor(view: PlayerView, units: readonly number[], order: GroupOrderId): Unit[] {
  const action = GROUP_ORDERS.find((o) => o.id === order)!.action;
  return units
    .map((id) => view.myUnits.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined && availableActions(view, u)[action]);
}
