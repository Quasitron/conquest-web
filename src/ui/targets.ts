import { CITY_STRENGTH_HITS, UNIT_STATS, cargoCapacity, step, type Dir, type MapLike, type PlayerView, type Pos, type Unit } from '../engine';

export interface StepTarget {
  x: number;
  y: number;
  dir: Dir;
  attack: boolean;
}

const mapOf = (v: PlayerView): MapLike => ({ width: v.width, height: v.height, wrap: v.wrap, terrain: [] });

export function dirTo(v: PlayerView, from: Pos, to: Pos): Dir | null {
  for (let d = 0; d < 8; d++) {
    const p = step(mapOf(v), from.x, from.y, d as Dir);
    if (p && p.x === to.x && p.y === to.y) return d as Dir;
  }
  return null;
}

/** Adjacent squares this unit could plausibly step to, judged only from what the player knows. */
export function stepTargets(v: PlayerView, u: Unit): StepTarget[] {
  if (u.movesLeft <= 0) return [];
  const domain = UNIT_STATS[u.type].domain;
  const out: StepTarget[] = [];
  for (let d = 0; d < 8; d++) {
    const p = step(mapOf(v), u.x, u.y, d as Dir);
    if (!p) continue;
    const terrain = v.terrain[p.y * v.width + p.x];
    if (terrain === null) {
      out.push({ ...p, dir: d as Dir, attack: false });
      continue;
    }
    const city = v.knownCities.find((c) => c.x === p.x && c.y === p.y);
    const ownCity = city !== undefined && city.owner === v.me;
    const enemyHere = v.enemies.some((e) => e.visibleNow && e.x === p.x && e.y === p.y);
    if (city && !ownCity) {
      if (domain === 'land') out.push({ ...p, dir: d as Dir, attack: true });
      // With city strength on, a bombarding ship can fire on a player's city (not a neutral one) until it is nearly spent.
      else if (UNIT_STATS[u.type].bombard && v.rules.cityStrength && city.owner !== null && city.damage < CITY_STRENGTH_HITS - 1) {
        out.push({ ...p, dir: d as Dir, attack: true });
      }
      continue;
    }
    if (enemyHere) {
      out.push({ ...p, dir: d as Dir, attack: true });
      continue;
    }
    const friends = v.myUnits.filter((o) => o.x === p.x && o.y === p.y && o.carriedBy === null && o.id !== u.id);
    const host = friends.find(
      (o) => UNIT_STATS[o.type].carries === u.type &&
        v.myUnits.filter((c) => c.carriedBy === o.id).length < cargoCapacity(o),
    );
    if (ownCity || host) {
      out.push({ ...p, dir: d as Dir, attack: false });
      continue;
    }
    const fits = domain === 'air' || (domain === 'land' ? terrain === 'land' : terrain === 'water');
    if (fits && (friends.length === 0 || domain === 'air')) out.push({ ...p, dir: d as Dir, attack: false });
  }
  return out;
}
