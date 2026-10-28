import type { Dir, GameState, Pos, Relief, Terrain } from './types';

export type MapLike = Pick<GameState, 'width' | 'height' | 'wrap' | 'terrain' | 'relief'>;

/** Offsets for Dir 0..7: N, NE, E, SE, S, SW, W, NW. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

export function normalize(m: MapLike, x: number, y: number): Pos | null {
  if (y < 0 || y >= m.height) return null;
  if (m.wrap) x = ((x % m.width) + m.width) % m.width;
  else if (x < 0 || x >= m.width) return null;
  return { x, y };
}

export function step(m: MapLike, x: number, y: number, dir: Dir): Pos | null {
  const [dx, dy] = DIRS[dir];
  return normalize(m, x + dx, y + dy);
}

export function index(m: MapLike, x: number, y: number): number {
  return y * m.width + x;
}

export function terrainAt(m: MapLike, x: number, y: number): Terrain {
  return m.terrain[index(m, x, y)];
}

/** The ground on a square: 'clear' on a map without terrain, and on water and cities. */
export function reliefAt(m: MapLike, x: number, y: number): Relief {
  const i = index(m, x, y);
  return m.terrain[i] === 'land' ? (m.relief?.[i] ?? 'clear') : 'clear';
}

export function neighbors(m: MapLike, x: number, y: number): Pos[] {
  const result: Pos[] = [];
  for (let d = 0; d < 8; d++) {
    const p = step(m, x, y, d as Dir);
    if (p) result.push(p);
  }
  return result;
}

/** King-move distance, wrap-aware. */
export function chebyshev(m: MapLike, a: Pos, b: Pos): number {
  let dx = Math.abs(a.x - b.x);
  if (m.wrap) dx = Math.min(dx, m.width - dx);
  return Math.max(dx, Math.abs(a.y - b.y));
}

export function isCoastal(m: MapLike, x: number, y: number): boolean {
  return neighbors(m, x, y).some((p) => terrainAt(m, p.x, p.y) === 'water');
}
