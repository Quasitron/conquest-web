import type { Relief, Terrain } from './types';

/** The way water runs through the river squares of a map: how much flows through each, and which square it flows to. */
export interface RiverNet {
  /** Per square: the river squares draining through it, itself included (0 where there is no river). */
  flow: number[];
  /** Per square: the river square it flows into, SEA when it flows into the sea, NONE where it has no outlet (or is no river). */
  down: number[];
}

/** `down` value of a river square that empties into the sea. */
export const SEA = -2;
/** `down` value of a square that is no river, or a river with no outlet. */
export const NONE = -1;

const ORTHO: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Works out the river network from the map alone. A river square next to water is a mouth; water flows from every
 * other river square to the neighbouring river square closest to a mouth, and every square adds its flow to the one
 * below it, so a river grows wider toward the sea and a tributary joins the main stream where the two meet.
 * Squares that cannot reach water (a gap in a river where it crossed a mountain) are left with no outlet.
 */
export function computeRiverNet(
  terrain: readonly Terrain[], relief: readonly Relief[], width: number, height: number, wrap: boolean,
): RiverNet {
  const n = width * height;
  const flow = new Array<number>(n).fill(0);
  const down = new Array<number>(n).fill(NONE);
  const at = (x: number, y: number): number => {
    if (y < 0 || y >= height) return -1;
    if (wrap) x = ((x % width) + width) % width;
    else if (x < 0 || x >= width) return -1;
    return y * width + x;
  };
  const isRiver = (i: number) => i >= 0 && relief[i] === 'river' && terrain[i] === 'land';
  const dist = new Array<number>(n).fill(Infinity);
  let level: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!isRiver(i)) continue;
    const x = i % width;
    const y = (i - x) / width;
    if (ORTHO.some(([dx, dy]) => { const m = at(x + dx, y + dy); return m >= 0 && terrain[m] === 'water'; })) {
      dist[i] = 1;
      down[i] = SEA;
      level.push(i);
    }
  }
  while (level.length > 0) {
    const next: number[] = [];
    for (const i of level) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of ORTHO) {
        const m = at(x + dx, y + dy);
        if (!isRiver(m) || dist[m] !== Infinity) continue;
        dist[m] = dist[i] + 1;
        down[m] = i;
        next.push(m);
      }
    }
    level = next;
  }
  // Add each square's flow to the square below it, farthest from the sea first.
  const order: number[] = [];
  for (let i = 0; i < n; i++) if (isRiver(i)) { flow[i] = 1; order.push(i); }
  order.sort((a, b) => dist[b] - dist[a] || a - b);
  for (const i of order) if (down[i] >= 0) flow[down[i]] += flow[i];
  return { flow, down };
}

const cache = new WeakMap<readonly Relief[], RiverNet>();

/** `computeRiverNet`, remembered per relief array (a map's relief never changes during a game). */
export function riverNetOf(
  m: { terrain: readonly Terrain[]; relief?: readonly Relief[]; width: number; height: number; wrap: boolean },
): RiverNet | null {
  if (!m.relief || !m.relief.includes('river')) return null;
  let net = cache.get(m.relief);
  if (!net) {
    net = computeRiverNet(m.terrain, m.relief, m.width, m.height, m.wrap);
    cache.set(m.relief, net);
  }
  return net;
}
