import { describe, it, expect } from 'vitest';
import { DEFAULT_WORLD, SIZE_PRESETS, generateWorld, type WorldOptions } from '../../src/mapgen';
import { labelLand } from '../../src/mapgen/land';

/** The landmass label of each player's start city. */
function startLandmasses(o: WorldOptions, seed: number): number[] {
  const w = generateWorld(o, seed);
  const { width, height, terrain, cities } = w.map;
  const { labels } = labelLand(terrain.map((t) => t !== 'water'), width, height, o.wrap, 4);
  return w.startCityIndices.map((i) => labels[cities[i].y * width + cities[i].x]);
}

describe('starting positions', () => {
  const base: WorldOptions = { ...DEFAULT_WORLD, ...SIZE_PRESETS.medium, players: 3, landmass: 'mixed', waterPercent: 65 };

  it('separate puts every player on a landmass of their own', () => {
    for (const seed of [1, 2, 3, 4]) {
      const lands = startLandmasses({ ...base, landmass: 'islands', starts: 'separate' }, seed);
      expect(new Set(lands).size).toBe(3);
    }
  });

  it('together puts every player on the same landmass', () => {
    for (const seed of [1, 2, 3, 4]) {
      const lands = startLandmasses({ ...base, landmass: 'continents', starts: 'together' }, seed);
      expect(new Set(lands).size).toBe(1);
    }
  });

  it('auto still works, and an impossible request says so instead of hanging', () => {
    expect(startLandmasses({ ...base, starts: 'auto' }, 1)).toHaveLength(3);
    expect(() => generateWorld({ ...base, width: 40, height: 30, landmass: 'continents', waterPercent: 85, players: 6, starts: 'separate' }, 1))
      .toThrow(/landmass of their own/);
  });
});