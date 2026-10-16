import { UNIT_STATS, type Unit } from '../engine';

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
