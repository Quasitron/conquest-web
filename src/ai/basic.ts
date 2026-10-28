import {
  CITY_STRENGTH_HITS, UNIT_STATS, armorBlockedBy, cargoUsed, chebyshev, combatWinChance, garrisonBonus, hitsOf, findFrontier, findPath, neighbors, normalize, pathMapFromView,
  type City, type MapLike, type PlayerId, type PlayerView, type Pos, type Unit, type UnitType,
} from '../engine';
import type { SessionCommand } from '../app/session';
import { cityIsCoastal } from '../ui/labels';
import { cityBombChance, cityBombardChance, landingPlan, visibleGarrison } from '../ui/plans';
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

/** Land units that march and take cities: Armies and (with the Advanced units rule) Armor. */
const isFoot = (t: UnitType): boolean => t === 'army' || t === 'armor';

/** Armies asleep in one of our cities with nothing left to do on foot: they are waiting for a ship. */
function idleArmies(view: PlayerView): number {
  return view.myUnits.filter(
    (u) => isFoot(u.type) && u.carriedBy === null && u.orders?.kind === 'sentry'
      && view.myCities.some((c) => at(c, u)),
  ).length;
}

const WARSHIPS: readonly UnitType[] = ['destroyer', 'cruiser', 'battleship'];
const isWarship = (t: UnitType | null): boolean => t !== null && WARSHIPS.includes(t);
/** An enemy ship seen within this many turns means the sea matters. */
const SEA_MEMORY = 10;

/** Warships and submarines: the whole fleet, for deciding how many more to build. */
const isFleet = (t: UnitType | null): boolean => isWarship(t) || t === 'submarine';

function warshipsOwnedOrBuilding(view: PlayerView): number {
  return view.myUnits.filter((u) => isFleet(u.type)).length
    + view.myCities.filter((c) => isFleet(c.production)).length;
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
function warshipFor(view: PlayerView, t: AiTuning, ships: number, city: City): UnitType {
  // Hard: one ship in three hunts under water (counting the submarines owned or being built elsewhere).
  const subs = view.myUnits.filter((u) => u.type === 'submarine').length
    + view.myCities.filter((c) => c.id !== city.id && c.production === 'submarine').length;
  if (t.subs && subs < Math.floor((ships + 1) / 3)) return 'submarine';
  const n = view.myCities.length;
  return n >= 8 ? 'battleship' : n >= 4 ? 'cruiser' : 'destroyer';
}

/** Hard: fighters the carrier sails with, the empire it needs first, and how far its fighters patrol from it. */
const CARRIER_AIR = 2;
const CARRIER_FROM_CITIES = 5;
const CARRIER_FROM_TURN = 20;
const CARRIER_PATROL_RANGE = 7;

/** Whether the port should be building (or keep building) the one carrier: the fleet has begun, and no carrier exists. */
function wantsCarrier(view: PlayerView, city: City): boolean {
  if (view.myCities.length < CARRIER_FROM_CITIES || view.turn < CARRIER_FROM_TURN) return false;
  if (warshipsOwnedOrBuilding(view) < 1) return false;
  const carriers = view.myUnits.filter((u) => u.type === 'carrier').length
    + view.myCities.filter((c) => c.id !== city.id && c.production === 'carrier').length;
  return carriers === 0;
}
/** Hard builds one scouting fighter from this turn on, while there is unexplored map. */
const SCOUT_FROM_TURN = 4;

/** Whether `city` is the one that should build the scouting fighter: none exists or is being built, and this is the first non-port city. */
function isScoutCity(view: PlayerView, city: City, port: City | null): boolean {
  if (view.turn < SCOUT_FROM_TURN || !view.terrain.some((x) => x === null)) return false;
  const fighters = view.myUnits.filter((u) => u.type === 'fighter').length
    + view.myCities.filter((c) => c.id !== city.id && c.production === 'fighter').length;
  if (fighters > 0) return false;
  const first = [...view.myCities].sort((a, b) => a.id - b.id).find((c) => c.id !== port?.id) ?? view.myCities[0];
  return first !== undefined && first.id === city.id;
}
/** Hard (Advanced units rule): Bombers are built from this turn on, one for each ten cities (and one at four cities). */
const BOMBER_FROM_TURN = 25;
const BOMBER_FROM_CITIES = 4;
const BOMBER_MAX = 3;

function wantedBombers(view: PlayerView): number {
  if (view.turn < BOMBER_FROM_TURN || view.myCities.length < BOMBER_FROM_CITIES) return 0;
  return Math.min(BOMBER_MAX, 1 + Math.floor(view.myCities.length / 10));
}

/** Whether `city` is the one that builds the Bombers: the second city by id that is not the port (the first builds the scout). */
function isBomberCity(view: PlayerView, city: City, port: City | null): boolean {
  const owned = view.myUnits.filter((u) => u.type === 'bomber').length
    + view.myCities.filter((c) => c.id !== city.id && c.production === 'bomber').length;
  if (owned >= wantedBombers(view)) return false;
  const eligible = view.myCities.filter((c) => c.id !== port?.id).sort((a, b) => a.id - b.id);
  return eligible[1]?.id === city.id;
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
  if (t.carriers && port && city.id === port.id) {
    // The carrier takes the fighters waiting in its port when it sails, so the port builds them for it.
    const carrierHere = view.myUnits.some((u) => u.type === 'carrier' && at(u, city));
    const fightersHere = view.myUnits.filter((u) => u.type === 'fighter' && u.carriedBy === null && at(u, city)).length;
    if (carrierHere && fightersHere < CARRIER_AIR) return 'fighter';
    if (wantsCarrier(view, city)) return 'carrier';
  }
  if (t.scouts && isScoutCity(view, city, port)) return 'fighter';
  if (t.bombers && view.rules.advancedUnits && isBomberCity(view, city, port)) return 'bomber';
  if (cityIsCoastal(view, city)) {
    const ships = warshipsOwnedOrBuilding(view) - (isFleet(city.production) ? 1 : 0);
    const portReady = city.id !== port?.id || view.myUnits.some((u) => u.type === 'transport');
    if (portReady && ships < wantedWarships(view, t)) return warshipFor(view, t, ships, city);
  }
  // Hard builds Armor in every third city when the Advanced units rule is on, to crack held cities.
  if (t.armor && view.rules.advancedUnits && city.id % 3 === 0) return 'armor';
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
    if (u.type === 'armor' && view.rules.advancedUnits && armorBlockedBy(view.relief?.[i] ?? 'clear')) return false;
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
  view.myUnits.filter((a) => isFoot(a.type) && a.carriedBy === null);

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

/** A transport keeps this far from an enemy warship seen within the last few turns (its move plus its reach to attack). */
const DANGER_RADIUS = 3;
const DANGER_MEMORY = 3;

/** Sea squares near enemy warships (and submarines) seen lately: a Hard transport will not sail into them. */
function dangerSquares(view: PlayerView): Set<number> {
  const out = new Set<number>();
  for (const e of view.enemies) {
    if (UNIT_STATS[e.type].domain !== 'sea' || e.type === 'transport' || e.turnSeen < view.turn - DANGER_MEMORY) continue;
    for (let dy = -DANGER_RADIUS; dy <= DANGER_RADIUS; dy++) {
      for (let dx = -DANGER_RADIUS; dx <= DANGER_RADIUS; dx++) {
        const p = normalize(geo(view), e.x + dx, e.y + dy);
        if (p) out.add(p.y * view.width + p.x);
      }
    }
  }
  return out;
}

/**
 * The square two steps along the shortest sea path from `u` to `target` that keeps out of `danger` (or the target
 * itself when it is nearer), or null when there is no such path.
 */
function safeStep(view: PlayerView, u: Unit, target: Pos, danger: ReadonlySet<number>): Pos | null {
  const w = view.width;
  const own = new Set(view.myCities.map((c) => c.y * w + c.x));
  const start = u.y * w + u.x;
  const goal = target.y * w + target.x;
  if (start === goal) return null;
  const parent = new Map<number, number>([[start, -1]]);
  let level = [start];
  while (level.length > 0 && !parent.has(goal)) {
    const next: number[] = [];
    for (const i of level) {
      const x = i % w;
      const y = (i - x) / w;
      for (const n of neighbors(geo(view), x, y)) {
        const j = n.y * w + n.x;
        const terrain = view.terrain[j];
        if (parent.has(j) || terrain === null || danger.has(j)) continue;
        if (terrain !== 'water' && !own.has(j)) continue;
        parent.set(j, i);
        next.push(j);
      }
    }
    level = next;
  }
  if (!parent.has(goal)) return null;
  const path: number[] = [];
  for (let j = goal; j !== start; j = parent.get(j)!) path.push(j);
  path.reverse();
  const step = path[Math.min(path.length, 2) - 1];
  return { x: step % w, y: Math.floor(step / w) };
}

/**
 * Hard: the next leg toward the nearest foreign city that can be reached around the danger, as a Go-to command;
 * 'hold' when every approach is blocked, 'none' when nothing is known to be dangerous (so the usual way applies).
 */
function safeApproach(view: PlayerView, u: Unit): SessionCommand | 'hold' | 'none' {
  const danger = dangerSquares(view);
  if (danger.size === 0 || danger.has(u.y * view.width + u.x)) return 'none';
  const dist = reach(view, u);
  const squares: { sq: Pos; d: number }[] = [];
  for (const c of view.knownCities) {
    if (c.owner === view.me) continue;
    for (const n of neighbors(geo(view), c.x, c.y)) {
      const d = dist.get(n.y * view.width + n.x);
      if (d !== undefined && d > 0) squares.push({ sq: n, d });
    }
  }
  squares.sort((a, b) => a.d - b.d);
  for (const { sq } of squares.slice(0, 8)) {
    const step = safeStep(view, u, sq, danger);
    if (step) return setOrders(u, { kind: 'goto', target: step });
  }
  return squares.length > 0 ? 'hold' : 'none';
}
function decideTransport(view: PlayerView, u: Unit, t: AiTuning): SessionCommand | null {
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id);
  const inCity = view.myCities.some((c) => at(c, u));
  if (inCity) {
    const waiting = cargoUsed(view.myUnits.filter((a) => isFoot(a.type) && a.carriedBy === null && at(a, u)));
    const need = view.turn >= LATE_TURN ? t.lateArmiesToSail : t.armiesToSail;
    const ready = cargo.length === 0 && waiting >= need;
    if (!ready || (t.escorts && !escortReady(view, u))) return null;
    if (t.avoidPatrols) {
      const safe = safeApproach(view, u);
      if (safe === 'hold') return null;
      if (safe !== 'none') return safe;
    }
    return setOrders(u, { kind: 'explore' });
  }
  if (cargo.length > 0) {
    const nextToCity = view.knownCities.some((c) => c.owner !== view.me && chebyshev(geo(view), u, c) <= 1);
    // Sleeping cargo next to a foreign city: wake it so the armies can step ashore.
    if (nextToCity && cargo.some((a) => a.orders !== null)) return { type: 'unload', transportId: u.id, unitIds: null };
    if (nextToCity) return null;
    if (t.avoidPatrols) {
      const safe = safeApproach(view, u);
      if (safe === 'hold') return null;
      if (safe !== 'none') return safe;
    }
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

/** A warship counts as escorting a transport when it is within this many squares of it. */
const ESCORT_NEAR = 2;
/** A free warship will go to a loaded transport at most this far away. */
const ESCORT_RANGE = 12;

/** Armies waiting beside a transport in a city, and how many it wants before it sails. */
function sailReady(view: PlayerView, tr: Unit, t: AiTuning): boolean {
  const waiting = cargoUsed(view.myUnits.filter((a) => isFoot(a.type) && a.carriedBy === null && at(a, tr)));
  const need = view.turn >= LATE_TURN ? t.lateArmiesToSail : t.armiesToSail;
  return !view.myUnits.some((c) => c.carriedBy === tr.id) && waiting >= need;
}

/** Transports that want an escort: loaded ones at sea, and ones in port whose armies are ready to sail. */
function escortWards(view: PlayerView, t: AiTuning): Unit[] {
  return view.myUnits.filter((tr) => {
    if ((tr.type !== 'transport' && tr.type !== 'carrier') || tr.carriedBy !== null) return false;
    if (view.myCities.some((c) => at(c, tr))) return tr.type === 'transport' && sailReady(view, tr, t);
    return view.myUnits.some((c) => c.carriedBy === tr.id);
  });
}

/**
 * Whether a transport in port may sail: a healthy warship is beside it, or none could ever join it (none owned, or
 * none able to reach the port by sea), so it must not wait for ever.
 */
function escortReady(view: PlayerView, tr: Unit): boolean {
  const ships = view.myUnits.filter((w) => isWarship(w.type) && w.damage === 0 && w.carriedBy === null);
  if (ships.some((w) => chebyshev(geo(view), w, tr) <= ESCORT_NEAR)) return true;
  // Wait for one that can come, or for one being built; sail alone only when none could ever join.
  return !ships.some((w) => reach(view, w).has(tr.y * view.width + tr.x)) && !view.myCities.some((c) => isWarship(c.production));
}

/**
 * Hard: escort duty. A warship already beside a ward stays with it (null: leave its orders alone); a free one goes to
 * the nearest ward that has no warship near it: the square beside it at sea, or the port itself. 'none' means no duty.
 */
function escortOrders(view: PlayerView, u: Unit, t: AiTuning): SessionCommand | null | 'none' {
  const wards = escortWards(view, t);
  if (wards.some((tr) => chebyshev(geo(view), u, tr) <= ESCORT_NEAR)) return null;
  const others = view.myUnits.filter((w) => isWarship(w.type) && w.id !== u.id);
  const dist = reach(view, u);
  let goal: { sq: Pos; d: number } | null = null;
  for (const tr of wards) {
    if (chebyshev(geo(view), u, tr) > ESCORT_RANGE || others.some((w) => chebyshev(geo(view), w, tr) <= ESCORT_NEAR)) continue;
    const squares = view.myCities.some((c) => at(c, tr)) ? [{ x: tr.x, y: tr.y }] : neighbors(geo(view), tr.x, tr.y);
    for (const n of squares) {
      const d = dist.get(n.y * view.width + n.x);
      if (d !== undefined && d > 0 && (goal === null || d < goal.d)) goal = { sq: n, d };
    }
  }
  return goal ? setOrders(u, { kind: 'goto', target: goal.sq }) : 'none';
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

  // Hard: stay with (or go to) a loaded transport at sea.
  if (t.escorts && u.type !== 'submarine') {
    const duty = escortOrders(view, u, t);
    if (duty !== 'none') return duty;
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

  // City strength rule: a bombarding ship with nothing else to do sails to the square beside the nearest enemy city it can still wear down.
  if (view.rules.cityStrength && UNIT_STATS[u.type].bombard) {
    let goal: { sq: Pos; d: number } | null = null;
    for (const c of view.knownCities) {
      if (c.owner === null || c.owner === view.me || c.damage >= CITY_STRENGTH_HITS - 1) continue;
      for (const n of neighbors(geo(view), c.x, c.y)) {
        const d = dist.get(n.y * view.width + n.x);
        if (d !== undefined && d > 0 && d <= HUNT_RANGE * 2 && (goal === null || d < goal.d)) goal = { sq: n, d };
      }
    }
    if (goal) return setOrders(u, { kind: 'goto', target: goal.sq });
  }

  // Otherwise keep watch: patrol out to sea toward the enemy and back.
  const end = patrolEnd(view, u);
  if (end) return setOrders(u, { kind: 'patrol', a: { x: u.x, y: u.y }, b: end, toB: true });
  return null;
}

/**
 * Hard: a scouting fighter flies out, one step at a time (a Go-to may only name explored squares), toward the
 * unexplored square farthest from our cities that it still has the fuel to get home from, and goes home when there is
 * none it can reach or its fuel is getting low.
 */
function decideScout(view: PlayerView, u: Unit): SessionCommand | null {
  const fuel = u.fuel ?? 0;
  const w = view.width;
  const inCity = view.myCities.some((c) => at(c, u));
  const homeDist = (p: Pos) => Math.min(999, ...view.myCities.map((c) => chebyshev(geo(view), p, c)));
  if (!inCity && fuel <= homeDist(u) + 2) return view.myCities.length > 0 ? { type: 'goHome', unitId: u.id } : null;

  let best: { sq: Pos; far: number; d: number } | null = null;
  for (let i = 0; i < view.terrain.length; i++) {
    if (view.terrain[i] !== null) continue;
    const sq = { x: i % w, y: Math.floor(i / w) };
    const d = chebyshev(geo(view), u, sq);
    const far = homeDist(sq);
    if (d < 2 || d + far + 2 > fuel) continue;
    if (best === null || far > best.far || (far === best.far && d < best.d)) best = { sq, far, d };
  }
  if (best) {
    // The neighbouring square nearest the target that holds no visible enemy and no foreign city.
    const blocked = (n: Pos) => view.enemies.some((e) => e.visibleNow && at(e, n))
      || view.knownCities.some((c) => c.owner !== view.me && at(c, n));
    let step: Pos | null = null;
    for (const n of neighbors(geo(view), u.x, u.y)) {
      if (blocked(n)) continue;
      if (step === null || chebyshev(geo(view), n, best.sq) < chebyshev(geo(view), step, best.sq)) step = n;
    }
    const dir = step ? dirTo(view, u, step) : null;
    if (dir !== null) return { type: 'move', unitId: u.id, dir };
  }
  if (inCity) return null;
  return view.myCities.length > 0 ? { type: 'goHome', unitId: u.id } : null;
}
/** The scouting fighter is the oldest free one; the others wait in port for the carrier. */
function isScout(view: PlayerView, u: Unit): boolean {
  return !view.myUnits.some((f) => f.type === 'fighter' && f.carriedBy === null && f.id < u.id);
}

/**
 * Hard: the carrier waits in port until its fighters are there (it takes them when it sails), repairs when hurt, and
 * otherwise patrols out toward the enemy and back like the other ships.
 */
function decideCarrier(view: PlayerView, u: Unit): SessionCommand | null {
  const inCity = view.myCities.some((c) => at(c, u));
  if (u.damage > 0) {
    if (inCity) return setOrders(u, { kind: 'repair' });
    const home = nearestOwnCity(view, u, true);
    return home && goTo(view, u, home) ? { type: 'goHome', unitId: u.id, repair: true } : null;
  }
  if (inCity) {
    const air = view.myUnits.filter((f) => f.type === 'fighter' && (f.carriedBy === u.id || (f.carriedBy === null && at(f, u)))).length;
    if (air < CARRIER_AIR) return null;
  }
  const end = patrolEnd(view, u);
  return end ? setOrders(u, { kind: 'patrol', a: { x: u.x, y: u.y }, b: end, toB: true }) : null;
}

/**
 * Hard: a fighter aboard a carrier at sea patrols out to the explored square (within range) nearest a known foreign
 * city, with its path tied to the carrier; a second fighter takes a different direction from the first.
 */
function decideCarrierFighter(view: PlayerView, u: Unit): SessionCommand | null {
  const carrier = view.myUnits.find((c) => c.id === u.carriedBy);
  if (!carrier || view.myCities.some((c) => at(c, carrier))) return null;
  const takenEnds = view.myUnits.flatMap((f) => {
    const o = f.id !== u.id && f.type === 'fighter' ? f.orders : null;
    return o?.kind === 'patrol' ? [o.carrier?.end === 'a' ? o.b : o.a] : [];
  });
  const goals = view.knownCities.filter((c) => c.owner !== view.me);
  const w = view.width;
  let best: { sq: Pos; score: number } | null = null;
  for (let i = 0; i < view.terrain.length; i++) {
    if (view.terrain[i] === null) continue;
    const sq = { x: i % w, y: Math.floor(i / w) };
    const d = chebyshev(geo(view), carrier, sq);
    if (d < 3 || d > CARRIER_PATROL_RANGE) continue;
    if (takenEnds.some((e) => chebyshev(geo(view), e, sq) <= 2)) continue;
    const score = goals.length > 0 ? Math.min(...goals.map((g) => chebyshev(geo(view), g, sq))) : -d;
    if (best === null || score < best.score) best = { sq, score };
  }
  return best ? setOrders(u, { kind: 'patrol', a: { x: carrier.x, y: carrier.y }, b: best.sq, toB: true }) : null;
}
/** Squares where a Bomber lands and refuels: the cities, and the Airbases that have room. */
function refuelPoints(view: PlayerView): Pos[] {
  const bases = view.myUnits.filter(
    (b) => b.type === 'airbase' && cargoUsed(view.myUnits.filter((c) => c.carriedBy === b.id)) < UNIT_STATS.airbase.capacity,
  );
  return [...view.myCities, ...bases];
}

/** A Bomber flies out only if it can reach the city and still get home with this many squares of fuel to spare. */
const SORTIE_MARGIN = 3;
/** ...and only against a city it beats at least this often (a lost bombing costs the Bomber). */
const MIN_BOMB_CHANCE = 0.45;

/**
 * Hard (Advanced units rule): a Bomber that is whole and has fuel flies to the square beside the nearest known foreign
 * city it can reach and still get home from, bombs it once, then goes back to refuel (and to repair when hurt).
 */
function decideBomber(view: PlayerView, u: Unit, memo: AiMemo): SessionCommand | null {
  const fuel = u.fuel ?? 0;
  const points = refuelPoints(view);
  const dist = (a: Pos, b: Pos) => chebyshev(geo(view), a, b);
  const homeDist = (p: Pos) => Math.min(999, ...points.map((c) => dist(p, c)));
  const here = points.some((c) => at(c, u));
  const goBack = (): SessionCommand | null => {
    if (here) return null;
    const home = [...points].sort((a, b) => dist(u, a) - dist(u, b))[0];
    if (!home) return null;
    return view.myCities.some((c) => at(c, home)) ? { type: 'goHome', unitId: u.id } : goTo(view, u, { x: home.x, y: home.y });
  };
  if (u.damage > 0) {
    if (view.myCities.some((c) => at(c, u))) return setOrders(u, { kind: 'repair' });
    return view.myCities.length > 0 ? { type: 'goHome', unitId: u.id, repair: true } : null;
  }
  if (!here && fuel <= homeDist(u) + 2) return goBack();

  const target = view.knownCities
    .filter((c) => c.owner !== null && c.owner !== view.me && dist(u, c) + homeDist(c) + SORTIE_MARGIN <= fuel)
    .sort((a, b) => dist(u, a) - dist(u, b) || a.id - b.id)
    .find((c) => cityBombChance(view, u, visibleGarrison(view, c, c.owner)) >= MIN_BOMB_CHANCE);
  if (!target) return goBack();

  if (dist(u, target) === 1) {
    const key = `bomb${u.id}`;
    if ((memo.tries.get(key) ?? 0) > 0) return goBack();
    const dir = dirTo(view, u, target);
    if (dir === null) return goBack();
    memo.tries.set(key, 1);
    return { type: 'move', unitId: u.id, dir };
  }
  // Fly to the free square beside the city that is nearest the Bomber.
  const spot = neighbors(geo(view), target.x, target.y)
    .filter((n) => view.terrain[n.y * view.width + n.x] !== null
      && !view.enemies.some((e) => e.visibleNow && at(e, n))
      && !view.knownCities.some((c) => at(c, n) && c.owner !== view.me))
    .sort((a, b) => dist(u, a) - dist(u, b))[0];
  return (spot ? goTo(view, u, spot) : null) ?? goBack();
}

/** Hard (Advanced units rule): there is a Bomber, the army is big enough to spare one soldier, and Airbases are few. */
const AIRBASE_FROM_TURN = 30;
function wantsAirbase(view: PlayerView): boolean {
  if (view.turn < AIRBASE_FROM_TURN || !view.myUnits.some((u) => u.type === 'bomber')) return false;
  const soldiers = view.myUnits.filter((u) => u.type === 'army' || u.type === 'armor').length;
  const bases = view.myUnits.filter((u) => u.type === 'airbase').length;
  return soldiers >= 4 && bases < Math.min(2, 1 + Math.floor(view.myCities.length / 12));
}

/** Open land two to six squares from an own city and at least three from any foreign one, away from other Airbases. */
function airbaseSquare(view: PlayerView, sq: Pos): boolean {
  if (view.terrain[sq.y * view.width + sq.x] !== 'land') return false;
  const dOwn = Math.min(999, ...view.myCities.map((c) => chebyshev(geo(view), sq, c)));
  if (dOwn < 2 || dOwn > 6) return false;
  if (view.knownCities.some((c) => c.owner !== view.me && chebyshev(geo(view), sq, c) < 3)) return false;
  return !view.myUnits.some((b) => b.type === 'airbase' && chebyshev(geo(view), sq, b) < 4);
}

/**
 * An idle soldier on a good square turns itself into an Airbase; otherwise the oldest idle soldier waiting in a city
 * walks to the good square nearest the enemy that it can reach.
 */
function airbaseOrders(view: PlayerView, u: Unit): SessionCommand | null {
  if (!wantsAirbase(view) || u.carriedBy !== null) return null;
  if (airbaseSquare(view, u)) return { type: 'buildAirbase', unitId: u.id };
  const inCity = view.myCities.some((c) => at(c, u));
  const oldest = view.myUnits
    .filter((s) => (s.type === 'army' || s.type === 'armor') && s.carriedBy === null && s.orders === null && view.myCities.some((c) => at(c, s)))
    .sort((a, b) => a.id - b.id)[0];
  if (!inCity || oldest?.id !== u.id) return null;
  const foreign = view.knownCities.filter((c) => c.owner !== view.me);
  if (foreign.length === 0) return null;
  const walk = reach(view, u);
  let best: { sq: Pos; d: number } | null = null;
  for (const [i, steps] of walk) {
    if (steps < 2 || steps > 10) continue;
    const sq = { x: i % view.width, y: Math.floor(i / view.width) };
    if (!airbaseSquare(view, sq)) continue;
    const d = Math.min(...foreign.map((c) => chebyshev(geo(view), sq, c)));
    if (best === null || d < best.d || (d === best.d && steps < (walk.get(best.sq.y * view.width + best.sq.x) ?? 999))) best = { sq, d };
  }
  return best ? goTo(view, u, best.sq) : null;
}

function decide(view: PlayerView, u: Unit, port: City | null, t: AiTuning, memo: AiMemo): SessionCommand | null {
  switch (u.type) {
    case 'army':
    case 'armor': {
      if (t.airbases && view.rules.advancedUnits) {
        const base = airbaseOrders(view, u);
        if (base) return base;
      }
      return decideArmy(view, u, port, t);
    }
    case 'bomber': return t.bombers && view.rules.advancedUnits ? decideBomber(view, u, memo) : null;
    case 'transport': return decideTransport(view, u, t);
    case 'destroyer':
    case 'cruiser':
    case 'battleship': return decideWarship(view, u, t);
    case 'fighter':
      if (u.carriedBy !== null) return t.carriers ? decideCarrierFighter(view, u) : null;
      return t.scouts && isScout(view, u) ? decideScout(view, u) : null;
    case 'carrier': return t.carriers ? decideCarrier(view, u) : null;
    case 'submarine': return decideWarship(view, u, t);
    default: return null; // carriers are not built yet
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
    const cmd = decide(view, u, port, memo.tuning, memo);
    if (cmd && bump(memo, `u${u.id}`)) return cmd;
  }

  // Hard: warships on patrol (or idling on sentry) are pulled onto escort duty when a loaded transport is at sea.
  if (memo.tuning.escorts) {
    const busy = view.myUnits
      .filter((u) => isWarship(u.type) && u.movesLeft > 0 && u.damage === 0 && u.carriedBy === null
        && (u.orders?.kind === 'patrol' || u.orders?.kind === 'sentry'))
      .sort((a, b) => a.id - b.id);
    for (const u of busy) {
      if ((memo.tries.get(`u${u.id}`) ?? 0) >= MAX_TRIES) continue;
      const duty = escortOrders(view, u, memo.tuning);
      if (duty === null && u.orders?.kind === 'patrol' && bump(memo, `u${u.id}`)) return setOrders(u, { kind: 'sentry' });
      if (duty !== null && duty !== 'none' && bump(memo, `u${u.id}`)) return duty;
    }
  }
  return null;
}
