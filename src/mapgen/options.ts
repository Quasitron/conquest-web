import type { NameRegion } from '../data/cityNames';

export type SizePreset = 'small' | 'medium' | 'large' | 'huge';
export type Landmass = 'islands' | 'mixed' | 'continents';
export type CityDensity = 'low' | 'normal' | 'high';

export const SIZE_PRESETS: Record<SizePreset, { width: number; height: number }> = {
  small: { width: 40, height: 30 },
  medium: { width: 60, height: 45 },
  large: { width: 100, height: 70 },
  huge: { width: 150, height: 100 },
};

export interface WorldOptions {
  width: number;
  height: number;
  wrap: boolean;
  /** 60..85 */
  waterPercent: number;
  landmass: Landmass;
  cityDensity: CityDensity;
  /** 2..6 */
  players: number;
  /** Which region's city names come first. */
  nameRegion: NameRegion | 'world';
}

export const DEFAULT_WORLD: WorldOptions = {
  ...SIZE_PRESETS.medium,
  wrap: false,
  waterPercent: 70,
  landmass: 'mixed',
  cityDensity: 'normal',
  players: 2,
  nameRegion: 'world',
};

/** Land squares per city. */
export const LAND_PER_CITY: Record<CityDensity, number> = { low: 30, normal: 20, high: 13 };

/** Noise lattice spacing in squares for the first octave. */
export const BASE_CELL: Record<Landmass, number> = { islands: 6, mixed: 10, continents: 16 };
