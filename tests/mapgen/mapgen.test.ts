import { describe, it, expect } from 'vitest';
import { heightField } from '../../src/mapgen/noise';
import { labelLand, thresholdLand } from '../../src/mapgen/land';
import { chebyshevDist, forNeighbors } from '../../src/mapgen/grid';
import { placeCities } from '../../src/mapgen/cities';
import { chooseStarts } from '../../src/mapgen/starts';
import { generateWorld } from '../../src/mapgen/generate';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen/options';
import { Rng } from '../../src/engine/rng';
import { assignCityNames } from '../../src/mapgen/names';
import { CITY_NAMES } from '../../src/data/cityNames';
import { createGame } from '../../src/engine/setup';

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

describe('cities and starts', () => {
  it('places cities on land at least 3 apart', () => {
    const w = 60, h = 45;
    const { land } = labelLand(thresholdLand(heightField(w, h, false, 10, 5), w, h, 70), w, h, false, 4);
    const cities = placeCities(land, w, h, false, 40, new Rng(1));
    expect(cities.length).toBeGreaterThan(10);
    for (const c of cities) expect(land[c.y * w + c.x]).toBe(true);
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        expect(chebyshevDist(w, false, cities[i].x, cities[i].y, cities[j].x, cities[j].y)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('returns null when not enough qualifying cities exist', () => {
    const cities = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
    const labels = new Array(10).fill(-1);
    labels[0] = 0;
    labels[5] = 1;
    expect(chooseStarts(cities, labels, 10, false, 2, 3)).toBeNull();
    expect(chooseStarts(cities, labels, 10, false, 2, 0)).toEqual(expect.arrayContaining([0, 1]));
  });
});

describe('generateWorld', () => {
  const opts = { ...DEFAULT_WORLD };

  it('is deterministic for a seed', () => {
    expect(generateWorld(opts, 42)).toEqual(generateWorld(opts, 42));
    expect(generateWorld(opts, 42).map.terrain).not.toEqual(generateWorld(opts, 43).map.terrain);
  });

  it('hits the water target, has no tiny islands, and spaces cities', () => {
    const { map } = generateWorld(opts, 9);
    const water = map.terrain.filter((t) => t === 'water').length / map.terrain.length;
    expect(water).toBeGreaterThan(0.67);
    expect(water).toBeLessThan(0.75);
    const land = map.terrain.map((t) => t !== 'water');
    const r = labelLand(land, map.width, map.height, false, 1);
    for (const size of r.sizes) if (size > 0) expect(size).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < map.cities.length; i++) {
      for (let j = i + 1; j < map.cities.length; j++) {
        const a = map.cities[i], b = map.cities[j];
        expect(chebyshevDist(map.width, false, a.x, a.y, b.x, b.y)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('produces valid, distinct starts that createGame accepts, for 2..6 players', () => {
    for (let players = 2; players <= 6; players++) {
      const w = generateWorld({ ...opts, players }, 100 + players);
      expect(new Set(w.startCityIndices).size).toBe(players);
      const s = createGame({
        map: w.map,
        players: Array.from({ length: players }, (_, i) => ({ name: `P${i}`, kind: 'human' as const })),
        startCityIndices: w.startCityIndices,
        seed: w.seedUsed,
      });
      expect(s.cities.filter((c) => c.owner !== null)).toHaveLength(players);
    }
  });

  it('gives 2-4 players at least 3 other cities on their start landmass with default settings', () => {
    for (let players = 2; players <= 4; players++) {
      const w = generateWorld({ ...opts, players }, 7);
      const land = w.map.terrain.map((t) => t !== 'water');
      const { labels } = labelLand(land, w.map.width, w.map.height, false, 1);
      for (const si of w.startCityIndices) {
        const c = w.map.cities[si];
        const label = labels[c.y * w.map.width + c.x];
        const others = w.map.cities.filter((o) => labels[o.y * w.map.width + o.x] === label).length - 1;
        expect(others).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('handles edge settings without hanging', () => {
    expect(() => generateWorld({ ...opts, ...SIZE_PRESETS.small, players: 6 }, 1)).not.toThrow();
    expect(() => generateWorld({ ...opts, waterPercent: 85 }, 1)).not.toThrow();
  });

  it('rejects invalid options', () => {
    expect(() => generateWorld({ ...opts, width: 10 }, 1)).toThrow(/at least/);
    expect(() => generateWorld({ ...opts, players: 7 }, 1)).toThrow(/players/);
    expect(() => generateWorld({ ...opts, waterPercent: 95 }, 1)).toThrow(/water/);
  });

  it('generates a Huge map in under a second', () => {
    const t0 = performance.now();
    generateWorld({ ...opts, ...SIZE_PRESETS.huge, players: 6 }, 3);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe('assignCityNames', () => {
  const euro = CITY_NAMES.filter((n) => n.region === 'europe').map((n) => n.name);
  it('gives distinct names from the chosen region, repeatably', () => {
    const a = assignCityNames(10, 42, 'europe');
    expect(new Set(a).size).toBe(10);
    for (const n of a) expect(euro).toContain(n);
    expect(assignCityNames(10, 42, 'europe')).toEqual(a);
  });
  it('spills into other regions once the region is used up', () => {
    const a = assignCityNames(euro.length + 5, 3, 'europe');
    for (const n of a.slice(0, euro.length)) expect(euro).toContain(n);
    for (const n of a.slice(euro.length)) expect(euro).not.toContain(n);
  });
  it('adds roman suffixes past the list and stays unique', () => {
    const L = CITY_NAMES.length;
    const a = assignCityNames(L * 2 + 3, 1, 'world');
    expect(new Set(a.map((n) => n.toLowerCase())).size).toBe(a.length);
    expect(a[L].endsWith(' II')).toBe(true);
    expect(a[2 * L].endsWith(' III')).toBe(true);
    expect(a[0].endsWith(' II')).toBe(false);
  });
  it('generateWorld returns one name per city and does not change the map', () => {
    const w = generateWorld({ ...DEFAULT_WORLD, nameRegion: 'asia' }, 7);
    expect(w.cityNames.length).toBe(w.map.cities.length);
    const w2 = generateWorld(DEFAULT_WORLD, 7);
    expect(w2.map).toEqual(w.map);
    expect(w2.startCityIndices).toEqual(w.startCityIndices);
  });
});
