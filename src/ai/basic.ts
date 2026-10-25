import {
  CITY_STRENGTH_HITS, UNIT_STATS, chebyshev, combatWinChance, garrisonBonus, hitsOf, findFrontier, findPath, neighbors, pathMapFromView,
  type City, type MapLike, type PlayerId, type PlayerView, type Pos, type Unit, type UnitType,
} from '../engine';
import type { SessionCommand } from '../app/session';
import { cityIsCoastal } from '../ui/labels';
import { cityBombardChance, landingPlan } from '../ui/plans';
import { dirTo } from '../ui/targets';
import { leftIdle, tuningFor, type AiTuning, type Difficulty } from './difficulty';

/**
 * The basic computer opponent (stage 1). It sees only its own PlayerView and answers one command at a time:
 * the turn driver calls `nextAction` over and over, applying each command, until it returns null.
 *
 * What it does: cities build armies (the port city builds a transport once armies have run out of land); armies
 * explore, march on the nearest known foreign city and attack it; idle armies gather in the port; a transport with
 * enough armies waiting sails off exploring, heads for the nearest reachable foreign city, and lands its armies.
 * Sea power (stage 2): coastal cities also build a small fleet of warships. Warships attack enemy ships next to
 * them, hunt ones seen lately, go home to repair when hurt, and otherwise patrol toward the enemy.
 */
export interface AiMemo {
  /** Commands issued this turn per unit ('u<id>') or city ('c<id>'); a cap stops any loop. */
  tries: Map<string, number>;
  /** How this player plays (see difficulty.ts). */
  tuning: AiTuning;
}

export const newMemo = (difficulty?: Difficulty): AiMemo => ({ tries: new Map(), tuning: tuningFor(difficulty) });

const MAX_TRIES = 4;
/** After this turn the AI settles for smaller forces, so a stalled game still moves. */
const LATE_TURN = 60;

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

const WARSHIPS: readonly UnitType[] = ['destroyer', 'cruiser', 'battleship'];
const isWarship = (t: UnitType | null): boolean => t !== null && WARSHIPS.includes(t);
/** An enemy ship seen within this many turns means the sea matters. */
const SEA_MEMORY = 10;

function warshipsOwnedOrBuilding(view: PlayerView): number {
  return view.myUnits.filter((u) => isWarship(u.type)).length
    + view.myCities.filter((c) => isWarship(c.production)).length;
}

/**
 * Whether the sea matters: armies have run out of land to conquer (some wait idle in a city, so the rest of the
 * war is across the water), or enemy ships were sighted lately. On a map where both sides share a continent
 * neither happens and no production is wasted on ships.
 */
function seaMatters(view: PlayerView): boolean {
  return idleArmies(view) >= 1
    || view.enemies.some((e) => UNIT_STATS[e.type].domain === 'sea' && e.turnSeen >= view.turn - SEA_MEMORY);
}

/** How many warships the fleet should hold: one more per couple of cities, up to a cap (none while the sea is quiet). */
function wantedWarships(view: PlayerView, t: AiTuning): number {
  if (view.turn < t.fleetFromTurn || !seaMatters(view)) return 0;
  return Math.min(t.maxWarships, 1 + Math.floor(view.myCities.length / t.citiesPerWarship));
}

/** Heavier ships as the empire grows. */
function warshipFor(view: PlayerView): UnitType {
  const n = view.myCities.length;
  return n >= 8 ? 'battleship' : n >= 4 ? 'cruiser' : 'destroyer';
}

/**
 * What a city should be building: armies, except that the port builds a transport once armies have run out of
 * land to conquer (some are idle in a city) and no transport exists or is on the way, and coastal cities build
 * warships until the fleet is as big as it should be (the port only once it has a transport).
 */
export function wantedProduction(view: PlayerView, city: City, port: City | null, t: AiTuning = tuningFor('normal')): UnitType {
  const wanted = 1 + Math.floor(view.myCities.length / 8);
  if (port && city.id === port.id && idleArmies(view) >= 1) {
    const others = transportsOwnedOrBuilding(view) - (city.production === 'transport' ? 1 : 0);
    if (others < wanted) return 'transport';
  }
  if (cityIsCoastal(view, city)) {
    const ships = warshipsOwnedOrBuilding(view) - (isWarship(city.production) ? 1 : 0);
    const portReady = city.id !== port?.id || view.myUnits.some((u) => u.type === 'transport');
    if (portReady && ships < wantedWarships(view, t)) return warshipFor(view);
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

/** Armies within this many squares of a city count as part of an assault on it. */
const RALLY_RADIUS = 3;
/** Cities with a visible enemy land unit this close keep their garrison at home. */
const THREAT_RANGE = 4;
/** An enemy-held city this close to one of our cities is a threat (or a loss) and is dealt with first. */
const HOME_RANGE = 6;

const landArmies = (view: PlayerView): Unit[] =>
  view.myUnits.filter((a) => a.type === 'army' && a.carriedBy === null);

/** Own armies on foot within `radius` of `p`. */
function armiesNear(view: PlayerView, p: Pos, radius: number): number {
  return landArmies(view).filter((a) => chebyshev(geo(view), a, p) <= radius).length;
}

/** A visible enemy land unit close to the city: keep the garrison at home. */
function threatened(view: PlayerView, city: Pos): boolean {
  return view.enemies.some(
    (e) => e.visibleNow && UNIT_STATS[e.type].domain === 'land' && chebyshev(geo(view), city, e) <= THREAT_RANGE,
  );
}

/** Armies needed beside a held city before the assault: fewer when we have fewer, and later in a stalled game. */
function assaultSize(view: PlayerView, t: AiTuning): number {
  const cap = view.turn >= LATE_TURN ? t.lateAssaultArmies : t.assaultArmies;
  return Math.max(1, Math.min(cap, landArmies(view).length));
}

/**
 * Extra armies to mass before assaulting a held city when the city defence house rules are on: one for each hit it
 * still has to take beyond the first, and one for each land unit we can see inside (up to the +2 they can add). Never
 * more than the armies we have, so the wait ends.
 */
function extraForCityRules(view: PlayerView, city: { x: number; y: number; owner: PlayerId | null; damage: number }): number {
  let extra = 0;
  if (view.rules.cityStrength) extra += Math.max(0, CITY_STRENGTH_HITS - city.damage - 1);
  if (view.rules.garrisonsDefend) {
    const inside = view.enemies.filter((e) => e.visibleNow && e.owner === city.owner && e.x === city.x && e.y === city.y
      && UNIT_STATS[e.type].domain === 'land').length;
    extra += garrisonBonus(inside);
  }
  return Math.min(extra, Math.max(0, landArmies(view).length - 1));
}

/**
 * The foreign city this army marches on and the square beside it to head for: the nearest by walking distance,
 * but a city where our armies are already massing is preferred, and so is an enemy-held city near our own
 * (a city we lost, or one that threatens us).
 */
function armyTarget(view: PlayerView, u: Unit): { city: { id: number; x: number; y: number; owner: PlayerId | null }; sq: Pos } | null {
  const dist = reach(view, u);
  let best: { city: { id: number; x: number; y: number; owner: PlayerId | null }; sq: Pos; cost: number } | null = null;
  for (const c of view.knownCities) {
    if (c.owner === view.me) continue;
    let sq: Pos | null = null;
    let d = Infinity;
    for (const n of neighbors(geo(view), c.x, c.y)) {
      const dn = dist.get(n.y * view.width + n.x);
      if (dn !== undefined && dn > 0 && dn < d) { d = dn; sq = n; }
    }
    if (!sq) continue;
    let cost = d - 2 * (armiesNear(view, c, RALLY_RADIUS) - (chebyshev(geo(view), u, c) <= RALLY_RADIUS ? 1 : 0));
    if (c.owner !== null && view.myCities.some((m) => chebyshev(geo(view), m, c) <= HOME_RANGE)) cost -= 4;
    if (best === null || cost < best.cost) best = { city: c, sq, cost };
  }
  return best;
}

function decideArmy(view: PlayerView, u: Unit, port: City | null, t: AiTuning): SessionCommand | null {
  // Just put ashore from a transport: step onto land beside it.
  if (u.carriedBy !== null) {
    const ship = view.myUnits.find((s) => s.id === u.carriedBy);
    const step = ship ? landingPlan(view, ship, [u.id])[0] : undefined;
    return step ? { type: 'move', unitId: u.id, dir: step.dir } : null;
  }
  // Enemy land units near our city: the last defenders stay (doing nothing, so they are looked at again next turn).
  const here = view.myCities.find((c) => at(c, u));
  if (here && threatened(view, here)) {
    const inside = landArmies(view).filter((a) => at(a, here)).map((a) => a.id).sort((a, b) => a - b);
    if (inside.indexOf(u.id) < t.garrison) return null;
  }
  // A foreign city next door: attack it, a held one only once enough armies stand ready (a lone army has poor odds).
  const next = view.knownCities.find((c) => c.owner !== view.me && chebyshev(geo(view), u, c) === 1);
  if (next) {
    if (next.owner !== null && armiesNear(view, next, RALLY_RADIUS) < assaultSize(view, t) + extraForCityRules(view, next)) return null;
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
  const target = armyTarget(view, u);
  if (target) return setOrders(u, { kind: 'goto', target: target.sq });
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

function decideTransport(view: PlayerView, u: Unit, t: AiTuning): SessionCommand | null {
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id);
  const inCity = view.myCities.some((c) => at(c, u));
  if (inCity) {
    const waiting = view.myUnits.filter((a) => a.type === 'army' && a.carriedBy === null && at(a, u)).length;
    const need = view.turn >= LATE_TURN ? t.lateArmiesToSail : t.armiesToSail;
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

/** Chance that our ship wins a fight against a ship of `type` (its damage is unknown, so assumed none). */
function winChance(u: Unit, type: UnitType, foeRank = 0): number {
  const a = UNIT_STATS[u.type];
  const d = UNIT_STATS[type];
  return combatWinChance(
    { attack: a.attack, shot: a.shot, hits: hitsOf(u), damage: u.damage },
    { defense: d.defense, shot: d.shot, hits: d.hits + (foeRank === 3 ? 1 : 0), damage: 0 },
  );
}

/** Enemy ships we know of (anything afloat that is not ours), most recently seen first. */
function enemyShips(view: PlayerView) {
  return view.enemies
    .filter((e) => UNIT_STATS[e.type].domain === 'sea')
    .sort((a, b) => b.turnSeen - a.turnSeen);
}

/** How long ago (in turns) an enemy sighting may be and still be worth sailing to. */
const HUNT_MEMORY = 2;
/** Farthest (in squares) a warship goes after a sighting. */
const HUNT_RANGE = 14;
/** A patrol runs out this far from where the ship starts it, at most. */
const PATROL_MIN = 4;
const PATROL_MAX = 8;

/** A water square a patrol can run out to, leaning toward the nearest enemy (or unowned) city; null if none. */
function patrolEnd(view: PlayerView, u: Unit): Pos | null {
  const dist = reach(view, u);
  const enemy = view.knownCities.filter((c) => c.owner !== null && c.owner !== view.me);
  const goals = enemy.length > 0 ? enemy : view.knownCities.filter((c) => c.owner !== view.me);
  let best: { sq: Pos; score: number } | null = null;
  for (const [i, d] of dist) {
    if (d < PATROL_MIN || d > PATROL_MAX) continue;
    const sq = { x: i % view.width, y: Math.floor(i / view.width) };
    if (view.myCities.some((c) => at(c, sq))) continue;
    const score = goals.length > 0 ? Math.min(...goals.map((g) => chebyshev(geo(view), sq, g))) : 0;
    if (best === null || score < best.score || (score === best.score && i < best.sq.y * view.width + best.sq.x)) {
      best = { sq, score };
    }
  }
  return best ? best.sq : null;
}

function decideWarship(view: PlayerView, u: Unit, t: AiTuning): SessionCommand | null {
  const inCity = view.myCities.some((c) => at(c, u));
  const ships = enemyShips(view);

  // An enemy ship right beside us that we are likely to beat (or that is alone and easy): attack it.
  const adjacent = ships.find((e) => e.visibleNow && chebyshev(geo(view), u, e) === 1);
  if (adjacent && winChance(u, adjacent.type, adjacent.rank ?? 0) >= t.minShipWinChance) {
    const dir = dirTo(view, u, adjacent);
    if (dir !== null) return { type: 'move', unitId: u.id, dir };
  }

  // City strength rule: a healthy bombarding ship beside an enemy player's city fires on it while that can still wear it down.
  if (view.rules.cityStrength && UNIT_STATS[u.type].bombard && u.damage === 0 && u.movesLeft > 0) {
    const city = view.knownCities.find((c) => c.owner !== null && c.owner !== view.me
      && chebyshev(geo(view), u, c) === 1 && c.damage < CITY_STRENGTH_HITS - 1);
    if (city && cityBombardChance(view, u, city.damage, 0) >= t.minShipWinChance) {
      const dir = dirTo(view, u, city);
      if (dir !== null) return { type: 'move', unitId: u.id, dir };
    }
  }

  // Hurt: repair in port (sleeping until it is fit again), going there first when it is at sea.
  if (u.damage > 0) {
    if (inCity) return setOrders(u, { kind: 'repair' });
    const home = nearestOwnCity(view, u, true);
    return home && goTo(view, u, home) ? { type: 'goHome', unitId: u.id, repair: true } : null;
  }

  // A ship was seen lately within reach: sail to the square beside it.
  const dist = reach(view, u);
  let target: { sq: Pos; d: number } | null = null;
  for (const e of ships) {
    if (e.turnSeen < view.turn - HUNT_MEMORY) continue;
    for (const n of neighbors(geo(view), e.x, e.y)) {
      const d = dist.get(n.y * view.width + n.x);
      if (d !== undefined && d > 0 && d <= HUNT_RANGE && (target === null || d < target.d)) target = { sq: n, d };
    }
  }
  if (target) return setOrders(u, { kind: 'goto', target: target.sq });

  // Otherwise keep watch: patrol out to sea toward the enemy and back.
  const end = patrolEnd(view, u);
  if (end) return setOrders(u, { kind: 'patrol', a: { x: u.x, y: u.y }, b: end, toB: true });
  return null;
}

function decide(view: PlayerView, u: Unit, port: City | null, t: AiTuning): SessionCommand | null {
  switch (u.type) {
    case 'army': return decideArmy(view, u, port, t);
    case 'transport': return decideTransport(view, u, t);
    case 'destroyer':
    case 'cruiser':
    case 'battleship': return decideWarship(view, u, t);
    default: return null; // fighters, submarines and carriers are not built yet
  }
}

/** The next command for the player `view` belongs to, or null when its turn is done. */
export function nextAction(view: PlayerView, memo: AiMemo): SessionCommand | null {
  if (view.over) return null;
  const port = portCity(view);

  for (const city of view.myCities) {
    const want = wantedProduction(view, city, port, memo.tuning);
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
    if (leftIdle(u.id, view.turn, memo.tuning.idlePercent)) continue; // not this turn (Easy)
    const cmd = decide(view, u, port, memo.tuning);
    if (cmd && bump(memo, `u${u.id}`)) return cmd;
  }
  return null;
}
