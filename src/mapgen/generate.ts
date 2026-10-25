import type { ParsedMap } from '../engine/ascii';
import type { Terrain } from '../engine/types';
import { Rng } from '../engine/rng';
import { validateMapSize } from '../engine/limits';
import { BASE_CELL, LAND_PER_CITY, type WorldOptions } from './options';
import { heightField } from './noise';
import { labelLand, thresholdLand } from './land';
import { placeCities } from './cities';
import { chooseStarts } from './starts';
import { assignCityNames } from './names';

export interface GeneratedWorld {
  map: ParsedMap;
  startCityIndices: number[];
  seedUsed: number;
  cityNames: string[];
}

const ATTEMPTS = 50;
const MIN_ISLAND = 4;

function attempt(o: WorldOptions, seed: number, minOthers: number): GeneratedWorld | null {
  const { width, height, wrap } = o;
  const h = heightField(width, height, wrap, BASE_CELL[o.landmass], seed);
  const { land, labels } = labelLand(thresholdLand(h, width, height, o.waterPercent), width, height, wrap, MIN_ISLAND);
  const landCount = land.filter(Boolean).length;
  const target = Math.max(o.players * (minOthers + 1), Math.round(landCount / LAND_PER_CITY[o.cityDensity]));
  const cities = placeCities(land, width, height, wrap, target, new Rng(seed ^ 0x9e3779b9));
  const starts = chooseStarts(cities, labels, width, wrap, o.players, minOthers, o.starts ?? 'auto');
  if (!starts) return null;
  const terrain: Terrain[] = land.map((l) => (l ? 'land' : 'water'));
  for (const c of cities) terrain[c.y * width + c.x] = 'city';
  return {
    map: { width, height, terrain, cities },
    startCityIndices: starts,
    seedUsed: seed,
    cityNames: assignCityNames(cities.length, seed, o.nameRegion),
  };
}

export function generateWorld(o: WorldOptions, seed: number): GeneratedWorld {
  const sizeError = validateMapSize(o.width, o.height);
  if (sizeError) throw new Error(sizeError);
  if (!Number.isInteger(o.players) || o.players < 2 || o.players > 6) throw new Error('players must be 2 to 6');
  if (o.waterPercent < 60 || o.waterPercent > 85) throw new Error('water must be 60% to 85%');
  for (let k = 0; k < ATTEMPTS; k++) {
    const w = attempt(o, (seed + k) | 0, 3);
    if (w) return w;
  }
  for (let k = 0; k < ATTEMPTS; k++) {
    const w = attempt(o, (seed + k) | 0, 0);
    if (w) return w;
  }
  if (o.starts === 'separate') throw new Error('could not give every player a landmass of their own; try more islands, a larger map, or fewer players');
  if (o.starts === 'together') throw new Error('could not fit every player on one landmass; try fewer islands, a larger map, or fewer players');
  throw new Error('could not generate a playable world; try less water or a larger map');
}
