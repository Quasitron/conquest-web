import type { Pos, Relief, Terrain } from './types';

export interface ParsedMap {
  width: number;
  height: number;
  terrain: Terrain[];
  /** Present when the map has terrain (see Relief); same indexing as `terrain`. */
  relief?: Relief[];
  cities: Pos[];
}

const CHARS: Record<string, Terrain> = { '.': 'water', '#': 'land', '*': 'city' };
/** Land squares with terrain, for tests: rough, river, forest, mountain. */
const RELIEF_CHARS: Record<string, Relief> = { r: 'rough', v: 'river', f: 'forest', m: 'mountain' };

/** Builds a map from rows of '.', '#', '*' (water, land, city), and 'r', 'v', 'f', 'm' (rough, river, forest, mountain land). */
export function parseAscii(rows: string[]): ParsedMap {
  const width = rows[0]?.length ?? 0;
  const terrain: Terrain[] = [];
  const relief: Relief[] = [];
  const cities: Pos[] = [];
  let hasRelief = false;
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} has length ${row.length}, expected ${width}`);
    [...row].forEach((ch, x) => {
      const ground = RELIEF_CHARS[ch];
      const t = ground ? 'land' : CHARS[ch];
      if (!t) throw new Error(`unknown map character '${ch}' at ${x},${y}`);
      terrain.push(t);
      relief.push(ground ?? 'clear');
      if (ground) hasRelief = true;
      if (t === 'city') cities.push({ x, y });
    });
  });
  return { width, height: rows.length, terrain, ...(hasRelief ? { relief } : {}), cities };
}
