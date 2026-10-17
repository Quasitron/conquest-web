import {
  UNIT_STATS, chebyshev, findFrontier, findPath, neighbors, pathMapFromView,
  type City, type MapLike, type PlayerView, type Pos, type Unit, type UnitType,
} from '../engine';
import type { SessionCommand } from '../app/session';
import { cityIsCoastal } from '../ui/labels';
import { landingPlan } from '../ui/plans';
import { dirTo } from '../ui/targets';

/**
 * The basic computer opponent (stage 1). It sees only its own PlayerView and answers one command at a time:
 * the turn driver calls `nextAction` over and over, applying each command, until it returns null.
 *
 * What it does: cities build armies (the port city builds a transport once the game is under way); armies explore,
 * march on the nearest known foreign city and attack it; idle armies gather in the port; a transport with enough
 * armies waiting sails off exploring, heads for the nearest reachable foreign city, and lands its armies beside it.
 */
export interface AiMemo {
  /** Commands issued this turn per unit ('u<id>') or city ('c<id>'); a cap stops any loop. */
  tries: Map<string, number>;
}

export const newMemo = (): AiMemo => ({ tries: new Map() });

const MAX_TRIES = 4;
/** Armies that must be waiting in a port before its transport sails. */
const ARMIES_TO_SAIL = 3;
/** After this turn a transport settles for fewer armies, so a stalled game still moves. */
const LATE_TURN = 60;
const LATE_ARMIES_TO_SAIL = 2;

const geo = (v: PlayerView): MapLike => v as unknown as MapLike;

function bump(memo: AiMemo, key: string): boolean {
  const n = memo.tries.get(key) ?? 0;
  if (n >= MAX_TRIES) return false;
  memo.tries.set(key, n + 1);
  return true;
}

const at = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

/** The own coastal city with the lowest id: where armies gather and transports sail from. */
export function portCity(view: PlayerView): City | null {
  const coastal = view.myCities.filter((c) => cityIsCoastal(view, c)).sort((a, b) => a.id - b.id);
  return coastal[0] ?? null;
}

function transportsOwnedOrBuilding(view: PlayerView): number {
  return view.myUnits.filter((u) => u.type === 'transport').length
    + view.myCities.filter((c) => c.production === 'transport').length;
}

/** Armies asleep in one of our cities with nothing left to do on foot: they are waiting for a ship. */
function idleArmies(view: PlayerView): number {
  return view.myUnits.filter(
    (u) => u.type === 'army' && u.carriedBy === null && u.orders?.kind === 'sentry'
      && view.myCities.some((c) => at(c, u)),
  ).length;
}

/**
 * What a city should be building: armies, except that the port builds a transport once armies have run out of
 * land to conquer (some are idle in a city) and no transport exists or is on the way.
 */
export function wantedProduction(view: PlayerView, city: City, port: City | null): UnitType {
  const wanted = 1 + Math.floor(view.myCities.length / 8);
  if (port && city.id === port.id && idleArmies(view) >= 1) {
    const others = transportsOwnedOrBuilding(view) - (city.production === 'transport' ? 1 : 0);
    if (others < wanted) return 'transport';
  }
  return 'army';
}

/**
 * Walking (or sailing) distances from `u` over the squares it can enter on what it knows: land and own cities for
 * armies, water and own cities for ships. Squares with an enemy seen this turn are walls.
 */
function reach(view: PlayerView, u: Unit): Map<number, number> {
  const domain = UNIT_STATS[u.type].domain;
  const w = view.width;
  const own = new Set(view.myCities.map((c) => c.y * w + c.x));
  const foes = new Set(view.enemies.filter((e) => e.turnSeen === view.turn).map((e) => e.y * w + e.x));
  const ok = (i: number): boolean => {
    const t = view.terrain[i];
    if (t === null || foes.has(i)) return false;
    if (own.has(i)) return true;
    return domain === 'land' ? t === 'land' : domain === 'sea' ? t === 'water' : true;
  };
  const dist = new Map<number, number>([[u.y * w + u.x, 0]]);
  let level = [u.y * w + u.x];
  while (level.length > 0) {
    const next: number[] = [];
    for (const i of level) {
      const x = i % w;
      const y = (i - x) / w;
      for (const n of neighbors(geo(view), x, y)) {
        const j = n.y * w + n.x;
        if (dist.has(j) || !ok(j)) continue;
        dist.set(j, dist.get(i)! + 1);
        next.push(j);
      }
    }
    level = next;
  }
  return dist;
}

/** The square beside the nearest foreign city that `u` can get to (at least one step away), or null. */
function nearestApproach(view: PlayerView, u: Unit): Pos | null {
  const dist = reach(view, u);
  let best: { sq: Pos; d: number } | null = null;
  for (const c of view.knownCities) {
    if (c.owner === view.me) continue;
    for (const n of neighbors(geo(view), c.x, c.y)) {
      const d = dist.get(n.y * view.width + n.x);
      if (d !== undefined && d > 0 && (best === null || d < best.d)) best = { sq: n, d };
    }
  }
  return best ? best.sq : null;
}

/** Known cities that are not ours, nearest first. */
function foreignCities(view: PlayerView, from: Pos) {
  return view.knownCities
    .filter((c) => c.owner !== view.me)
    .sort((a, b) => chebyshev(geo(view), from, a) - chebyshev(geo(view), from, b) || a.id - b.id);
}

function nearestOwnCity(view: PlayerView, from: Pos, coastalOnly: boolean): City | null {
  return view.myCities
    .filter((c) => !coastalOnly || cityIsCoastal(view, c))
    .sort((a, b) => chebyshev(geo(view), from, a) - chebyshev(geo(view), from, b) || a.id - b.id)[0] ?? null;
}

const setOrders = (u: Unit, orders: Extract<SessionCommand, { type: 'setOrders' }>['orders']): SessionCommand =>
  ({ type: 'setOrders', unitId: u.id, orders });

/** Sends `u` to `target` by Go-to when a path exists, else null. */
function goTo(view: PlayerView, u: Unit, target: Pos): SessionCommand | null {
  if (at(u, target)) return null;
  const path = findPath(pathMapFromView(view), u, target);
  return path !== null && path.length > 0 ? setOrders(u, { kind: 'goto', target }) : null;
}

function decideArmy(view: PlayerView, u: Unit, port: City | null): SessionCommand | null {
  // Just put ashore from a transport: step onto land beside it.
  if (u.carriedBy !== null) {
    const ship = view.myUnits.find((s) => s.id === u.carriedBy);
    const step = ship ? landingPlan(view, ship, [u.id])[0] : undefined;
    return step ? { type: 'move', unitId: u.id, dir: step.dir } : null;
  }
  // A foreign city next door: attack it.
  const next = view.knownCities.find((c) => c.owner !== view.me && chebyshev(geo(view), u, c) === 1);
  if (next) {
    const dir = dirTo(view, u, next);
    if (dir !== null) return { type: 'move', unitId: u.id, dir };
  }
  // A visible enemy on land next door: attack it.
  const foe = view.enemies.find(
    (e) => e.visibleNow && chebyshev(geo(view), u, e) === 1 && view.terrain[e.y * view.width + e.x] === 'land',
  );
  if (foe) {
    const dir = dirTo(view, u, foe);
    if (dir !== null) return { type: 'move', unitId: u.id, dir };
  }
  // March on the nearest foreign city we can reach on foot.
  const approach = nearestApproach(view, u);
  if (approach) return setOrders(u, { kind: 'goto', target: approach });
  // Uncover more of the map.
  if (findFrontier(pathMapFromView(view), u) !== null) return setOrders(u, { kind: 'explore' });
  // Nothing to do: wait in the port for a transport (or in the nearest city).
  const home = port ?? nearestOwnCity(view, u, false);
  if (home && !at(u, home)) {
    const go = goTo(view, u, home);
    if (go) return go;
  }
  return setOrders(u, { kind: 'sentry' });
}

function decideTransport(view: PlayerView, u: Unit): SessionCommand | null {
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id);
  const inCity = view.myCities.some((c) => at(c, u));
  if (inCity) {
    const waiting = view.myUnits.filter((a) => a.type === 'army' && a.carriedBy === null && at(a, u)).length;
    const need = view.turn >= LATE_TURN ? LATE_ARMIES_TO_SAIL : ARMIES_TO_SAIL;
    const ready = cargo.length === 0 && waiting >= need;
    return ready ? setOrders(u, { kind: 'explore' }) : null;
  }
  if (cargo.length > 0) {
    const nextToCity = view.knownCities.some((c) => c.owner !== view.me && chebyshev(geo(view), u, c) <= 1);
    // Sleeping cargo next to a foreign city: wake it so the armies can step ashore.
    if (nextToCity && cargo.some((a) => a.orders !== null)) return { type: 'unload', transportId: u.id, unitIds: null };
    if (nextToCity) return null;
    const approach = nearestApproach(view, u);
    if (approach) return setOrders(u, { kind: 'goto', target: approach });
    if (findFrontier(pathMapFromView(view), u) !== null) return setOrders(u, { kind: 'explore' });
  }
  // Empty, or nowhere to go: return to a port.
  const home = nearestOwnCity(view, u, true);
  return home ? goTo(view, u, home) : null;
}

function decide(view: PlayerView, u: Unit, port: City | null): SessionCommand | null {
  switch (u.type) {
    case 'army': return decideArmy(view, u, port);
    case 'transport': return decideTransport(view, u);
    default: return null; // the basic AI builds nothing else yet
  }
}

/** The next command for the player `view` belongs to, or null when its turn is done. */
export function nextAction(view: PlayerView, memo: AiMemo): SessionCommand | null {
  if (view.over) return null;
  const port = portCity(view);

  for (const city of view.myCities) {
    const want = wantedProduction(view, city, port);
    // Never abandon a build that is well along; switch only early in one.
    const switchable = city.production === null || (city.production !== want && city.progress <= 2);
    if (switchable && city.production !== want && bump(memo, `c${city.id}`)) {
      return { type: 'setProduction', cityId: city.id, unitType: want };
    }
  }

  const ready = view.myUnits
    .filter((u) => u.movesLeft > 0 && u.orders === null)
    .sort((a, b) => a.id - b.id);
  for (const u of ready) {
    if ((memo.tries.get(`u${u.id}`) ?? 0) >= MAX_TRIES) continue;
    const cmd = decide(view, u, port);
    if (cmd && bump(memo, `u${u.id}`)) return cmd;
  }
  return null;
}
