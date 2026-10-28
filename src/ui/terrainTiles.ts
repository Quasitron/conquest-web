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
/** From this size each fade is cut from the picture at the square's own place (so the join is seamless); below, a stock sprite. */
export const EXACT_FADE_TILE = 30;

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
  const cw = sw / PERIOD_X;
  const ch = sh / PERIOD_Y;
  ctx.drawImage(lv.src, mod(mx, PERIOD_X) * cw, mod(my, PERIOD_Y) * ch, cw, ch, dx, dy, w, h);
}
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
  mx: number, my: number, px: number, py: number, size: number,
): boolean {
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
  let sx: number, sy: number, sw: number, sh: number;
  if (water === 0) { sx = a0; sy = r0; sw = perSquare; sh = r1 - r0; }
  else if (water === 2) { sx = a0; sy = h - r1; sw = perSquare; sh = r1 - r0; }
  else if (water === 1) { sx = h - r1; sy = a0; sw = r1 - r0; sh = perSquare; }
  else { sx = r0; sy = a0; sw = r1 - r0; sh = perSquare; }
  // Zoomed out, the pale strips would outline every coast too boldly, so they are drawn fainter.
  ctx.globalAlpha = size < 36 ? 0.7 : 1;
  if (k === 0) ctx.drawImage(picture, sx, sy, sw, sh, px, py, size, depth);
  else if (k === 2) ctx.drawImage(picture, sx, sy, sw, sh, px, py + size - depth, size, depth);
  else if (k === 1) ctx.drawImage(picture, sx, sy, sw, sh, px + size - depth, py, depth, size);
  else ctx.drawImage(picture, sx, sy, sw, sh, px, py, depth, size);
  ctx.globalAlpha = 1;
  return true;
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
      // The coast: the shore picture's shallows on the sea's side and its sand on the land's, else a plain tint.
      for (let k = 0; k < 4; k++) {
        const n = at(rawX + SIDES[k][0], my + SIDES[k][1]);
        if (n === null || (n === 'water') === sea) continue;
        if (shore && shoreBand(ctx, shore, sea, k, mx, my, px, py, size)) continue;
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