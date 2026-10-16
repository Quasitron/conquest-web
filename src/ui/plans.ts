import {
  CITY_COMBAT, DIRS, UNIT_STATS, chebyshev, combatWinChance, findPath, normalize, pathMapFromView,
  type Dir, type MapLike, type PlayerId, type PlayerView, type Pos, type Unit,
} from '../engine';

/** Geometry only: normalize and chebyshev never read terrain. */
const geo = (v: PlayerView): MapLike => v as unknown as MapLike;
const DIR_IDS: Dir[] = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Where each army aboard `transport` would land: armies in id order, each on the first direction (N, NE, ...)
 * with a free explored land square or an own city. Armies with no such square are left out.
 */
export function landingPlan(
  view: PlayerView, transport: Unit, armyIds: readonly number[],
): { unitId: number; dir: Dir }[] {
  const wanted = new Set(armyIds);
  const armies = view.myUnits
    .filter((u) => u.type === 'army' && u.carriedBy === transport.id && u.movesLeft > 0 && wanted.has(u.id))
    .sort((a, b) => a.id - b.id);
  const taken = new Set<number>();
  const plan: { unitId: number; dir: Dir }[] = [];
  for (const army of armies) {
    for (const dir of DIR_IDS) {
      const [dx, dy] = DIRS[dir];
      const p = normalize(geo(view), transport.x + dx, transport.y + dy);
      if (!p) continue;
      const i = p.y * view.width + p.x;
      const ownCity = view.myCities.some((c) => c.x === p.x && c.y === p.y);
      if (!ownCity) {
        if (view.terrain[i] !== 'land' || taken.has(i)) continue;
        if (view.myUnits.some((u) => u.carriedBy === null && u.x === p.x && u.y === p.y)) continue;
        if (view.enemies.some((e) => e.turnSeen === view.turn && e.x === p.x && e.y === p.y)) continue;
        taken.add(i);
      }
      plan.push({ unitId: army.id, dir });
      break;
    }
  }
  return plan;
}

/** The square next to `city` that `u` reaches soonest (ties: earlier direction); null if adjacent or unreachable. */
export function approachSquare(view: PlayerView, u: Unit, city: Pos): Pos | null {
  if (chebyshev(geo(view), u, city) <= 1) return null;
  const map = pathMapFromView(view);
  let best: Pos | null = null;
  let bestLen = Infinity;
  for (const dir of DIR_IDS) {
    const [dx, dy] = DIRS[dir];
    const sq = normalize(geo(view), city.x + dx, city.y + dy);
    if (!sq) continue;
    const path = findPath(map, u, sq);
    if (path !== null && path.length < bestLen) {
      best = sq;
      bestLen = path.length;
    }
  }
  return best;
}

/** Chance that `u` takes a city in one assault, from the unit's own current damage. */
export function cityAttackChance(view: PlayerView, u: Unit, cityOwner: PlayerId | null): number {
  const st = UNIT_STATS[u.type];
  const defense = view.rules.easierNeutralCities && cityOwner === null ? 1 : CITY_COMBAT.defense;
  return combatWinChance(
    { attack: st.attack, shot: st.shot, hits: st.hits, damage: u.damage },
    { defense, shot: CITY_COMBAT.shot, hits: CITY_COMBAT.hits, damage: 0 },
  );
}

export function attackLabel(chance: number | null): string {
  return chance === null ? 'Attack' : `Attack (${Math.round(chance * 100)}%)`;
}
