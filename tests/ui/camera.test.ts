import { describe, it, expect } from 'vitest';
import { centerOn, clampCamera, mapToScreen, screenToMap, zoomAt, MAX_TILE, MIN_TILE, exploredBox, fitTile, autoFit, keepInView, keepInViewWrap } from '../../src/ui/camera';

describe('camera', () => {
  const cam = { x: 2, y: 3, tile: 20 };

  it('converts screen points to map squares', () => {
    expect(screenToMap(cam, 40, 30, false, 0, 0)).toEqual({ x: 2, y: 3 });
    expect(screenToMap(cam, 40, 30, false, 39, 59)).toEqual({ x: 3, y: 5 });
    expect(mapToScreen(cam, 3, 5)).toEqual({ sx: 20, sy: 40 });
  });

  it('returns null off the map edges and wraps across the seam', () => {
    expect(screenToMap({ x: -1, y: 0, tile: 20 }, 40, 30, false, 5, 5)).toBeNull();
    expect(screenToMap({ x: 0, y: -1, tile: 20 }, 40, 30, true, 5, 5)).toBeNull();
    expect(screenToMap({ x: -1, y: 0, tile: 20 }, 40, 30, true, 5, 5)).toEqual({ x: 39, y: 0 });
    expect(screenToMap({ x: 39, y: 0, tile: 20 }, 40, 30, true, 25, 5)).toEqual({ x: 0, y: 0 });
  });

  it('zooms around the cursor and clamps tile size', () => {
    const z = zoomAt(cam, 2, 100, 100);
    expect(z.tile).toBe(40);
    expect(screenToMap(z, 40, 30, false, 100, 100)).toEqual(screenToMap(cam, 40, 30, false, 100, 100));
    expect(zoomAt(cam, 100, 0, 0).tile).toBe(MAX_TILE);
    expect(zoomAt(cam, 0.01, 0, 0).tile).toBe(MIN_TILE);
  });

  it('centers on a square and clamps to the map', () => {
    const c = centerOn(cam, 10, 10, 200, 100);
    expect(screenToMap(c, 40, 30, false, 100, 50)).toEqual({ x: 10, y: 10 });
    const clamped = clampCamera({ x: -100, y: 500, tile: 20 }, 40, 30, 200, 100, false);
    expect(clamped.x).toBeGreaterThanOrEqual(-5);
    expect(clamped.y).toBeLessThanOrEqual(30);
    expect(clampCamera({ x: 45, y: 0, tile: 20 }, 40, 30, 200, 100, true).x).toBe(5);
  });
});

describe('auto-fit', () => {
  const grid = (w: number, h: number, cols: number[], rows: number[]) => {
    const t: (unknown | null)[] = new Array(w * h).fill(null);
    for (const y of rows) for (const x of cols) t[y * w + x] = 1;
    return t;
  };

  it('boxes the explored squares and clamps the fit tile', () => {
    const t = grid(60, 45, [10, 11, 12, 13, 14], [20, 21, 22]);
    const box = exploredBox(t, 60, 45, false);
    expect(box).toEqual({ x: 10, y: 20, w: 5, h: 3 });
    expect(MAX_TILE).toBe(96);
    expect(fitTile(box!, 800, 600)).toBe(85);
    expect(fitTile(box!, 1200, 900)).toBe(96);
  });

  it('takes the shortest circular span on wrapping maps', () => {
    const t = grid(60, 45, [0, 1, 58, 59], [5]);
    const box = exploredBox(t, 60, 45, true);
    expect(box!.w).toBe(4);
    expect(box!.x).toBe(58);
  });

  it('returns null when nothing is explored', () => {
    expect(exploredBox(grid(10, 10, [], []), 10, 10, true)).toBeNull();
  });

  it('applies and lowers the zoom ceiling', () => {
    const box = { x: 0, y: 0, w: 20, h: 10 };
    const fit = fitTile(box, 24 * 60, 14 * 60);
    expect(fit).toBe(60);
    expect(autoFit(box, 24 * 60, 14 * 60, 40).cam.tile).toBe(40);
    expect(autoFit(box, 24 * 60, 14 * 60, 40).ceiling).toBe(40);
    const small = autoFit(box, 24 * 30, 14 * 30, 40);
    expect(small.cam.tile).toBe(30);
    expect(small.ceiling).toBe(30);
    expect(autoFit(box, 24 * 60, 14 * 60, null).cam.tile).toBe(60);
  });

  it('centres on the box', () => {
    const { cam } = autoFit({ x: 10, y: 20, w: 4, h: 2 }, 600, 400, null);
    expect(cam.x + 600 / cam.tile / 2).toBeCloseTo(12);
    expect(cam.y + 400 / cam.tile / 2).toBeCloseTo(21);
  });

  it('keeps a square in view with the smallest pan', () => {
    const cam = { x: 0, y: 0, tile: 20 };
    expect(keepInView(cam, { x: 5, y: 5 }, 200, 200)).toEqual(cam);
    const c = keepInView(cam, { x: 30, y: 5 }, 200, 200);
    expect(c.tile).toBe(20);
    expect(c.y).toBe(0);
    expect(c.x).toBe(30 + 1 + 1 - 10);
    expect(keepInView(cam, { x: -4, y: 5 }, 200, 200).x).toBe(-5);
  });
});
describe('keepInViewWrap', () => {
  it('does not pan the long way across the seam', () => {
    const cam = { x: 56, y: 0, tile: 10 };
    // 200px / 10 = 20 columns visible: 56..76, i.e. columns 56..59 and 0..15 on a 60-wide map.
    expect(keepInViewWrap(cam, { x: 2, y: 5 }, 200, 200, 60, true)).toEqual(cam);
    const c = keepInViewWrap(cam, { x: 20, y: 5 }, 200, 200, 60, true);
    expect(c.x).toBe(62);
    // On a flat map it is plain keepInView.
    expect(keepInViewWrap({ x: 0, y: 0, tile: 10 }, { x: 30, y: 5 }, 200, 200, 60, false))
      .toEqual(keepInView({ x: 0, y: 0, tile: 10 }, { x: 30, y: 5 }, 200, 200));
  });
});