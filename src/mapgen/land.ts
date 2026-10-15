import { forNeighbors } from './grid';

/**
 * Land = interior squares whose height is at or above the waterPercent percentile of interior heights.
 * The top and bottom rows are always water.
 */
export function thresholdLand(h: number[], width: number, height: number, waterPercent: number): boolean[] {
  const interior = h.slice(width, (height - 1) * width);
  const sorted = [...interior].sort((a, b) => a - b);
  const cut = sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * waterPercent) / 100))];
  return h.map((v, i) => {
    const y = Math.floor(i / width);
    return y > 0 && y < height - 1 && v >= cut;
  });
}

/** Labels 8-connected land components; components smaller than minSize become water (label -1). */
export function labelLand(
  input: boolean[], width: number, height: number, wrap: boolean, minSize: number,
): { land: boolean[]; labels: number[]; sizes: number[] } {
  const land = [...input];
  const labels = new Array<number>(land.length).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < land.length; start++) {
    if (!land[start] || labels[start] !== -1) continue;
    const id = sizes.length;
    const members = [start];
    labels[start] = id;
    for (let k = 0; k < members.length; k++) {
      const i = members[k];
      forNeighbors(width, height, wrap, i % width, Math.floor(i / width), (nx, ny) => {
        const n = ny * width + nx;
        if (land[n] && labels[n] === -1) {
          labels[n] = id;
          members.push(n);
        }
      });
    }
    if (members.length < minSize) {
      for (const i of members) {
        land[i] = false;
        labels[i] = -2; // removed; reset below
      }
      sizes.push(0);
    } else {
      sizes.push(members.length);
    }
  }
  for (let i = 0; i < labels.length; i++) if (labels[i] === -2) labels[i] = -1;
  return { land, labels, sizes };
}
