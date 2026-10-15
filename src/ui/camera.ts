import type { Pos } from '../engine';

export interface Camera {
  /** Map coordinates (squares, fractional) at the viewport's top-left. */
  x: number;
  y: number;
  /** Tile size in CSS pixels. */
  tile: number;
}

export const MIN_TILE = 12;
export const MAX_TILE = 48;

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function screenToMap(cam: Camera, mapW: number, mapH: number, wrap: boolean, sx: number, sy: number): Pos | null {
  let x = Math.floor(cam.x + sx / cam.tile);
  const y = Math.floor(cam.y + sy / cam.tile);
  if (y < 0 || y >= mapH) return null;
  if (wrap) x = mod(x, mapW);
  else if (x < 0 || x >= mapW) return null;
  return { x, y };
}

export function mapToScreen(cam: Camera, x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - cam.x) * cam.tile, sy: (y - cam.y) * cam.tile };
}

export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): Camera {
  const tile = Math.min(MAX_TILE, Math.max(MIN_TILE, cam.tile * factor));
  const px = cam.x + sx / cam.tile;
  const py = cam.y + sy / cam.tile;
  return { tile, x: px - sx / tile, y: py - sy / tile };
}

export function pan(cam: Camera, dxPx: number, dyPx: number): Camera {
  return { ...cam, x: cam.x - dxPx / cam.tile, y: cam.y - dyPx / cam.tile };
}

export function centerOn(cam: Camera, x: number, y: number, viewW: number, viewH: number): Camera {
  return { ...cam, x: x + 0.5 - viewW / (2 * cam.tile), y: y + 0.5 - viewH / (2 * cam.tile) };
}

/** Keeps at least half a viewport of map in view; wraps x on wrapping maps. */
export function clampCamera(cam: Camera, mapW: number, mapH: number, viewW: number, viewH: number, wrap: boolean): Camera {
  const halfW = viewW / cam.tile / 2;
  const halfH = viewH / cam.tile / 2;
  const y = Math.min(mapH - halfH, Math.max(-halfH, cam.y));
  const x = wrap ? mod(cam.x, mapW) : Math.min(mapW - halfW, Math.max(-halfW, cam.x));
  return { ...cam, x, y };
}
