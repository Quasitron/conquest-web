import type { Pos } from '../engine';
import type { Camera } from './camera';

export interface Pt { x: number; y: number }
export interface Size { w: number; h: number }
export interface Rect { left: number; top: number; w: number; h: number }

const MARGIN = 8;
/** Clear space kept between the city and a dialog that sits beside it. */
const GAP = 48;

/**
 * Screen (client) position of the center of a city square, or null when it is outside the canvas.
 * On wrapping maps the copy of the map that lies inside the canvas is used.
 */
export function cityScreenPoint(cam: Camera, city: Pos, mapW: number, wrap: boolean, canvas: Rect): Pt | null {
  const sy = (city.y + 0.5 - cam.y) * cam.tile;
  const shifts = wrap ? [0, -mapW, mapW] : [0];
  for (const shift of shifts) {
    const sx = (city.x + shift + 0.5 - cam.x) * cam.tile;
    if (sx >= 0 && sx <= canvas.w && sy >= 0 && sy <= canvas.h) return { x: canvas.left + sx, y: canvas.top + sy };
  }
  return null;
}

/** Top-left of a dialog: beside the anchor (right side first) where there is room, else centered. */
export function placeDialog(anchor: Pt | null, size: Size, vp: Size): Pt {
  const centered = { x: Math.max(MARGIN, (vp.w - size.w) / 2), y: Math.max(MARGIN, (vp.h - size.h) / 2) };
  if (!anchor) return centered;
  const top = Math.min(Math.max(MARGIN, anchor.y - size.h / 2), Math.max(MARGIN, vp.h - size.h - MARGIN));
  const right = anchor.x + GAP;
  if (right + size.w <= vp.w - MARGIN) return { x: right, y: top };
  const left = anchor.x - GAP - size.w;
  if (left >= MARGIN) return { x: left, y: top };
  return centered;
}

/** The point on the rectangle's border nearest to `to`; null when `to` lies inside the rectangle. */
export function nearestEdgePoint(r: Rect, to: Pt): Pt | null {
  const x = Math.min(Math.max(to.x, r.left), r.left + r.w);
  const y = Math.min(Math.max(to.y, r.top), r.top + r.h);
  return x === to.x && y === to.y ? null : { x, y };
}
