export function wrapX(w: number, wrap: boolean, x: number): number | null {
  if (wrap) return ((x % w) + w) % w;
  return x >= 0 && x < w ? x : null;
}

export function forNeighbors(
  w: number, h: number, wrap: boolean, x: number, y: number, fn: (nx: number, ny: number) => void,
): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ny = y + dy;
      if (ny < 0 || ny >= h) continue;
      const nx = wrapX(w, wrap, x + dx);
      if (nx !== null) fn(nx, ny);
    }
  }
}

export function chebyshevDist(w: number, wrap: boolean, ax: number, ay: number, bx: number, by: number): number {
  let dx = Math.abs(ax - bx);
  if (wrap) dx = Math.min(dx, w - dx);
  return Math.max(dx, Math.abs(ay - by));
}
