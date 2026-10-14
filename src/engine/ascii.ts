import type { Pos, Terrain } from './types';

export interface ParsedMap {
  width: number;
  height: number;
  terrain: Terrain[];
  cities: Pos[];
}

const CHARS: Record<string, Terrain> = { '.': 'water', '#': 'land', '*': 'city' };

/** Builds a map from rows of '.', '#', '*' (water, land, city). */
export function parseAscii(rows: string[]): ParsedMap {
  const width = rows[0]?.length ?? 0;
  const terrain: Terrain[] = [];
  const cities: Pos[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} has length ${row.length}, expected ${width}`);
    [...row].forEach((ch, x) => {
      const t = CHARS[ch];
      if (!t) throw new Error(`unknown map character '${ch}' at ${x},${y}`);
      terrain.push(t);
      if (t === 'city') cities.push({ x, y });
    });
  });
  return { width, height: rows.length, terrain, cities };
}
