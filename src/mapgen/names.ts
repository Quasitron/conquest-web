import { CITY_NAMES, type NameRegion } from '../data/cityNames';
import { Rng } from '../engine/rng';
import { romanSuffix } from '../engine/names';

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Seeded, unique city names. The chosen region's names come first (shuffled), then
 * the rest of the list (shuffled); past the end of the list a Roman numeral suffix is added.
 */
export function assignCityNames(count: number, seed: number, region: NameRegion | 'world'): string[] {
  const rng = new Rng(seed ^ 0x51ed27);
  let order: string[];
  if (region === 'world') {
    order = shuffled(CITY_NAMES, rng).map((n) => n.name);
  } else {
    const own = shuffled(CITY_NAMES.filter((n) => n.region === region), rng);
    const rest = shuffled(CITY_NAMES.filter((n) => n.region !== region), rng);
    order = [...own, ...rest].map((n) => n.name);
  }
  const L = order.length;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(order[i % L] + romanSuffix(Math.floor(i / L)));
  return out;
}
