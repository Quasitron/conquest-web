import type { Pos } from '../engine/types';
import type { RandomSource } from '../engine/rng';
import { chebyshevDist, forNeighbors } from './grid';

const MIN_CITY_SPACING = 3;
const COASTAL_SHARE = 0.7;

function shuffle<T>(xs: T[], rng: RandomSource): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** Places up to `target` cities on land, MIN_CITY_SPACING apart, about 70% coastal. Row-major order. */
export function placeCities(
  land: boolean[], width: number, height: number, wrap: boolean, target: number, rng: RandomSource,
): Pos[] {
  const coastal: Pos[] = [];
  const inland: Pos[] = [];
  for (let i = 0; i < land.length; i++) {
    if (!land[i]) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    let nearWater = false;
    forNeighbors(width, height, wrap, x, y, (nx, ny) => {
      if (!land[ny * width + nx]) nearWater = true;
    });
    (nearWater ? coastal : inland).push({ x, y });
  }
  shuffle(coastal, rng);
  shuffle(inland, rng);

  const picked: Pos[] = [];
  const fits = (p: Pos) => picked.every((q) => chebyshevDist(width, wrap, p.x, p.y, q.x, q.y) >= MIN_CITY_SPACING);
  const take = (pool: Pos[], limit: number) => {
    for (const p of pool) {
      if (picked.length >= limit) return;
      if (fits(p)) picked.push(p);
    }
  };
  take(coastal, Math.round(target * COASTAL_SHARE));
  take(inland, target);
  take(coastal, target);
  return picked.sort((a, b) => a.y - b.y || a.x - b.x);
}
