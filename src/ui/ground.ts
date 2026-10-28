import type { PlayerView, Relief } from '../engine';

/** Flat colours for each kind of ground: the map at small zoom, the minimap, and the base under the drawn details. */
export const GROUND_COLORS: Record<Relief, string> = {
  clear: '#5f8f4a',
  rough: '#8c7b4c',
  river: '#5f8f4a',
  forest: '#2f6a35',
  mountain: '#7b7e86',
};

export const GROUND_NAMES: Record<Relief, string> = {
  clear: 'Clear', rough: 'Rough', river: 'River', forest: 'Forest', mountain: 'Mountains',
};

/** One line saying what the ground does, for the info panel (the Advanced rules, Appendix III of the manual). */
export const GROUND_HINTS: Record<Relief, string> = {
  clear: 'No effect on movement or combat.',
  rough: 'Armor can only move one square here.',
  river: 'Armor can only move one square here. Land units defend at double against Armor.',
  forest: 'Armor can only move one square here. Land units defend at double against Armor, aircraft and ships.',
  mountain: 'Armor cannot enter. Land units defend at double against Armor, aircraft and ships.',
};

/** The known ground of a square, or null when the map has no terrain, the square is unexplored, or it is not land. */
export function groundAt(view: PlayerView, x: number, y: number): Relief | null {
  const i = y * view.width + x;
  if (view.terrain[i] !== 'land') return null;
  return view.relief?.[i] ?? null;
}

const hash = (x: number, y: number, k: number): number => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Draws one land square's ground: the flat colour, then, from about 14 px, a few details that tell the kinds apart
 * (tree tops, rocks, peaks, the line of a river). These are stand-ins until the terrain pictures replace them.
 */
export function drawGround(
  ctx: CanvasRenderingContext2D, view: PlayerView, ground: Relief, mx: number, my: number, sx: number, sy: number, t: number,
): void {
  ctx.fillStyle = GROUND_COLORS[ground];
  ctx.fillRect(sx, sy, t, t);
  if (t < 14 || ground === 'clear') return;
  const r = (k: number) => hash(mx, my, k);
  if (ground === 'forest') {
    ctx.fillStyle = '#1f4f27';
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(sx + t * (0.18 + 0.64 * r(k)), sy + t * (0.18 + 0.64 * r(k + 9)), t * (0.1 + 0.05 * r(k + 18)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4b8a44';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(sx + t * (0.2 + 0.6 * r(k + 30)) - t * 0.03, sy + t * (0.2 + 0.6 * r(k + 40)) - t * 0.03, t * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (ground === 'rough') {
    ctx.fillStyle = '#6a5c36';
    for (let k = 0; k < 6; k++) ctx.fillRect(sx + t * (0.1 + 0.75 * r(k)), sy + t * (0.1 + 0.75 * r(k + 9)), t * 0.08, t * 0.06);
    ctx.fillStyle = '#a89868';
    for (let k = 0; k < 4; k++) ctx.fillRect(sx + t * (0.1 + 0.75 * r(k + 20)), sy + t * (0.1 + 0.75 * r(k + 30)), t * 0.06, t * 0.05);
  } else if (ground === 'mountain') {
    for (const [cx, base, w, hgt] of [[0.3, 0.72, 0.42, 0.46], [0.66, 0.8, 0.5, 0.58]] as const) {
      const px = sx + t * cx;
      const by = sy + t * base;
      ctx.fillStyle = '#5a5d66';
      ctx.beginPath();
      ctx.moveTo(px - t * w / 2, by);
      ctx.lineTo(px, by - t * hgt);
      ctx.lineTo(px + t * w / 2, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b9bcc4';
      ctx.beginPath();
      ctx.moveTo(px - t * w / 2, by);
      ctx.lineTo(px, by - t * hgt);
      ctx.lineTo(px + t * w * 0.05, by - t * hgt * 0.4);
      ctx.lineTo(px - t * w * 0.1, by);
      ctx.closePath();
      ctx.fill();
    }
  } else if (ground === 'river') {
    // A river runs from the middle of its square to each side that holds more river or the sea.
    const at = (x: number, y: number): Relief | 'water' | null => {
      if (y < 0 || y >= view.height) return null;
      if (view.wrap) x = ((x % view.width) + view.width) % view.width;
      else if (x < 0 || x >= view.width) return null;
      const i = y * view.width + x;
      return view.terrain[i] === 'water' ? 'water' : view.terrain[i] === 'land' ? view.relief?.[i] ?? null : null;
    };
    const sides: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const links = sides.filter(([dx, dy]) => {
      const n = at(mx + dx, my + dy);
      return n === 'river' || n === 'water';
    });
    ctx.strokeStyle = '#2f6fa8';
    ctx.lineWidth = Math.max(2, t * 0.16);
    ctx.lineCap = 'round';
    const mid = { x: sx + t / 2, y: sy + t / 2 };
    ctx.beginPath();
    if (links.length === 0) links.push([0, 1]);
    for (const [dx, dy] of links) {
      ctx.moveTo(mid.x, mid.y);
      ctx.lineTo(mid.x + dx * t / 2, mid.y + dy * t / 2);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
}
