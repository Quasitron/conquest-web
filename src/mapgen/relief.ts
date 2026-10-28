import type { Pos, Relief } from '../engine/types';
import { Rng } from '../engine/rng';
import { heightField } from './noise';

/** Share of land squares that become mountains, rough ground and forest. Clear ground is what remains. */
const MOUNTAIN_SHARE = 0.07;
const ROUGH_SHARE = 0.1;
const FOREST_SHARE = 0.22;
/** One river source for about this many land squares; a river runs downhill to the sea or is dropped. */
const LAND_PER_RIVER = 110;
const MAX_RIVER = 45;

const ORTHO: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** The value below which the lowest `share` of `values` fall (the (1 - share) quantile from the top). */
function cutoff(values: number[], share: number): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * share)))];
}

/**
 * Terrain for the Advanced rules (Appendix III of the original manual): mountains on the highest ground, rough ground
 * around them, forest in patches over what is left, and rivers running down from the heights to the sea. Cities and
 * water stay clear. `height` is the same field that made the coastline, so the high ground sits inland.
 */
export function generateRelief(
  height: number[], land: boolean[], width: number, h: number, wrap: boolean, cities: Pos[], seed: number,
): Relief[] {
  const relief: Relief[] = land.map(() => 'clear');
  const isCity = new Set(cities.map((c) => c.y * width + c.x));
  const squares: number[] = [];
  land.forEach((l, i) => { if (l && !isCity.has(i)) squares.push(i); });
  if (squares.length === 0) return relief;

  const mountainAt = cutoff(squares.map((i) => height[i]), MOUNTAIN_SHARE);
  const roughAt = cutoff(squares.map((i) => height[i]), MOUNTAIN_SHARE + ROUGH_SHARE);
  for (const i of squares) relief[i] = height[i] >= mountainAt ? 'mountain' : height[i] >= roughAt ? 'rough' : 'clear';

  const leafy = heightField(width, h, wrap, 5, seed ^ 0x51f15eed, 3);
  const open = squares.filter((i) => relief[i] === 'clear');
  const forestAt = cutoff(open.map((i) => leafy[i]), FOREST_SHARE);
  for (const i of open) if (leafy[i] >= forestAt) relief[i] = 'forest';

  const rng = new Rng(seed ^ 0x7e57ab1e);
  const at = (x: number, y: number): number | null => {
    if (y < 0 || y >= h) return null;
    if (wrap) x = ((x % width) + width) % width;
    else if (x < 0 || x >= width) return null;
    return y * width + x;
  };
  // Distance over land to the nearest water, by steps along the four sides: a river always runs down this field, so it
  // is sure to reach the sea, and it follows the lower ground where it has a choice.
  const toSea = new Array<number>(land.length).fill(-1);
  let level: number[] = [];
  land.forEach((l, i) => { if (!l) { toSea[i] = 0; level.push(i); } });
  while (level.length > 0) {
    const next: number[] = [];
    for (const i of level) {
      const x = i % width;
      const y = (i - x) / width;
      for (const [dx, dy] of ORTHO) {
        const n = at(x + dx, y + dy);
        if (n === null || toSea[n] >= 0) continue;
        toSea[n] = toSea[i] + 1;
        next.push(n);
      }
    }
    level = next;
  }
  const highest = squares.filter((i) => (relief[i] === 'mountain' || relief[i] === 'rough') && toSea[i] >= 5 && toSea[i] <= MAX_RIVER);
  const sources = Math.min(highest.length, Math.max(1, Math.round(squares.length / LAND_PER_RIVER)));
  for (let k = 0; k < sources; k++) {
    let cur = highest[Math.floor(rng.next() * highest.length)];
    const run: number[] = [];
    let done = false;
    if (relief[cur] === 'river') continue;
    while (toSea[cur] > 1) {
      run.push(cur);
      const x = cur % width;
      const y = (cur - x) / width;
      let next = -1;
      let best = Infinity;
      for (const [dx, dy] of ORTHO) {
        const n = at(x + dx, y + dy);
        if (n === null || toSea[n] !== toSea[cur] - 1 || isCity.has(n)) continue;
        // Keep clear of other rivers (parallel rivers look like a ladder); a river that meets one joins it.
        const nx = n % width;
        const ny = (n - nx) / width;
        const crowd = relief[n] === 'river' ? -10 : ORTHO.some(([ex, ey]) => { const m = at(nx + ex, ny + ey); return m !== null && m !== cur && relief[m] === 'river'; }) ? 10 : 0;
        if (height[n] + crowd < best) { best = height[n] + crowd; next = n; }
      }
      if (next < 0) { run.length = 0; break; }
      cur = next;
      if (relief[cur] === 'river') { done = true; break; }
    }
    if (!done && toSea[cur] === 1 && !isCity.has(cur)) run.push(cur);
    for (const i of run) if (relief[i] !== 'mountain') relief[i] = 'river';
  }
  return relief;
}