import type { Pos, Relief } from '../engine/types';
import { Rng } from '../engine/rng';
import { heightField } from './noise';
import type { Climate } from './options';

/** Share of land squares that become mountains, rough ground and forest. Clear ground is what remains. */
const MOUNTAIN_SHARE = 0.07;
const ROUGH_SHARE = 0.1;
const FOREST_SHARE = 0.22;
/**
 * What a climate does to the open (clear) squares, as a share of them: sand on the driest (the flattest, furthest inland,
 * by a noise of its own) and forest on the leafiest. Temperate is the plain map of old, so its seeds make the same maps.
 */
const CLIMATE: Record<Climate, { desert: number; forest: number }> = {
  temperate: { desert: 0, forest: FOREST_SHARE },
  arid: { desert: 0.35, forest: 0.08 },
  wet: { desert: 0, forest: 0.36 },
};
/** How far inland counts towards dryness, in squares. */
const DRY_REACH = 6;
/** Rivers cover about this share of the land squares, the ones with the biggest catchments (at least MIN_CATCHMENT squares drain through). */
const RIVER_SHARE = 0.15;
const MIN_CATCHMENT = 2;
/** Outlets for the water are at least this many squares apart along a coast. */
const OUTLET_SPACING = 14;
/** A river is at least this many squares long (shorter ones are dropped). */
const MIN_RIVER_LENGTH = 3;
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
  height: number[], land: boolean[], width: number, h: number, wrap: boolean, cities: Pos[], seed: number, climate: Climate = 'temperate',
): Relief[] {
  const relief: Relief[] = land.map(() => 'clear');
  const isCity = new Set(cities.map((c) => c.y * width + c.x));
  const squares: number[] = [];
  land.forEach((l, i) => { if (l && !isCity.has(i)) squares.push(i); });
  if (squares.length === 0) return relief;

  const mountainAt = cutoff(squares.map((i) => height[i]), MOUNTAIN_SHARE);
  const roughAt = cutoff(squares.map((i) => height[i]), MOUNTAIN_SHARE + ROUGH_SHARE);
  for (const i of squares) relief[i] = height[i] >= mountainAt ? 'mountain' : height[i] >= roughAt ? 'rough' : 'clear';

  const shares = CLIMATE[climate];
  if (shares.desert > 0) {
    // Distance from the coast over the land, so the middle of a landmass is drier than its shore.
    const around = (x: number, y: number): number[] => ORTHO.flatMap(([dx, dy]) => {
      const yy = y + dy;
      if (yy < 0 || yy >= h) return [];
      let xx = x + dx;
      if (wrap) xx = ((xx % width) + width) % width;
      else if (xx < 0 || xx >= width) return [];
      return [yy * width + xx];
    });
    const coastDist = new Array<number>(land.length).fill(-1);
    const wave: number[] = [];
    for (let i = 0; i < land.length; i++) {
      if (!land[i]) continue;
      const x = i % width;
      const near = around(x, (i - x) / width);
      if (near.length < 4 || near.some((m) => !land[m])) { coastDist[i] = 0; wave.push(i); }
    }
    for (let q = 0; q < wave.length; q++) {
      const x = wave[q] % width;
      for (const m of around(x, (wave[q] - x) / width)) {
        if (land[m] && coastDist[m] < 0) { coastDist[m] = coastDist[wave[q]] + 1; wave.push(m); }
      }
    }
    const dry = heightField(width, h, wrap, 9, seed ^ 0xd35e47, 3);
    const score = (i: number) => dry[i] + (0.45 * Math.min(Math.max(coastDist[i], 0), DRY_REACH)) / DRY_REACH;
    const clearNow = squares.filter((i) => relief[i] === 'clear');
    const driest = cutoff(clearNow.map(score), shares.desert);
    for (const i of clearNow) if (score(i) >= driest) relief[i] = 'desert';
  }
  const leafy = heightField(width, h, wrap, 5, seed ^ 0x51f15eed, 3);
  const open = squares.filter((i) => relief[i] === 'clear');
  const forestAt = cutoff(open.map((i) => leafy[i]), shares.forest);
  for (const i of open) if (leafy[i] >= forestAt) relief[i] = 'forest';

  const rng = new Rng(seed ^ 0x7e57ab1e);
  const at = (x: number, y: number): number | null => {
    if (y < 0 || y >= h) return null;
    if (wrap) x = ((x % width) + width) % width;
    else if (x < 0 || x >= width) return null;
    return y * width + x;
  };
  // Rivers by flow over the land, as in nature. Water drains from every land square toward the sea by way of the lowest
  // ground (a flood outward from the coast, always taking the lowest square next, so every square learns which neighbour
  // it drains into). Each square then adds up the squares that drain through it; the squares with the biggest catchments
  // become the rivers, so they run through the valleys, grow wider toward the sea and gain tributaries where two
  // streams meet, with no river drawn by hand. Cities are left out of the drainage, so no river runs through one.
  const n = land.length;
  const parent = new Array<number>(n).fill(-1);
  const seen = new Array<boolean>(n).fill(false);
  const level = new Array<number>(n).fill(0);
  const frontier: number[] = []; // a binary heap (the frontier of the flood) of square indices ordered by `level`
  const less = (a: number, b: number) => level[a] < level[b] || (level[a] === level[b] && a < b);
  const push = (i: number) => {
    frontier.push(i);
    let k = frontier.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if (!less(frontier[k], frontier[up])) break;
      [frontier[k], frontier[up]] = [frontier[up], frontier[k]];
      k = up;
    }
  };
  const pop = (): number => {
    const top = frontier[0];
    const last = frontier.pop()!;
    if (frontier.length > 0) {
      frontier[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < frontier.length && less(frontier[l], frontier[m])) m = l;
        if (r < frontier.length && less(frontier[r], frontier[m])) m = r;
        if (m === k) break;
        [frontier[k], frontier[m]] = [frontier[m], frontier[k]];
        k = m;
      }
    }
    return top;
  };
  const ground = (i: number) => height[i] + (i % 7) * 0.0005 + rng.next() * 0.01;
  // Where the water leaves the land: a few outlets along the coast, low ground first and kept apart, with at least one
  // on every landmass. All the other shore squares drain inland and along the coast to an outlet, so the streams of
  // a region gather into a few big rivers with many small ones feeding them, not a short stream at every beach.
  const coast = squares.filter((i) => {
    const x = i % width;
    const y = (i - x) / width;
    return ORTHO.some(([dx, dy]) => { const m = at(x + dx, y + dy); return m !== null && !land[m]; });
  });
  const lowFirst = coast.map((i) => ({ i, k: height[i] + rng.next() * 0.25 })).sort((p, q) => p.k - q.k).map((e) => e.i);
  const distance = (a: number, b: number) => {
    const ax = a % width;
    const bx = b % width;
    let dx = Math.abs(ax - bx);
    if (wrap) dx = Math.min(dx, width - dx);
    return Math.max(dx, Math.abs((a - ax) / width - (b - bx) / width));
  };
  const landmass = new Array<number>(n).fill(-1);
  let landmasses = 0;
  for (let i = 0; i < n; i++) {
    if (!land[i] || landmass[i] >= 0) continue;
    const stack = [i];
    landmass[i] = landmasses;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const x = cur % width;
      const y = (cur - x) / width;
      for (const [dx, dy] of ORTHO) {
        const m = at(x + dx, y + dy);
        if (m !== null && land[m] && landmass[m] < 0) { landmass[m] = landmasses; stack.push(m); }
      }
    }
    landmasses++;
  }
  const outlets: number[] = [];
  const served = new Set<number>();
  for (const i of lowFirst) {
    if (outlets.every((o) => distance(o, i) >= OUTLET_SPACING)) { outlets.push(i); served.add(landmass[i]); }
  }
  for (const i of lowFirst) if (!served.has(landmass[i])) { outlets.push(i); served.add(landmass[i]); }
  for (const i of outlets) {
    seen[i] = true;
    level[i] = ground(i);
    push(i);
  }  const order: number[] = []; // squares from the coast inland
  const isOutlet = new Set(outlets);
  const shore = new Set(coast);
  while (frontier.length > 0) {
    const i = pop();
    order.push(i);
    if (shore.has(i) && !isOutlet.has(i)) continue; // a beach that is not an outlet is a dead end: no stream runs along the shore through it
    const x = i % width;
    const y = (i - x) / width;
    for (const [dx, dy] of ORTHO) {
      const m = at(x + dx, y + dy);
      if (m === null || !land[m] || isCity.has(m) || seen[m]) continue;
      seen[m] = true;
      parent[m] = i;
      level[m] = Math.max(ground(m), level[i]);
      push(m);
    }
  }
  const catchment = new Array<number>(n).fill(0);
  for (const i of order) catchment[i] = 1;
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    if (parent[i] >= 0) catchment[parent[i]] += catchment[i];
  }
  // The biggest catchments are rivers: as many squares as the share allows, but never a catchment smaller than a few squares.
  const outletSet = new Set(outlets);
  const coastSet = new Set(coast);
  const ranked = order.filter((i) => catchment[i] >= MIN_CATCHMENT && relief[i] !== 'mountain' && (!coastSet.has(i) || outletSet.has(i))).sort((a, b) => catchment[b] - catchment[a] || a - b);
  const cap = Math.max(4, Math.round(squares.length * RIVER_SHARE));
  const chosen = new Set(ranked.slice(0, cap));
  // Keep only what runs all the way down to an outlet (a stretch cut off from it by the shore squares is dropped).
  const reaches = new Map<number, boolean>();
  for (const i of chosen) {
    const trail: number[] = [];
    let j = i;
    let result = false;
    for (;;) {
      const known = reaches.get(j);
      if (known !== undefined) { result = known; break; }
      trail.push(j);
      if (outletSet.has(j)) { result = true; break; }
      const up = parent[j];
      if (up < 0 || !chosen.has(up)) break;
      j = up;
    }
    for (const k of trail) reaches.set(k, result);
  }
  for (const i of [...chosen]) if (!reaches.get(i)) chosen.delete(i);
  // A one-square side branch hanging off a junction is clutter, not a tributary: drop it.
  const kids = new Map<number, number>();
  for (const i of chosen) if (parent[i] >= 0 && chosen.has(parent[i])) kids.set(parent[i], (kids.get(parent[i]) ?? 0) + 1);
  for (const i of [...chosen]) if (!kids.has(i) && parent[i] >= 0 && (kids.get(parent[i]) ?? 0) >= 2) chosen.delete(i);
  // A river of one or two squares is a stub, not a river: drop it.
  const rootOf = (i: number): number => { let r = i; while (parent[r] >= 0 && chosen.has(parent[r])) r = parent[r]; return r; };
  const length = new Map<number, number>();
  for (const i of chosen) length.set(rootOf(i), (length.get(rootOf(i)) ?? 0) + 1);
  for (const i of chosen) if ((length.get(rootOf(i)) ?? 0) >= MIN_RIVER_LENGTH) relief[i] = 'river';
  return relief;
}