import { describe, it, expect } from 'vitest';
import { heightField } from '../../src/mapgen/noise';
import { labelLand, thresholdLand } from '../../src/mapgen/land';
import { chebyshevDist, forNeighbors } from '../../src/mapgen/grid';

describe('grid helpers', () => {
  it('wraps neighbors and distance horizontally only when wrap is on', () => {
    const seen: string[] = [];
    forNeighbors(5, 5, true, 0, 0, (x, y) => seen.push(`${x},${y}`));
    expect(seen).toContain('4,1');
    expect(seen).toHaveLength(5);
    expect(chebyshevDist(10, true, 0, 0, 9, 0)).toBe(1);
    expect(chebyshevDist(10, false, 0, 0, 9, 0)).toBe(9);
  });
});

describe('heightField', () => {
  it('is deterministic, in range, and differs by seed', () => {
    const a = heightField(40, 30, false, 10, 7);
    const b = heightField(40, 30, false, 10, 7);
    const c = heightField(40, 30, false, 10, 8);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(1200);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
  });

  it('is seamless across the wrap edge', () => {
    const w = 60;
    const h = heightField(w, 20, true, 10, 3, 1);
    for (let y = 0; y < 20; y++) {
      expect(Math.abs(h[y * w] - h[y * w + w - 1])).toBeLessThan(0.25);
    }
  });
});

describe('land', () => {
  it('thresholds to the requested water share in the interior and keeps edge rows water', () => {
    const w = 60, hgt = 45;
    const land = thresholdLand(heightField(w, hgt, false, 10, 11), w, hgt, 70);
    for (let x = 0; x < w; x++) {
      expect(land[x]).toBe(false);
      expect(land[(hgt - 1) * w + x]).toBe(false);
    }
    const interior = land.slice(w, (hgt - 1) * w);
    const water = interior.filter((l) => !l).length / interior.length;
    expect(water).toBeGreaterThan(0.68);
    expect(water).toBeLessThan(0.72);
  });

  it('removes land components smaller than the minimum and labels the rest', () => {
    // 6x4: a 1-square speck at (1,1) and a 4-square block at (3..4,1..2)
    const w = 6, h = 4;
    const land = new Array(w * h).fill(false);
    for (const [x, y] of [[1, 1], [3, 1], [4, 1], [3, 2], [4, 2]]) land[y * w + x] = true;
    const r = labelLand(land, w, h, false, 4);
    expect(r.land[1 * w + 1]).toBe(false);
    expect(r.labels[1 * w + 3]).toBe(r.labels[2 * w + 4]);
    expect(r.labels[0]).toBe(-1);
    expect(r.sizes[r.labels[1 * w + 3]]).toBe(4);
  });

  it('joins land across the wrap seam', () => {
    const w = 6, h = 3;
    const land = new Array(w * h).fill(false);
    for (const [x, y] of [[0, 1], [5, 1], [0, 2], [5, 2]]) land[y * w + x] = true;
    const r = labelLand(land, w, h, true, 4);
    expect(r.labels[1 * w + 0]).toBe(r.labels[1 * w + 5]);
    expect(r.land[1 * w + 0]).toBe(true);
  });
});
