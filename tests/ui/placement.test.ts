import { describe, it, expect } from 'vitest';
import { cityScreenPoint, nearestEdgePoint, placeDialog } from '../../src/ui/placement';

const canvas = { left: 10, top: 20, w: 800, h: 600 };

describe('cityScreenPoint', () => {
  it('gives the square center in client coordinates', () => {
    const p = cityScreenPoint({ x: 2, y: 3, tile: 20 }, { x: 12, y: 8 }, 100, false, canvas);
    expect(p).toEqual({ x: 10 + 10.5 * 20, y: 20 + 5.5 * 20 });
  });

  it('is null when the city is outside the canvas', () => {
    expect(cityScreenPoint({ x: 0, y: 0, tile: 20 }, { x: 90, y: 5 }, 100, false, canvas)).toBeNull();
  });

  it('uses the wrapped copy of the map that is in view', () => {
    const p = cityScreenPoint({ x: 95, y: 0, tile: 20 }, { x: 2, y: 5 }, 100, true, canvas);
    expect(p).toEqual({ x: 10 + (2 + 100 + 0.5 - 95) * 20, y: 20 + 5.5 * 20 });
  });
});

describe('placeDialog', () => {
  const vp = { w: 1200, h: 800 };
  const size = { w: 360, h: 400 };

  it('sits to the right of the city when there is room', () => {
    expect(placeDialog({ x: 500, y: 400 }, size, vp)).toEqual({ x: 548, y: 200 });
  });

  it('falls back to the left side, then to the center', () => {
    expect(placeDialog({ x: 1000, y: 400 }, size, vp)).toEqual({ x: 1000 - 48 - 360, y: 200 });
    expect(placeDialog({ x: 500, y: 400 }, { w: 700, h: 400 }, vp)).toEqual({ x: 250, y: 200 });
  });

  it('keeps the dialog inside the window vertically', () => {
    expect(placeDialog({ x: 300, y: 10 }, size, vp).y).toBe(8);
    expect(placeDialog({ x: 300, y: 790 }, size, vp).y).toBe(392);
  });

  it('is centered when the city is off screen', () => {
    expect(placeDialog(null, size, vp)).toEqual({ x: 420, y: 200 });
  });
});

describe('nearestEdgePoint', () => {
  const r = { left: 100, top: 100, w: 200, h: 100 };

  it('clamps the target onto the border', () => {
    expect(nearestEdgePoint(r, { x: 50, y: 150 })).toEqual({ x: 100, y: 150 });
    expect(nearestEdgePoint(r, { x: 400, y: 20 })).toEqual({ x: 300, y: 100 });
  });

  it('is null when the target is inside the rectangle', () => {
    expect(nearestEdgePoint(r, { x: 150, y: 150 })).toBeNull();
  });
});
