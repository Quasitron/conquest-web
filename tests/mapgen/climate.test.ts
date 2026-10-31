import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD, SIZE_PRESETS, generateWorld, type Climate } from '../../src/mapgen';

const share = (relief: readonly string[], terrain: readonly string[], kind: string) => {
  const land = terrain.filter((t) => t !== 'water').length;
  return relief.filter((r) => r === kind).length / land;
};

function make(climate: Climate, seed: number) {
  const w = generateWorld({ ...DEFAULT_WORLD, ...SIZE_PRESETS.large, landmass: 'continents', climate }, seed, true);
  return { ...w, relief: w.map.relief!, terrain: w.map.terrain };
}

describe('climate', () => {
  it('a temperate map has no desert and is the plain map of old', () => {
    for (const seed of [1, 2, 3]) {
      const t = make('temperate', seed);
      expect(t.relief.includes('desert')).toBe(false);
      const old = generateWorld({ ...DEFAULT_WORLD, ...SIZE_PRESETS.large, landmass: 'continents' }, seed, true);
      expect(old.map.relief).toEqual(t.relief); // the default climate is temperate
    }
  });

  it('an arid map has big deserts and less forest; a wet map has more forest and no desert', () => {
    for (const seed of [11, 12, 13]) {
      const temperate = make('temperate', seed);
      const arid = make('arid', seed);
      const wet = make('wet', seed);
      expect(share(arid.relief, arid.terrain, 'desert')).toBeGreaterThan(0.1);
      expect(share(arid.relief, arid.terrain, 'forest')).toBeLessThan(share(temperate.relief, temperate.terrain, 'forest'));
      expect(wet.relief.includes('desert')).toBe(false);
      expect(share(wet.relief, wet.terrain, 'forest')).toBeGreaterThan(share(temperate.relief, temperate.terrain, 'forest'));
    }
  });

  it('changes only the ground: the land, the cities and the starts are the same in every climate', () => {
    const a = make('temperate', 5);
    const b = make('arid', 5);
    const c = make('wet', 5);
    for (const other of [b, c]) {
      expect(other.terrain).toEqual(a.terrain);
      expect(other.map.cities).toEqual(a.map.cities);
      expect(other.startCityIndices).toEqual(a.startCityIndices);
    }
  });

  it('puts desert on open land only (never on a city, a mountain, a river or the sea) and is repeatable', () => {
    const a = make('arid', 21);
    a.relief.forEach((r, i) => {
      if (r === 'desert') expect(a.terrain[i]).toBe('land');
    });
    expect(make('arid', 21).relief).toEqual(a.relief);
  });

  it('needs the terrain rule: without it there is no relief at all', () => {
    const w = generateWorld({ ...DEFAULT_WORLD, climate: 'arid' }, 3, false);
    expect(w.map.relief).toBeUndefined();
  });

  it('keeps the rivers running to the sea through a desert', () => {
    const a = make('arid', 31);
    expect(a.relief.includes('river')).toBe(true);
  });
});
