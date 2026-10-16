import type { Pos } from '../engine';

export interface Camera {
  /** Map coordinates (squares, fractional) at the viewport's top-left. */
  x: number;
  y: number;
  /** Tile size in CSS pixels. */
  tile: number;
}

export const MIN_TILE = 12;
export const MAX_TILE = 96;

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

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box (in squares) of explored terrain; on wrap maps the shortest circular column span. */
export function exploredBox(terrain: readonly (unknown | null)[], width: number, height: number, wrap: boolean): Box | null {
  const col = new Array<boolean>(width).fill(false);
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (terrain[y * width + x] != null) {
        col[x] = true;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxY < 0) return null;
  const h = maxY - minY + 1;
  if (!wrap) {
    const minX = col.indexOf(true);
    const maxX = col.lastIndexOf(true);
    return { x: minX, y: minY, w: maxX - minX + 1, h };
  }
  // Largest circular run of unexplored columns; the box is its complement.
  let bestLen = 0;
  let bestEnd = -1;
  for (let s = 0; s < width; s++) {
    if (col[s] || col[mod(s - 1, width)] === false) continue;
    let len = 0;
    while (len < width && !col[mod(s + len, width)]) len++;
    if (len > bestLen) {
      bestLen = len;
      bestEnd = s + len - 1;
    }
  }
  if (bestLen === 0) return { x: 0, y: minY, w: width, h };
  return { x: mod(bestEnd + 1, width), y: minY, w: width - bestLen, h };
}

export function fitTile(box: Box, viewW: number, viewH: number, margin = 2): number {
  const fit = Math.floor(Math.min(viewW / (box.w + 2 * margin), viewH / (box.h + 2 * margin)));
  return Math.min(MAX_TILE, Math.max(MIN_TILE, fit));
}

/** Fits the box in view, never above the ceiling; the returned ceiling is the tile used. */
export function autoFit(box: Box, viewW: number, viewH: number, ceiling: number | null): { cam: Camera; ceiling: number } {
  const fit = fitTile(box, viewW, viewH);
  const tile = ceiling === null ? fit : Math.min(ceiling, fit);
  const cam = {
    tile,
    x: box.x + box.w / 2 - viewW / (2 * tile),
    y: box.y + box.h / 2 - viewH / (2 * tile),
  };
  return { cam, ceiling: tile };
}

/** Smallest pan that keeps square p at least one square inside the viewport. */
export function keepInView(cam: Camera, p: Pos, viewW: number, viewH: number): Camera {
  const vw = viewW / cam.tile;
  const vh = viewH / cam.tile;
  let { x, y } = cam;
  if (p.x < x + 1) x = p.x - 1;
  else if (p.x + 1 > x + vw - 1) x = p.x + 2 - vw;
  if (p.y < y + 1) y = p.y - 1;
  else if (p.y + 1 > y + vh - 1) y = p.y + 2 - vh;
  return x === cam.x && y === cam.y ? cam : { ...cam, x, y };
}

/**
 * keepInView for wrapping maps: p is first moved to the copy of its column nearest the camera, so the pan
 * never goes the long way round. Run the result through clampCamera to bring x back into range.
 */
export function keepInViewWrap(cam: Camera, p: Pos, viewW: number, viewH: number, mapW: number, wrap: boolean): Camera {
  if (!wrap) return keepInView(cam, p, viewW, viewH);
  const centre = cam.x + viewW / cam.tile / 2;
  const x = p.x + mapW * Math.round((centre - p.x - 0.5) / mapW);
  return keepInView(cam, { x, y: p.y }, viewW, viewH);
}