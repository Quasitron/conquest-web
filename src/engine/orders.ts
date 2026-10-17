import type { City, GameEvent, GameState, Orders, OrdersEndReason, PlayerId, Pos, Unit } from './types';
import type { RandomSource } from './rng';
import { UNIT_STATS, cargoCapacity } from './units';
import { chebyshev, index, isCoastal } from './map';
import { cargoOf, cityAt, isAtRefuelPoint, topLevelUnitsAt } from './query';
import { areFriendly } from './relations';
import { canPlayerSeeUnit, updateFog } from './fog';
import { moveUnit } from './movement';
import { unloadCargo } from './cargo';
import { aircraftCanReach, dirBetween, findFrontier, findPath, pathMapFromState } from './path';
import { pickUpRoute } from './routes';

const NO_AIR_EXPLORE = 'aircraft cannot explore yet';
const NO_PATROL_BASE = 'patrol must start or end at a city or carrier';

/** True when `p` holds an own city, or an own carrier with room for one more aircraft (or u aboard it). */
function isRefuelBase(s: GameState, u: Unit, p: Pos): boolean {
  if (cityAt(s, p.x, p.y)?.owner === u.owner) return true;
  return topLevelUnitsAt(s, p.x, p.y).some(
    (c) =>
      c.owner === u.owner && UNIT_STATS[c.type].carries === u.type &&
      (u.carriedBy === c.id || cargoOf(s, c).length < cargoCapacity(c)),
  );
}

/** The patrol end an aircraft refuels at: a if it holds an own city or usable own carrier, else b, else null. */
export function patrolBase(s: GameState, u: Unit, o: { a: Pos; b: Pos }): Pos | null {
  if (isRefuelBase(s, u, o.a)) return o.a;
  if (isRefuelBase(s, u, o.b)) return o.b;
  return null;
}

function validSquare(s: GameState, u: Unit, p: unknown): p is Pos {
  if (typeof p !== 'object' || p === null) return false;
  const { x, y } = p as Pos;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= s.width || y < 0 || y >= s.height) return false;
  return s.fog[u.owner].explored[index(s, x, y)] === 1;
}

/** Returns an error message, or null when `u` may be given `o`. */
export function validateOrders(s: GameState, u: Unit, o: Orders): string | null {
  const air = UNIT_STATS[u.type].domain === 'air';
  if (typeof o !== 'object' || o === null) return 'unknown orders';
  switch (o.kind) {
    case 'sentry':
      if (air && !isAtRefuelPoint(s, u)) return 'aircraft can only sentry in a city or on a carrier';
      return null;
    case 'explore':
      return air ? NO_AIR_EXPLORE : null;
    case 'goto': {
      if (!validSquare(s, u, o.target)) return 'target is not an explored square';
      if (o.target.x === u.x && o.target.y === u.y) return 'already there';
      const map = pathMapFromState(s, u.owner);
      const path = findPath(map, u, o.target);
      if (path === null) return 'no known path';
      if (air && !aircraftCanReach(map, path.length, u.fuel ?? 0, o.target)) return 'out of range';
      return null;
    }
    case 'patrol': {
      if (!validSquare(s, u, o.a) || !validSquare(s, u, o.b)) return 'target is not an explored square';
      if (o.a.x === o.b.x && o.a.y === o.b.y) return 'patrol ends must differ';
      const map = pathMapFromState(s, u.owner);
      const target = o.toB ? o.b : o.a;
      const path = findPath(map, u, target);
      if (path === null) return 'no known path';
      if (!air) return null;
      const base = patrolBase(s, u, o);
      if (base === null) return NO_PATROL_BASE;
      const far = base === o.a ? o.b : o.a;
      const leg = findPath(map, { type: u.type, x: base.x, y: base.y }, far);
      if (leg === null || 2 * leg.length > (UNIT_STATS[u.type].range ?? 0)) return 'out of range';
      const need = path.length + (target === far ? leg.length : 0);
      return need > (u.fuel ?? 0) ? 'out of range' : null;
    }
    default:
      return 'unknown orders';
  }
}

/** The nearest own city by path length (lowest id on ties); ships only use coastal cities. */
export function chooseHome(s: GameState, u: Unit): { city: City; steps: number } | null {
  const map = pathMapFromState(s, u.owner);
  const st = UNIT_STATS[u.type];
  let best: { city: City; steps: number } | null = null;
  for (const city of [...s.cities].sort((a, b) => a.id - b.id)) {
    if (city.owner !== u.owner) continue;
    if (st.domain === 'sea' && !isCoastal(s, city.x, city.y)) continue;
    const path = findPath(map, u, city);
    if (path === null) continue;
    if (st.domain === 'air' && path.length > (u.fuel ?? 0)) continue;
    if (best === null || path.length < best.steps) best = { city, steps: path.length };
  }
  return best;
}

function endOrders(u: Unit, reason: OrdersEndReason, events: GameEvent[]): void {
  u.orders = null;
  u.blockedTurns = 0;
  events.push({ type: 'ordersEnded', unitId: u.id, owner: u.owner, reason });
}

/** True when a visible enemy unit stands next to `u`. */
function enemyAdjacent(s: GameState, u: Unit): boolean {
  return s.units.some(
    (e) => !areFriendly(s, e.owner, u.owner) && chebyshev(s, e, u) <= 1 && canPlayerSeeUnit(s, u.owner, e),
  );
}

/** Ids of known cities next to u that are not its own (neutral or enemy), as the owner knows them. */
function adjacentForeignCities(s: GameState, u: Unit): Set<number> {
  const fog = s.fog[u.owner];
  const out = new Set<number>();
  for (const c of s.cities) {
    if (chebyshev(s, u, c) > 1 || !fog.explored[index(s, c.x, c.y)]) continue;
    const owner = c.owner === u.owner ? u.owner : (fog.knownCityOwner[c.id] ?? null);
    if (!areFriendly(s, owner, u.owner)) out.add(c.id);
  }
  return out;
}

/**
 * True when a land or sea unit would have to stop on p: an own unit stands there, it is not a city,
 * and no own host there has room for u. Aircraft may pass over.
 */
function ownBlocks(s: GameState, u: Unit, p: Pos): boolean {
  if (UNIT_STATS[u.type].domain === 'air' || cityAt(s, p.x, p.y)) return false;
  const here = topLevelUnitsAt(s, p.x, p.y).filter((o) => o.owner === u.owner && o !== u);
  if (here.length === 0) return false;
  return !here.some((h) => UNIT_STATS[h.type].carries === u.type && cargoOf(s, h).length < cargoCapacity(h));
}

/**
 * Runs a unit's moving orders (goto, patrol, explore) until it is out of moves or they end. Never attacks.
 * turnStart is true when called from the start-of-turn run: only then does a blocked wait count.
 */
export function executeOrders(
  s: GameState, rng: RandomSource, u: Unit, events: GameEvent[], turnStart = false,
): void {
  const arrive = (): void => {
    if (UNIT_STATS[u.type].carries === 'army' && cityAt(s, u.x, u.y)?.owner === u.owner) {
      unloadCargo(s, u, null, events); // 'nothing to unload' is fine
    }
    if (u.carriedBy !== null) {
      // Boarding already made the unit a sentry; keep that.
      events.push({ type: 'ordersEnded', unitId: u.id, owner: u.owner, reason: 'arrived' });
      return;
    }
    const sentry = u.orders?.kind === 'goto' && u.orders.arrival === 'sentry';
    endOrders(u, 'arrived', events);
    if (sentry) u.orders = { kind: 'sentry' };
    else pickUpRoute(s, u);
  };

  for (;;) {
    const o = u.orders;
    if (!s.units.includes(u) || o === null || o.kind === 'sentry' || u.movesLeft <= 0) return;
    if (o.kind === 'goto' && o.routeCity !== undefined) {
      const dest = s.cities.find((c) => c.id === o.routeCity);
      if (!dest || dest.owner !== u.owner) return endOrders(u, 'destinationLost', events);
    }
    const map = pathMapFromState(s, u.owner);
    const target = o.kind === 'goto' ? o.target : o.kind === 'patrol' ? (o.toB ? o.b : o.a) : findFrontier(map, u);
    if (target === null) return endOrders(u, 'nothingToExplore', events);
    if (u.x === target.x && u.y === target.y) {
      if (o.kind === 'goto') return arrive();
      if (o.kind === 'patrol') o.toB = !o.toB;
      continue;
    }
    if (o.kind === 'patrol' && u.fuel !== null) {
      // Aircraft: the base may be gone, or the fuel too low for the next leg plus the way back.
      const base = patrolBase(s, u, o);
      const toTarget = findPath(map, u, target);
      let need = Infinity;
      if (base !== null && toTarget !== null) {
        const far = base === o.a ? o.b : o.a;
        const leg = target === far ? findPath(map, { type: u.type, x: base.x, y: base.y }, far) : [];
        if (leg !== null) need = toTarget.length + leg.length;
      }
      if (need > u.fuel) {
        const home = chooseHome(s, u);
        if (home === null) return endOrders(u, 'lowFuel', events);
        u.orders = { kind: 'goto', target: { x: home.city.x, y: home.city.y } };
        u.blockedTurns = 0;
        events.push({ type: 'ordersEnded', unitId: u.id, owner: u.owner, reason: 'returning' });
        continue;
      }
    }
    const path = findPath(map, u, target);
    if (path === null || path.length === 0) return endOrders(u, 'blocked', events);
    if (u.fuel !== null && o.kind === 'goto' && !aircraftCanReach(map, path.length, u.fuel, target)) {
      return endOrders(u, 'lowFuel', events);
    }
    if (u.fuel !== null && o.kind !== 'goto' && path.length > u.fuel) return endOrders(u, 'lowFuel', events);
    let next = path[0];
    if (ownBlocks(s, u, next)) {
      const detour = findPath(pathMapFromState(s, u.owner, { blockOwn: true }), u, target);
      if (detour && detour.length > 0 && !ownBlocks(s, u, detour[0])) next = detour[0];
      else {
        if (turnStart) {
          u.blockedTurns += 1;
          if (u.blockedTurns >= (o.kind === 'goto' && o.wait ? o.wait : 3)) return endOrders(u, 'blocked', events);
        }
        return; // wait: orders kept
      }
    }
    const city = cityAt(s, next.x, next.y);
    if (
      (city && !areFriendly(s, city.owner, u.owner)) ||
      topLevelUnitsAt(s, next.x, next.y).some((x) => !areFriendly(s, x.owner, u.owner))
    ) {
      return endOrders(u, 'blocked', events);
    }
    const dir = dirBetween(s, u, next);
    const cityBefore = o.kind === 'explore' ? adjacentForeignCities(s, u) : null;
    if (dir === null || moveUnit(s, rng, u, dir, events) !== null) return endOrders(u, 'blocked', events);
    if (!s.units.includes(u)) return;
    if (o.kind === 'patrol' && u.carriedBy !== null) u.orders = o; // boarding made it a sentry; a patrol keeps flying
    u.blockedTurns = 0;
    updateFog(s, u.owner);
    if (o.kind === 'goto' && u.x === o.target.x && u.y === o.target.y) return arrive();
    if (u.carriedBy === null && enemyAdjacent(s, u)) return endOrders(u, 'enemySighted', events);
    if (cityBefore && [...adjacentForeignCities(s, u)].some((id) => !cityBefore.has(id))) {
      return endOrders(u, 'cityFound', events);
    }
  }
}

/** Wakes sentries (not cargo) that have a visible enemy next to them. */
export function wakeSentries(s: GameState, pid: PlayerId, events: GameEvent[]): void {
  for (const u of [...s.units]) {
    if (u.owner !== pid || u.orders?.kind !== 'sentry' || u.carriedBy !== null) continue;
    if (enemyAdjacent(s, u)) endOrders(u, 'enemySighted', events);
  }
}

/** Start-of-turn orders for one player: wake sentries, then run moving orders in unit-id order. */
export function runPlayerOrders(s: GameState, rng: RandomSource, pid: PlayerId, events: GameEvent[]): void {
  wakeSentries(s, pid, events);
  const ids = s.units
    .filter((u) => u.owner === pid && u.orders !== null && u.orders.kind !== 'sentry')
    .map((u) => u.id)
    .sort((a, b) => a - b);
  for (const id of ids) {
    const u = s.units.find((x) => x.id === id);
    if (u) executeOrders(s, rng, u, events, true);
  }
  updateFog(s, pid);
}

/** Validates, stores and (with moves left) immediately runs new orders. Shared by setOrders and goHome. */
export function giveOrders(
  s: GameState, rng: RandomSource, u: Unit, orders: Orders, events: GameEvent[],
): string | null {
  const error = validateOrders(s, u, orders);
  if (error) return error;
  u.orders = structuredClone(orders);
  u.blockedTurns = 0;
  u.unloadNextTurn = false;
  if (u.movesLeft > 0) executeOrders(s, rng, u, events);
  return null;
}
