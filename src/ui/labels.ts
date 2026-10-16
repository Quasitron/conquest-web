import { UNIT_STATS, UNIT_TYPES, buildTime, effectiveMove, unitDisplayName, type City, type Unit, type UnitType } from '../engine';
import { describeOrders } from './actions';

export function pathLabel(turn: number, arrival: number | null, fuelLeft: number | null): string {
  if (arrival === null) return 'no known path';
  let label = arrival === turn ? 'this turn' : `arrives turn ${arrival}`;
  if (fuelLeft !== null) label += fuelLeft < 0 ? ' · out of range' : ` · fuel ${fuelLeft}`;
  return label;
}

export function healthText(u: Unit): string {
  const hits = UNIT_STATS[u.type].hits;
  return `Health ${hits - u.damage}/${hits}`;
}

/** Tiles below 16px are too small for a number, so they get a dot. */
export function badgeMode(tile: number): 'number' | 'dot' {
  return tile < 16 ? 'dot' : 'number';
}

export function cityStackTop(units: readonly Unit[]): Unit | null {
  let top: Unit | null = null;
  for (const u of units) if (top === null || u.id > top.id) top = u;
  return top;
}

export function pluralUnit(type: UnitType, n: number): string {
  const name = UNIT_STATS[type].name;
  if (n === 1) return name;
  return type === 'army' ? 'Armies' : `${name}s`;
}

/** Cargo as "2 Armies, 1 Fighter", in unit type order. */
export function cargoSummary(cargo: readonly Pick<Unit, 'type'>[]): string {
  return UNIT_TYPES
    .map((t) => ({ t, n: cargo.filter((c) => c.type === t).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${pluralUnit(x.t, x.n)}`)
    .join(', ');
}

export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** City names need tiles of at least 20px to be legible. */
export function cityLabelVisible(tile: number): boolean {
  return tile >= 20;
}

export function turnsToComplete(city: City, type: UnitType): number {
  return city.production === type ? buildTime(city, type) - city.progress : buildTime(city, type);
}

export function inProductionCount(cities: readonly City[], type: UnitType): number {
  return cities.filter((c) => c.production === type).length;
}

export function statusLine(u: Unit): string {
  const st = UNIT_STATS[u.type];
  let line = `${unitDisplayName(u)} \u00b7 Moves ${u.movesLeft}/${effectiveMove(u)} \u00b7 Orders: ${describeOrders(u.orders)}`;
  if (u.fuel !== null) line += ` \u00b7 Fuel ${u.fuel}/${st.range}`;
  return line;
}