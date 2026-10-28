import type { PlayerView, Relief } from '../engine';
import type { Camera } from './camera';
import { loaded } from './unitIcons';

/** What a square looks like: its ground, or the sea. A city stands on clear ground. */
export type Surface = Relief | 'water';

/** The terrain pictures (made by tools/make-terrain-tiles.ps1): one big continuous patch of ground each. */
const PICTURE: Record<Surface, string> = {
  water: '/art/terrain/water.webp',
  clear: '/art/terrain/clear.webp',
  river: '/art/terrain/clear.webp',
  rough: '/art/terrain/rough.webp',
  forest: '/art/terrain/forest.webp',
  mountain: '/art/terrain/mountain.webp',
};

/** A picture covers this many squares across and down before it repeats. */
const PERIOD_X = 12;
const PERIOD_Y = 8;
/** Smaller than this (in pixels per square) the picture is just its flat colour: the detail cannot be seen anyway. */
export const TEXTURE_MIN_TILE = 12;
/** From this size, squares of different ground fade into each other over their shared edges. */
export const BLEND_MIN_TILE = 24;
/** From this size each fade is cut from the picture at the square's own place (so the join is seamless); below, a stock sprite (much cheaper when many squares are in view). */
export const EXACT_FADE_TILE = 48;

/** The average colour of each picture, for the flat map, the minimap and while the pictures load. */
export const FLAT: Record<Surface, string> = {
  water: '#184c74', clear: '#5f8f4a', river: '#5f8f4a', rough: '#8c7650', forest: '#264e2e', mountain: '#7a7c82',
};

/** How far from a square's edge a neighbouring ground fades in, in squares (the coast uses a narrower strip). */
const REACH = 0.42;
const COAST_REACH = 0.2;

const SURFACES: Surface[] = ['water', 'clear', 'rough', 'forest', 'mountain'];

/** The five pictures, or null until all of them have loaded (loading starts the first time they are asked for). */
function pictures(): Record<Surface, HTMLImageElement> | null {
  if (typeof document === 'undefined') return null;
  const out = {} as Record<Surface, HTMLImageElement>;
  for (const s of SURFACES) {
    const img = loaded(PICTURE[s]);
    if (!img) return null;
    out[s] = img;
  }
  out.river = out.clear;
  return out;
}

/** The surface of a known square, or null when it is unexplored. */
export function surfaceAt(view: PlayerView, x: number, y: number): Surface | null {
  const i = y * view.width + x;
  const t = view.terrain[i];
  if (t === null) return null;
  if (t === 'water') return 'water';
  return view.relief?.[i] ?? 'clear';
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Smaller copies of a picture (a square cell of 78, 39, 26 or 13 px), so a small square is drawn from a copy near its
 * own size: that is much cheaper than shrinking the full picture for every square, and looks as good.
 */
const CELLS = [78, 39, 26, 13];
const mips = new Map<HTMLImageElement, { cell: number; src: CanvasImageSource }[]>();
function mipsOf(img: HTMLImageElement): { cell: number; src: CanvasImageSource }[] {
  let m = mips.get(img);
  if (!m) {
    m = CELLS.map((cell) => {
      if (cell === CELLS[0]) return { cell, src: img as CanvasImageSource };
      const c = document.createElement('canvas');
      c.width = cell * PERIOD_X;
      c.height = Math.round((img.naturalHeight / PERIOD_Y) * (cell / (img.naturalWidth / PERIOD_X))) * PERIOD_Y;
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, c.width, c.height);
      return { cell, src: c as CanvasImageSource };
    });
    mips.set(img, m);
  }
  return m;
}

/** Draws the part of a picture that belongs to map square (mx, my) into the pixel box (dx, dy, w, h). */
function cell(ctx: CanvasRenderingContext2D, img: HTMLImageElement, mx: number, my: number, dx: number, dy: number, w: number, h: number): void {
  const levels = mipsOf(img);
  // The smallest copy whose cell is still at least as big as the box.
  let lv = levels[0];
  for (const l of levels) if (l.cell >= Math.min(w, h)) lv = l;
  const src = lv.src as HTMLImageElement | HTMLCanvasElement;
  const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
  const cw = sw / periodX;
  const ch = sh / PERIOD_Y;
  const u = mod(mx, periodX) * cw;
  const v = mod(my, PERIOD_Y) * ch;
  if (u + cw <= sw + 1e-6) {
    ctx.drawImage(lv.src, u, v, cw, ch, dx, dy, w, h);
    return;
  }
  // A period that is not a whole number of squares (wrapping maps, see below) can end part-way through a square: that
  // square's picture continues from the picture's left edge.
  // The join falls on a whole pixel, so neither piece is left half-covered there (that showed as a thin dark line).
  const first = sw - u;
  const firstW = Math.min(w, Math.max(0, Math.round((w * first) / cw)));
  if (firstW > 0) ctx.drawImage(lv.src, u, v, first, ch, dx, dy, firstW, h);
  if (firstW < w) ctx.drawImage(lv.src, 0, v, cw - first, ch, dx + firstW, dy, w - firstW, h);
}

/**
 * How many squares across a picture covers before it repeats. 12, except on a map that wraps round: the picture must
 * then repeat a whole number of times across the map's width, or the ground would jump at the seam where the map wraps.
 * (The picture is stretched a little, never more than a few per cent for the usual widths.)
 */
let periodX = PERIOD_X;
let scratch: HTMLCanvasElement | null = null;
function scratchFor(size: number): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== size || scratch.height !== size) {
    scratch.width = size;
    scratch.height = size;
  }
  const c = scratch.getContext('2d')!;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, size, size);
  return c;
}

/**
 * The picture of `from` drawn over the square, faded out with distance from one side (0 N, 1 E, 2 S, 3 W) or one corner
 * (4 NE, 5 SE, 6 SW, 7 NW): fully visible (at `peak` opacity) on the edge, nothing at `reach` squares in.
 */
function fade(
  ctx: CanvasRenderingContext2D, img: HTMLImageElement, mx: number, my: number, dx: number, dy: number, size: number,
  where: number, reach: number, peak: number,
): void {
  const s = scratchFor(size);
  cell(s, img, mx, my, 0, 0, size, size);
  s.globalCompositeOperation = 'destination-in';
  const r = reach * size;
  let g: CanvasGradient;
  if (where < 4) {
    const [x0, y0, x1, y1] = [[0, 0, 0, r], [size, 0, size - r, 0], [0, size, 0, size - r], [0, 0, r, 0]][where];
    g = s.createLinearGradient(x0, y0, x1, y1);
  } else {
    const [cx, cy] = [[size, 0], [size, size], [0, size], [0, 0]][where - 4];
    g = s.createRadialGradient(cx, cy, 0, cx, cy, r);
  }
  g.addColorStop(0, `rgba(0,0,0,${peak})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  s.fillStyle = g;
  s.fillRect(0, 0, size, size);
  ctx.drawImage(scratch!, 0, 0, size, size, dx, dy, size, size);
}

/** At small sizes a fade is one ready-made picture per (ground, side or corner, size), the same wherever it is used. */
const sprites = new Map<string, HTMLCanvasElement>();
function fadeSprite(img: HTMLImageElement, name: string, size: number, where: number): HTMLCanvasElement {
  const key = `${name}:${where}:${size}`;
  let sp = sprites.get(key);
  if (!sp) {
    sp = document.createElement('canvas');
    sp.width = size;
    sp.height = size;
    fade(sp.getContext('2d')!, img, 3, 2, 0, 0, size, where, REACH, 0.5);
    sprites.set(key, sp);
  }
  return sp;
}

/**
 * The shore picture (public/art/terrain/shore.webp, made by tools/make-terrain-tiles.ps1): a strip of beach, 624 x 200,
 * water at the top, the foam line 53% of the way down, sand below it, both long edges fading to transparent.
 * It repeats along a coast every SHORE_PERIOD squares. Here it is turned into four copies, one for each side the sea
 * lies on, each flipped or turned so that its along-coast axis still runs the way the map's x or y does.
 */
const SHORE_PERIOD = 4;
const SHORE_WATER_FRACTION = 180 / 340;
let shoreSet: { img: HTMLImageElement; byWater: HTMLCanvasElement[] } | null = null;

/** Shore copies for the sea lying north, east, south and west of the coast, or null while the picture loads. */
function shorePictures(): { img: HTMLImageElement; byWater: HTMLCanvasElement[] } | null {
  if (typeof document === 'undefined') return null;
  const img = loaded('/art/terrain/shore.webp');
  if (!img) return null;
  if (shoreSet?.img === img) return shoreSet;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const make = (cw: number, ch: number, m: [number, number, number, number, number, number]): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d')!;
    g.setTransform(...m);
    g.drawImage(img, 0, 0);
    return c;
  };
  shoreSet = {
    img,
    byWater: [
      make(w, h, [1, 0, 0, 1, 0, 0]),
      make(h, w, [0, 1, -1, 0, h, 0]),
      make(w, h, [1, 0, 0, -1, 0, h]),
      make(h, w, [0, 1, 1, 0, 0, 0]),
    ],
  };
  return shoreSet;
}

/**
 * Lays the part of the shore that belongs to this square along its side `k` (0 N, 1 E, 2 S, 3 W), where the other kind
 * of ground lies. A sea square gets the shallows (the picture above the foam line), a land square the sand below it;
 * the foam line falls on the shared edge. The strip is cut by map position along the coast so neighbours join up.
 */
function shoreBand(
  ctx: CanvasRenderingContext2D, shore: { img: HTMLImageElement; byWater: HTMLCanvasElement[] }, sea: boolean, k: number,
  mx: number, my: number, left: number, top: number, right: number, bottom: number, trimStartPx: number, trimEndPx: number,
): boolean {
  // The square's edges are whole pixels shared with its neighbours (so the foam line is one line across the coast). The
  // band stops short of a coast corner (a rounded arc takes over there) by the arc's radius at each end, so they meet exactly.
  const size = right - left;
  const edgeLen = k === 0 || k === 2 ? right - left : bottom - top;
  const keep = (edgeLen - trimStartPx - trimEndPx) / edgeLen;
  const trimStart = trimStartPx / edgeLen;
  // When both ends are corners the two arcs may leave a pixel or two of the edge between them, so even a thin band is drawn.
  if (keep <= 0) return true;
  // Which way the sea lies from the foam line, as a side index: toward this square's inside when it is the sea.
  const water = sea ? (k + 2) % 4 : k;
  const picture = shore.byWater[water];
  const h = shore.img.naturalHeight;
  const perSquare = shore.img.naturalWidth / SHORE_PERIOD;
  const foam = h * SHORE_WATER_FRACTION;
  // Rows of the strip used and how deep they reach into the square (a square is `perSquare` picture pixels wide).
  const [r0, r1] = sea ? [0, foam] : [foam, h];
  const depth = ((r1 - r0) / perSquare) * size;
  // Along the coast: x for a coast running east-west, y for one running north-south.
  const along = (water === 0 || water === 2 ? mx : my) % SHORE_PERIOD;
  const a0 = (along < 0 ? along + SHORE_PERIOD : along) * perSquare;
  // The same rows in the turned copy, and where the band sits in the square.
  const along0 = a0 + trimStart * perSquare;
  const alongLen = keep * perSquare;
  let sx: number, sy: number, sw: number, sh: number;
  if (water === 0) { sx = along0; sy = r0; sw = alongLen; sh = r1 - r0; }
  else if (water === 2) { sx = along0; sy = h - r1; sw = alongLen; sh = r1 - r0; }
  else if (water === 1) { sx = h - r1; sy = along0; sw = r1 - r0; sh = alongLen; }
  else { sx = r0; sy = along0; sw = r1 - r0; sh = alongLen; }
  const dLen = edgeLen - trimStartPx - trimEndPx;
  // Zoomed out, the pale strips would outline every coast too boldly, so they are drawn fainter.
  ctx.globalAlpha = size < 36 ? 0.7 : 1;
  if (k === 0) ctx.drawImage(picture, sx, sy, sw, sh, left + trimStartPx, top, dLen, depth);
  else if (k === 2) ctx.drawImage(picture, sx, sy, sw, sh, left + trimStartPx, bottom - depth, dLen, depth);
  else if (k === 1) ctx.drawImage(picture, sx, sy, sw, sh, right - depth, top + trimStartPx, depth, dLen);
  else ctx.drawImage(picture, sx, sy, sw, sh, left, top + trimStartPx, depth, dLen);
  ctx.globalAlpha = 1;
  return true;
}
/** How far a coast corner is rounded: the radius of its arc, in squares (the arc runs from the middle of each edge). */
const ROUND = 0.5;

/**
 * The size corner patches are made at (the square's size rounded to a multiple of four, so zooming does not make a new set
 * at every step) and the arc's radius in whole pixels at that size. The straight strips stop this far from a corner.
 */
function cornerSize(t: number): { made: number; radius: number } {
  const made = Math.max(8, Math.round(t / 4) * 4);
  return { made, radius: ROUND * made };
}

/**
 * A coast corner is a grid point where exactly one of the four squares around it is the odd one out in being sea or land.
 * Which of the four it is (0 NE, 1 SE, 2 SW, 3 NW), and whether it is the sea that is odd (a bay) or the land (a point).
 */
function coastCornerAt(
  at: (x: number, y: number) => Surface | null, vx: number, vy: number,
): { odd: number; bay: boolean } | null {
  const sq = [at(vx, vy - 1), at(vx, vy), at(vx - 1, vy), at(vx - 1, vy - 1)]; // NE, SE, SW, NW
  if (sq.some((s) => s === null)) return null;
  const wet = sq.map((s) => s === 'water');
  const count = wet.filter(Boolean).length;
  if (count !== 1 && count !== 3) return null;
  const bay = count === 1;
  return { odd: wet.findIndex((w) => w === bay), bay };
}

/**
 * Draws the rounded coast corner at grid point (vx, vy): the part of the odd square near the point that the arc cuts off
 * is repainted as the other ground, and the shore strip is bent round the arc in a fan of thin slices (the straight strips
 * on the two edges stop short of the point, see shoreBand).
 */
function roundedCorner(
  ctx: CanvasRenderingContext2D, shore: { img: HTMLImageElement; byWater: HTMLCanvasElement[] }, pics: Record<Surface, HTMLImageElement>,
  at: (x: number, y: number) => Surface | null, view: PlayerView, cam: Camera, vx: number, vy: number, corner: { odd: number; bay: boolean },
): void {
  const t = cam.tile;
  // Whole pixels, the same ones the squares' own edges are drawn at, so the arc meets the straight strips exactly.
  const Vx = Math.floor((vx - cam.x) * t);
  const Vy = Math.floor((vy - cam.y) * t);
  const east = corner.odd === 0 || corner.odd === 1;
  const north = corner.odd === 0 || corner.odd === 3;
  const sx = east ? 1 : -1;
  const sy = north ? -1 : 1;
  const { made, radius: R } = cornerSize(t);
  const Cx = Vx + sx * R;
  const Cy = Vy + sy * R;
  // The odd square, and what its cut-off corner becomes: the ground diagonally opposite it, or the sea when it is land.
  const ox = vx + (east ? 0 : -1);
  const oy = vy + (north ? -1 : 0);
  const opposite = at(vx + (east ? -1 : 0), vy + (north ? 0 : -1));
  const repaint: Surface | null = corner.bay ? opposite : 'water';
  if (repaint === null) return;
  const px = Math.floor((ox - cam.x) * t);
  const py = Math.floor((oy - cam.y) * t);
  const size = Math.ceil(t) + 1;
  ctx.save();
  ctx.beginPath();
  // A couple of pixels past the grid point on each side, so no hairline of the old ground shows along the box's edges.
  ctx.rect(Math.min(Vx - sx * 2, Cx), Math.min(Vy - sy * 2, Cy), R + 2, R + 2);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(Vx - 2 * t, Vy - 2 * t, 4 * t, 4 * t);
  ctx.arc(Cx, Cy, R, 0, Math.PI * 2);
  ctx.clip('evenodd');
  cell(ctx, pics[repaint], mod(ox, view.width), oy, px, py, size, size);
  ctx.restore();

  // The strip, bent round the arc: water inside the circle for a bay, land inside for a point.
  ctx.save();
  ctx.globalAlpha = t < 36 ? 0.7 : 1;
  const patch = cornerPatch(shore, made, corner.bay, sx, sy, mod(vx + vy, 3));
  ctx.drawImage(patch, Cx - patch.width / 2, Cy - patch.height / 2);
  ctx.restore();
}

/** The strip's pixels, for sampling when a corner patch is made. */
let stripPixels: { img: HTMLImageElement; data: ImageData } | null = null;
function pixelsOf(img: HTMLImageElement): ImageData {
  if (stripPixels?.img === img) return stripPixels.data;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  stripPixels = { img, data: g.getImageData(0, 0, c.width, c.height) };
  return stripPixels.data;
}

/** Corner patches made so far, by size, kind, quadrant and place in the strip; there are only a few dozen of each size. */
const patches = new Map<string, HTMLCanvasElement>();

/**
 * The shore strip bent round a quarter circle of radius ROUND squares (a square being `t` pixels), as a picture centred on
 * the circle's centre. Each pixel looks up the strip by its distance from the centre (across the strip) and its angle
 * (along it), with smooth sampling, so there are no seams. `bay` puts the sea inside the circle, else the land.
 * `sx` and `sy` (+1 or -1) say which quadrant the arc is in, so the strip runs the right way round.
 */
function cornerPatch(
  shore: { img: HTMLImageElement; byWater: HTMLCanvasElement[] }, t: number, bay: boolean, sx: number, sy: number, alongIndex: number,
): HTMLCanvasElement {
  const key = `${t}:${bay ? 1 : 0}:${sx}:${sy}:${alongIndex}`;
  const cached = patches.get(key);
  if (cached) return cached;
  if (patches.size > 400) patches.clear();
  const img = shore.img;
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const P = W / SHORE_PERIOD;
  const foam = H * SHORE_WATER_FRACTION;
  const k = t / P; // pixels per strip pixel
  const R = ROUND * t;
  const half = Math.ceil((ROUND + 0.62) * t) + 1;
  const size = half * 2;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const g = out.getContext('2d')!;
  const dst = g.createImageData(size, size);
  const src = pixelsOf(img).data;
  const sgn = bay ? 1 : -1;
  const a1 = Math.atan2(0, -sx);
  const a2 = Math.atan2(-sy, 0);
  let delta = a2 - a1;
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta < -Math.PI) delta += 2 * Math.PI;
  const arc = ROUND * (Math.PI / 2) * P;
  const along0 = alongIndex * P;
  const sample = (x: number, y: number, o: number[]): void => {
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(x)));
    const y0 = Math.max(0, Math.min(H - 2, Math.floor(y)));
    const fx = Math.max(0, Math.min(1, x - x0));
    const fy = Math.max(0, Math.min(1, y - y0));
    let r = 0, gr = 0, b = 0, a = 0;
    // The four pixels around (x, y), weighted by how near they are, colours weighted by their opacity.
    for (let n = 0; n < 4; n++) {
      const dx = n & 1;
      const dy = n >> 1;
      const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      const i = ((y0 + dy) * W + x0 + dx) * 4;
      const al = (src[i + 3] / 255) * w;
      r += src[i] * al;
      gr += src[i + 1] * al;
      b += src[i + 2] * al;
      a += al;
    }
    o[0] = a > 0 ? r / a : 0;
    o[1] = a > 0 ? gr / a : 0;
    o[2] = a > 0 ? b / a : 0;
    o[3] = a * 255;
  };
  const px = [0, 0, 0, 0];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const dx = i + 0.5 - half;
      const dy = j + 0.5 - half;
      const dist = Math.hypot(dx, dy);
      let ang = Math.atan2(dy, dx) - a1;
      if (ang > Math.PI) ang -= 2 * Math.PI;
      if (ang < -Math.PI) ang += 2 * Math.PI;
      const f = ang / delta;
      // The arc ends on whole-pixel lines shared with the straight strips beside it, so pixels are shared out exactly; a
      // hair of tolerance only guards against rounding.
      const tol = 0.2 / (Math.max(dist, 1) * Math.abs(delta));
      if (f < -tol || f > 1 + tol) continue;
      const row = foam + (sgn * (dist - R)) / k;
      if (row < 0 || row > H - 1) continue;
      sample(along0 + Math.max(0, Math.min(1, f)) * arc, row, px);
      const o = (j * size + i) * 4;
      dst.data[o] = px[0];
      dst.data[o + 1] = px[1];
      dst.data[o + 2] = px[2];
      dst.data[o + 3] = px[3];
    }
  }
  g.putImageData(dst, 0, 0);
  patches.set(key, out);
  return out;
}
const SIDES: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CORNERS: readonly (readonly [number, number])[] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];

/**
 * Draws the ground of every explored square in view: its picture, then the neighbouring grounds fading in over the
 * edges and corners. The sea meets the land more sharply, with a pale strip of shallows and a thin band of sand.
 * Returns false (drawing nothing) while the pictures are still loading, so the caller can draw something plainer.
 */
export function drawGroundLayer(
  ctx: CanvasRenderingContext2D, view: PlayerView, cam: Camera, width: number, height: number,
): boolean {
  const t = cam.tile;
  periodX = view.wrap ? view.width / Math.max(1, Math.round(view.width / PERIOD_X)) : PERIOD_X;
  const pics = t >= TEXTURE_MIN_TILE ? pictures() : null;
  if (t >= TEXTURE_MIN_TILE && !pics) return false;
  const x0 = Math.floor(cam.x);
  const y0 = Math.max(0, Math.floor(cam.y));
  const cols = Math.ceil(width / t) + 1;
  const rows = Math.ceil(height / t) + 1;
  const at = (x: number, y: number): Surface | null => {
    if (y < 0 || y >= view.height) return null;
    if (view.wrap) x = mod(x, view.width);
    else if (x < 0 || x >= view.width) return null;
    return surfaceAt(view, x, y);
  };
  const blend = pics !== null && t >= BLEND_MIN_TILE;
  const exact = t >= EXACT_FADE_TILE;
  const shore = blend ? shorePictures() : null;
  for (let j = 0; j < rows; j++) {
    const my = y0 + j;
    if (my >= view.height) break;
    for (let i = 0; i < cols; i++) {
      const rawX = x0 + i;
      if (!view.wrap && (rawX < 0 || rawX >= view.width)) continue;
      const mx = mod(rawX, view.width);
      const own = surfaceAt(view, mx, my);
      if (own === null) continue;
      // Whole pixels, and each square a hair larger than its pitch, so no seam shows between neighbours.
      const px = Math.floor((rawX - cam.x) * t);
      const py = Math.floor((my - cam.y) * t);
      const size = Math.max(Math.ceil((rawX + 1 - cam.x) * t) - px, Math.ceil((my + 1 - cam.y) * t) - py);
      if (!pics) {
        ctx.fillStyle = FLAT[own];
        ctx.fillRect(px, py, size, size);
        continue;
      }
      cell(ctx, pics[own], mx, my, px, py, size, size);
      if (!blend) continue;
      const sea = own === 'water';
      for (let k = 0; k < 4; k++) {
        const n = at(rawX + SIDES[k][0], my + SIDES[k][1]);
        if (n === null || n === own || (n === 'river' && own === 'clear') || (n === 'clear' && own === 'river')) continue;
        if (sea !== (n === 'water')) continue;
        if (exact) fade(ctx, pics[n], mx, my, px, py, size, k, REACH, 0.5);
        else ctx.drawImage(fadeSprite(pics[n], n, size, k), px, py);
      }
      for (let k = 0; k < 4; k++) {
        const n = at(rawX + CORNERS[k][0], my + CORNERS[k][1]);
        if (n === null || n === own || (n === 'river' && own === 'clear') || (n === 'clear' && own === 'river')) continue;
        if (sea !== (n === 'water')) continue;
        // A corner only needs its own blob when both sides next to it are like this square.
        const a = at(rawX + CORNERS[k][0], my);
        const b = at(rawX, my + CORNERS[k][1]);
        if (a !== own || b !== own) continue;
        if (exact) fade(ctx, pics[n], mx, my, px, py, size, 4 + k, REACH, 0.5);
        else ctx.drawImage(fadeSprite(pics[n], n, size, 4 + k), px, py);
      }
      // The coast: the shore picture's shallows on the sea's side and its sand on the land's, else a plain tint. Each strip
      // stops short of an end that is a coast corner, where a rounded arc takes over (below).
      for (let k = 0; k < 4; k++) {
        const n = at(rawX + SIDES[k][0], my + SIDES[k][1]);
        if (n === null || (n === 'water') === sea) continue;
        if (shore) {
          // The grid points at the start and end of this edge, along the map's x (north and south edges) or y.
          const [v0, v1]: [[number, number], [number, number]] = k === 0 ? [[rawX, my], [rawX + 1, my]]
            : k === 2 ? [[rawX, my + 1], [rawX + 1, my + 1]]
              : k === 3 ? [[rawX, my], [rawX, my + 1]] : [[rawX + 1, my], [rawX + 1, my + 1]];
          const trimStart = coastCornerAt(at, v0[0], v0[1]) ? cornerSize(t).radius : 0;
          const trimEnd = coastCornerAt(at, v1[0], v1[1]) ? cornerSize(t).radius : 0;
          const right = Math.floor((rawX + 1 - cam.x) * t);
          const bottom = Math.floor((my + 1 - cam.y) * t);
          if (shoreBand(ctx, shore, sea, k, mx, my, px, py, right, bottom, trimStart, trimEnd)) continue;
        }
        const reach = (sea ? 0.2 : COAST_REACH * 0.6) * size;
        const grad = k === 0 ? ctx.createLinearGradient(0, py, 0, py + reach)
          : k === 2 ? ctx.createLinearGradient(0, py + size, 0, py + size - reach)
            : k === 1 ? ctx.createLinearGradient(px + size, 0, px + size - reach, 0)
              : ctx.createLinearGradient(px, 0, px + reach, 0);
        const tint = sea ? '150,225,230' : '226,208,150';
        grad.addColorStop(0, `rgba(${tint},${sea ? 0.34 : 0.4})`);
        grad.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, size, size);
      }
    }
  }
  // Rounded coast corners, over everything: one at each grid point where the coast turns.
  if (shore && pics) {
    for (let j = 0; j <= rows; j++) {
      const vy = y0 + j;
      if (vy < 0 || vy > view.height) continue;
      for (let i = 0; i <= cols; i++) {
        const corner = coastCornerAt(at, x0 + i, vy);
        if (corner) roundedCorner(ctx, shore, pics, at, view, cam, x0 + i, vy, corner);
      }
    }
  }
  return true;
}

/**
 * Rivers: from the middle of each river square to every side that holds more river or the sea, drawn as a line of the
 * sea's picture with a darker bank round it. Smaller than TEXTURE_MIN_TILE they are plain blue lines.
 */
export function drawRivers(ctx: CanvasRenderingContext2D, view: PlayerView, cam: Camera, width: number, height: number): void {
  if (!view.relief) return;
  const t = cam.tile;
  const water = t >= TEXTURE_MIN_TILE ? loaded(PICTURE.water) : null;
  const pattern = water ? ctx.createPattern(water, 'repeat') : null;
  if (pattern && water) pattern.setTransform(new DOMMatrix().scale(t / (water.naturalWidth / PERIOD_X)));
  const x0 = Math.floor(cam.x);
  const y0 = Math.max(0, Math.floor(cam.y));
  const cols = Math.ceil(width / t) + 1;
  const rows = Math.ceil(height / t) + 1;
  const kind = (x: number, y: number): Surface | null => {
    if (y < 0 || y >= view.height) return null;
    if (view.wrap) x = mod(x, view.width);
    else if (x < 0 || x >= view.width) return null;
    return surfaceAt(view, x, y);
  };
  // Where a river crosses the edge between two squares, nudged along the edge (the same for both squares), so it bends.
  const edgeSpot = (rawX: number, my: number, k: number): [number, number] => {
    const [dx, dy] = SIDES[k];
    // The edge is named by the square on its north/west side and its direction, so both squares agree.
    const ex = dx < 0 ? rawX - 1 : rawX;
    const ey = dy < 0 ? my - 1 : my;
    const horizontal = dx !== 0 ? 0 : 1;
    const jitter = (hash2(mod(ex, view.width), ey, horizontal) - 0.5) * 0.36;
    const mx = (rawX - cam.x + 0.5 + dx / 2 + (dx === 0 ? jitter : 0)) * t;
    const my2 = (my - cam.y + 0.5 + dy / 2 + (dy === 0 ? jitter : 0)) * t;
    return [mx, my2];
  };
  type Piece = { from: [number, number]; via: [number, number]; to: [number, number] | null };
  const pieces: Piece[] = [];
  for (let j = 0; j < rows; j++) {
    const my = y0 + j;
    if (my >= view.height) break;
    for (let i = 0; i < cols; i++) {
      const rawX = x0 + i;
      if (!view.wrap && (rawX < 0 || rawX >= view.width)) continue;
      if (kind(rawX, my) !== 'river') continue;
      const centre: [number, number] = [(rawX - cam.x + 0.5) * t, (my - cam.y + 0.5) * t];
      const spots: [number, number][] = [];
      SIDES.forEach(([dx, dy], k) => {
        const n = kind(rawX + dx, my + dy);
        if (n === 'river' || n === 'water') spots.push(edgeSpot(rawX, my, k));
      });
      if (spots.length === 0) spots.push([centre[0], centre[1] + t / 2]);
      if (spots.length === 2) pieces.push({ from: spots[0], via: centre, to: spots[1] });
      else for (const sp of spots) pieces.push({ from: sp, via: centre, to: null });
    }
  }
  if (pieces.length === 0) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (style: string | CanvasPattern, w: number) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const p of pieces) {
      ctx.moveTo(p.from[0], p.from[1]);
      if (p.to) ctx.quadraticCurveTo(p.via[0], p.via[1], p.to[0], p.to[1]);
      else ctx.lineTo(p.via[0], p.via[1]);
    }
    ctx.stroke();
  };
  if (pattern) {
    stroke('rgba(24,56,64,0.5)', Math.max(3, t * 0.25));
    stroke(pattern, Math.max(2, t * 0.18));
  } else {
    stroke('#2f6fa8', Math.max(2, t * 0.16));
  }
  ctx.lineCap = 'butt';
}

const hash2 = (x: number, y: number, k: number): number => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};