import { describe, it, expect } from 'vitest';
import { centerOn, clampCamera, mapToScreen, screenToMap, zoomAt, MAX_TILE, MIN_TILE } from '../../src/ui/camera';

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
