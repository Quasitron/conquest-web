import { Rng } from '../engine/rng';

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Seeded multi-octave value noise, normalized to [0, 1]. Wraps horizontally when `wrap` is true. */
export function heightField(
  width: number, height: number, wrap: boolean, baseCell: number, seed: number, octaves = 4,
): number[] {
  const rng = new Rng(seed);
  const out = new Array<number>(width * height).fill(0);
  let amp = 1;
  let totalAmp = 0;
  let cell = baseCell;
  for (let o = 0; o < octaves; o++) {
    const cols = Math.max(1, Math.round(width / cell));
    const rows = Math.max(1, Math.round(height / cell));
    const cellX = width / cols;
    const cellY = height / rows;
    const gridW = cols + 1;
    const grid = Array.from({ length: gridW * (rows + 1) }, () => rng.next());
    const at = (i: number, j: number) => grid[j * gridW + (wrap ? i % cols : i)];
    for (let y = 0; y < height; y++) {
      const fy = (y + 0.5) / cellY;
      const j0 = Math.min(rows - 1, Math.floor(fy));
      const ty = smooth(Math.min(1, fy - j0));
      for (let x = 0; x < width; x++) {
        const fx = (x + 0.5) / cellX;
        const i0 = Math.min(cols - 1, Math.floor(fx));
        const tx = smooth(Math.min(1, fx - i0));
        const top = at(i0, j0) * (1 - tx) + at(i0 + 1, j0) * tx;
        const bottom = at(i0, j0 + 1) * (1 - tx) + at(i0 + 1, j0 + 1) * tx;
        out[y * width + x] += amp * (top * (1 - ty) + bottom * ty);
      }
    }
    totalAmp += amp;
    amp /= 2;
    cell = Math.max(2, cell / 2);
  }
  return out.map((v) => v / totalAmp);
}
