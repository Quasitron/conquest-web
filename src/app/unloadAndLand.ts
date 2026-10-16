import type { GameSession } from './session';
import { landingPlan } from '../ui/plans';

/**
 * Unloads `ids` (null = all cargo) from a transport. At sea the armies that can step ashore then
 * land, one move each along the landing plan; in an own city the engine releases them itself.
 * Returns how many left the transport and how many are still aboard, or the first error.
 */
export function unloadAndLand(
  session: GameSession, transportId: number, ids: number[] | null,
): { landed: number; aboard: number } | string {
  const start = session.view();
  const first = start.myUnits.find((u) => u.id === transportId);
  if (!first) return 'no such unit';
  const chosen = new Set(ids ?? start.myUnits.filter((u) => u.carriedBy === transportId).map((u) => u.id));
  // A transport on a goto would otherwise sail on at the next turn change.
  if (first.orders !== null) {
    const err = session.act({ type: 'setOrders', unitId: transportId, orders: null });
    if (err) return err;
  }
  const unloadErr = session.act({ type: 'unload', transportId, unitIds: ids });
  if (unloadErr) return unloadErr;

  const view = session.view();
  const transport = view.myUnits.find((u) => u.id === transportId);
  if (!transport) return 'no such unit';
  const inCity = view.myCities.some((c) => c.x === transport.x && c.y === transport.y);
  if (!inCity) {
    for (const step of landingPlan(view, transport, [...chosen])) {
      const err = session.act({ type: 'move', unitId: step.unitId, dir: step.dir });
      if (err) return err;
    }
  }
  const after = session.view().myUnits;
  return {
    landed: after.filter((u) => chosen.has(u.id) && u.carriedBy === null).length,
    aboard: after.filter((u) => u.carriedBy === transportId).length,
  };
}
