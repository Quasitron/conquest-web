import { NONE, SEA, type PlayerView } from '../engine';
import type { Camera } from './camera';
import { PERIOD_X, TEXTURE_MIN_TILE } from './terrainTiles';
import { loaded } from './unitIcons';

const WATER_PICTURE = '/art/terrain/water.webp';

const ORTHO: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const hash2 = (x: number, y: number, k: number): number => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** How wide every river is, in squares. */
export const RIVER_WIDTH = 0.065;

/** The layers a river is drawn in, widest first: damp ground, the bank, the water, a tint and a faint centre line. */
const LAYERS = [
  { scale: 2.9, plus: 1.5, shift: 0, style: 'rgba(70, 60, 36, 0.17)' },
  { scale: 1.8, plus: 1.25, shift: 0.7, style: 'rgba(206, 190, 142, 0.5)' },
  { scale: 1.16, plus: 0.6, shift: -0.45, style: 'rgba(22, 44, 46, 0.62)' },
  { scale: 1.0, plus: 0, shift: 0, style: 'water' },
  { scale: 1.0, plus: 0, shift: 0, style: 'rgba(76, 156, 164, 0.3)' },
] as const;

interface Pt { x: number; y: number }

/** One stretch of river, from the middle of a square to the next one down: points along its centre line, with a half width at each. */
interface Reach { pts: Pt[]; normals: Pt[]; half: number[]; mouth: boolean }

const SAMPLES = 14;
/** A mouth starts to fade out at this sample of its last reach. */
const FADE_FROM = 5;
/** How strongly a reach keeps the heading it arrives with: below 1 it cannot overshoot and curl at a sharp turn. */
const TENSION = 0.7;

/**
 * Rivers: every river square holds a point (nudged off its centre so the water meanders), and the water runs from it to
 * the point of the square it flows into, along a smooth curve with an extra bend of its own. The width follows the flow
 * (RiverNet), so a river widens toward the sea, a tributary meets the main stream at an angle and narrows into it, and
 * a mouth opens out into the sea. Each layer (damp ground, bank, water) is filled once from all the reaches together.
 */
export function drawRivers(ctx: CanvasRenderingContext2D, view: PlayerView, cam: Camera, width: number, height: number): void {
  const net = view.riverNet;
  if (!view.relief || !net) return;
  const t = cam.tile;
  const W = view.width;
  const water = t >= TEXTURE_MIN_TILE ? loaded(WATER_PICTURE) : null;
  const x0 = Math.floor(cam.x) - 2;
  const y0 = Math.max(0, Math.floor(cam.y) - 2);
  const cols = Math.ceil(width / t) + 5;
  const rows = Math.ceil(height / t) + 5;
  const idxOf = (rawX: number, y: number): number => (view.wrap ? y * W + mod(rawX, W) : rawX >= 0 && rawX < W ? y * W + rawX : -1);
  const inMap = (rawX: number, y: number) => y >= 0 && y < view.height && (view.wrap || (rawX >= 0 && rawX < W));
  const flowAt = (rawX: number, y: number): number | null => (inMap(rawX, y) ? net.flow[idxOf(rawX, y)] : null);

  // The point of a river square: near its middle, shifted by a fixed amount of chance (the same wherever it is drawn).
  const rawNode = (rawX: number, y: number): Pt => {
    const gx = mod(rawX, W);
    return {
      x: (rawX - cam.x + 0.5 + (hash2(gx, y, 11) - 0.5) * 0.5) * t,
      y: (y - cam.y + 0.5 + (hash2(gx, y, 12) - 0.5) * 0.5) * t,
    };
  };
  // Where the points of the river squares end up after the river has been smoothed along its length (see below).
  const smoothed = new Map<string, Pt>();
  const nodeAt = (rawX: number, y: number): Pt => smoothed.get(`${rawX},${y}`) ?? rawNode(rawX, y);

  interface Square { rawX: number; y: number; idx: number; flow: number; to: { rawX: number; y: number } | 'sea' | null; seaDir: readonly [number, number] | null; hidden: readonly [number, number] | null }
  const squares = new Map<string, Square>();
  const keyOf = (rawX: number, y: number) => `${rawX},${y}`;
  for (let j = 0; j < rows; j++) {
    const y = y0 + j;
    if (y >= view.height) break;
    for (let i = 0; i < cols; i++) {
      const rawX = x0 + i;
      if (!inMap(rawX, y)) continue;
      const idx = idxOf(rawX, y);
      const flow = net.flow[idx];
      if (!flow || view.relief[idx] !== 'river') continue;
      const down = net.down[idx];
      let to: Square['to'] = null;
      let seaDir: Square['seaDir'] = null;
      if (down === SEA) {
        to = 'sea';
        seaDir = ORTHO.find(([dx, dy]) => { const m = idxOf(rawX + dx, y + dy); return m >= 0 && view.terrain[m] === 'water'; }) ?? ORTHO[2];
      } else if (down !== null && down !== NONE) {
        const dir = ORTHO.find(([dx, dy]) => idxOf(rawX + dx, y + dy) === down);
        if (dir) to = { rawX: rawX + dir[0], y: y + dir[1] };
      }
      const upIdx = net.up[idx];
      const hidden = upIdx === null || upIdx === undefined ? null : ORTHO.find(([dx, dy]) => idxOf(rawX + dx, y + dy) === upIdx) ?? null;
      squares.set(keyOf(rawX, y), { rawX, y, idx, flow, to, seaDir, hidden });
    }
  }
  if (squares.size === 0) return;

  // For each square, the stream that feeds it most: the main stream keeps its direction through a meeting.
  const feeder = new Map<string, Square>();
  for (const s of squares.values()) {
    if (typeof s.to !== 'object' || s.to === null) continue;
    const k = keyOf(s.to.rawX, s.to.y);
    const cur = feeder.get(k);
    if (!cur || s.flow > cur.flow) feeder.set(k, s);
  }

  const unit = (dx: number, dy: number): Pt => { const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
  const keyOfSq = (s: Square) => keyOf(s.rawX, s.y);
  const nextOf = (s: Square): Square | null => (typeof s.to === 'object' && s.to !== null ? squares.get(keyOf(s.to.rawX, s.to.y)) ?? null : null);

  // Smooth the line: each point moves toward the middle of its two neighbours along the main stream, a few times over, so
  // the river flows in long even curves instead of wobbling from square to square. The ends stay where they are.
  for (const s of squares.values()) smoothed.set(keyOfSq(s), rawNode(s.rawX, s.y));
  for (let pass = 0; pass < 4; pass++) {
    const next = new Map<string, Pt>();
    for (const s of squares.values()) {
      const f = feeder.get(keyOfSq(s));
      const n = nextOf(s);
      const p = smoothed.get(keyOfSq(s))!;
      const shore = s.to === 'sea' ? { x: (s.rawX - cam.x + 0.5 + s.seaDir![0] * 0.5) * t, y: (s.y - cam.y + 0.5 + s.seaDir![1] * 0.5) * t } : null;
      if (!f || (!n && !shore)) { next.set(keyOfSq(s), p); continue; }
      const a = smoothed.get(keyOfSq(f))!;
      const b = n ? smoothed.get(keyOfSq(n))! : shore!;
      next.set(keyOfSq(s), { x: 0.5 * p.x + 0.25 * (a.x + b.x), y: 0.5 * p.y + 0.25 * (a.y + b.y) });
    }
    next.forEach((p, k) => smoothed.set(k, p));
  }
  /** Every river is the same width from its rounded start to the sea: clean on a tactical map, as in the old games. */
  const widthOf = (_s: Square) => Math.max(1.4, RIVER_WIDTH * t);
  /** A one-square side branch that joins a stream fed more strongly by another: it only clutters the junction, so it is left out. */
  const isSpur = (s: Square): boolean => {
    if (feeder.has(keyOfSq(s)) || typeof s.to !== 'object' || s.to === null) return false;
    const f = feeder.get(keyOf(s.to.rawX, s.to.y));
    return !!f && f !== s;
  };
  /** Where a river ends: the shore (the edge of the sea or lake square it flows into), the point of the next river square, or the edge of unexplored ground. */
  const endOf = (s: Square): Pt => {
    if (s.to === 'sea') {
      const [dx, dy] = s.seaDir!;
      return { x: (s.rawX - cam.x + 0.5 + dx * 0.5) * t, y: (s.y - cam.y + 0.5 + dy * 0.5) * t };
    }
    const to = s.to as { rawX: number; y: number };
    const known = flowAt(to.rawX, to.y);
    if (known && known > 0) return nodeAt(to.rawX, to.y);
    return { x: (s.rawX - cam.x + 0.5 + (to.rawX - s.rawX) * 0.5) * t, y: (s.y - cam.y + 0.5 + (to.y - s.y) * 0.5) * t };
  };
  /**
   * The heading of the main stream through a river square: from the square that feeds it to the one it feeds, so the
   * line flows smoothly round a corner of the grid instead of turning at a right angle. Each reach starts with the
   * heading of its own square and ends with that of the square it flows into, so reaches join without a kink.
   */
  const headingAt = (s: Square): Pt => {
    const p = nodeAt(s.rawX, s.y);
    const f = feeder.get(keyOfSq(s));
    const from = f ? nodeAt(f.rawX, f.y) : p;
    const nx = nextOf(s);
    const to = s.to === 'sea' ? endOf(s) : nx ? nodeAt(nx.rawX, nx.y) : s.to === null ? p : endOf(s);
    // A mouth runs on toward the shore in a long curve, leaning only a little toward the way the shore faces, so there is no corner.
    if (s.to === 'sea') {
      const chord = unit(to.x - from.x, to.y - from.y);
      return unit(chord.x * 0.75 + s.seaDir![0] * 0.25, chord.y * 0.75 + s.seaDir![1] * 0.25);
    }
    return unit(to.x - from.x, to.y - from.y);
  };

  // Smooth value noise in world squares, the same wherever it is drawn (and wrapping with the map), for the meander.
  const vnoise = (x: number, y: number, k: number, period: number): number => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const h = (ix: number, iy: number) => hash2(mod(ix, period), iy, k);
    const a = h(x0, y0);
    const b = h(x0 + 1, y0);
    const c = h(x0, y0 + 1);
    const d = h(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
  /** How far the river wanders from its smooth line at a spot, in squares: a slow wander plus a fast squiggle, as in the original game. */
  const meander = (wx: number, wy: number): number =>
    (vnoise(wx * 2, wy * 2, 21, W * 2) - 0.5) * 0.42 + (vnoise(wx * 5, wy * 5, 22, W * 5) - 0.5) * 0.22;
  const normalsOf = (pts: Pt[]): Pt[] => pts.map((_, k) => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const d = unit(b.x - a.x, b.y - a.y);
    return { x: -d.y, y: d.x };
  });
  /** A small side stream: it wanders off from `from` along `dir`, thinning to a thread. */
  const twig = (from: Pt, dir: Pt, len: number, half0: number, gx: number, gy: number, tag: number): Reach => {
    const n = 7;
    const pts: Pt[] = [];
    let p = from;
    let d = dir;
    for (let k = 0; k <= n; k++) {
      pts.push(p);
      const turn = (hash2(gx, gy, tag * 16 + k) - 0.5) * 1.1;
      d = unit(d.x * Math.cos(turn) - d.y * Math.sin(turn), d.x * Math.sin(turn) + d.y * Math.cos(turn));
      p = { x: p.x + (d.x * len) / n, y: p.y + (d.y * len) / n };
    }
    return { pts, normals: normalsOf(pts), half: pts.map((_, k) => Math.max(0.5, half0 * (1 - (0.7 * k) / n))), mouth: false };
  };
  const rot = (v: Pt, a: number): Pt => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  /** The little streams that fan out where a river begins or ends on land, pointing along `dir`. */
  const feather = (out: Reach[], at: Pt, dir: Pt, half0: number, gx: number, gy: number, tag: number): void => {
    const angles = [-0.95, -0.4, 0, 0.4, 0.95];
    angles.forEach((a, i) => {
      const r = hash2(gx, gy, tag + i);
      if (r < 0.2 && i !== 2) return;
      const len = (i === 2 ? 0.42 : 0.22 + 0.2 * r) * t;
      out.push(twig(at, rot(dir, a + (r - 0.5) * 0.4), len, half0 * (i === 2 ? 0.85 : 0.65), gx, gy, tag + 8 + i));
    });
  };

  const reaches: Reach[] = [];
  const nodes: { p: Pt; half: number }[] = [];
  for (const s of squares.values()) {
    if (s.to === null && feeder.has(keyOfSq(s))) {
      // A river that ends on land: it frays into little streams, as at the source.
      const f = feeder.get(keyOfSq(s))!;
      const p = nodeAt(s.rawX, s.y);
      const from = nodeAt(f.rawX, f.y);
      const w = widthOf(s);
      feather(reaches, p, unit(p.x - from.x, p.y - from.y), w / 2, mod(s.rawX, W), s.y, 60);
      nodes.push({ p, half: w / 2 });
      continue;
    }
    if (s.to === null || isSpur(s)) continue;
    const a = nodeAt(s.rawX, s.y);
    const b = endOf(s);
    const wa = widthOf(s);
    const target = nextOf(s);
    const mouth = s.to === 'sea';
    let wb = wa;
    if (target && feeder.get(keyOfSq(target)) === s) wb = widthOf(target); // the main stream: the same width on both sides of the point
    const ta = headingAt(s);
    let tb: Pt;
    if (mouth) tb = ta; // runs on into the shore along the same curve
    else if (target && feeder.get(keyOfSq(target)) === s) tb = headingAt(target);
    else if (target && target.to !== null) {
      // A tributary arrives bending into the main stream's direction, and ends on its line, not beyond it.
      const main = headingAt(target);
      const own = unit(b.x - a.x, b.y - a.y);
      tb = unit(main.x * 0.7 + own.x * 0.3, main.y * 0.7 + own.y * 0.3);
    } else tb = unit(b.x - a.x, b.y - a.y);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // A bend of its own, to one side or the other, so the line is not a string of straight steps (zero slope at the ends, so reaches join smoothly).
    const bend = (hash2(mod(s.rawX, W), s.y, 13) - 0.5) * 0.15 * len;
    const pts: Pt[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const u = k / SAMPLES;
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      const x = h00 * a.x + h10 * ta.x * len * TENSION + h01 * b.x + h11 * tb.x * len * TENSION;
      const y = h00 * a.y + h10 * ta.y * len * TENSION + h01 * b.y + h11 * tb.y * len * TENSION;
      const dx = (6 * u ** 2 - 6 * u) * a.x + (3 * u ** 2 - 4 * u + 1) * ta.x * len * TENSION + (-6 * u ** 2 + 6 * u) * b.x + (3 * u ** 2 - 2 * u) * tb.x * len * TENSION;
      const dy = (6 * u ** 2 - 6 * u) * a.y + (3 * u ** 2 - 4 * u + 1) * ta.y * len * TENSION + (-6 * u ** 2 + 6 * u) * b.y + (3 * u ** 2 - 2 * u) * tb.y * len * TENSION;
      const dir = unit(dx, dy);
      const env = Math.sin(Math.PI * u) ** 2; // nothing at the ends, so reaches still join smoothly
      const swing = env * bend + env * meander(x / t + cam.x, y / t + cam.y) * t;
      pts.push({ x: x - dir.y * swing, y: y + dir.x * swing });
    }
    const gx = mod(s.rawX, W);
    const R = (k: number) => hash2(gx, s.y, 40 + k);
    // Now and then a big stream splits round a small island and comes together again.
    let branch: Pt[] | null = null;
    if (!mouth && s.flow >= 3 && R(10) < 0.28) {
      const k0 = 3;
      const k1 = SAMPLES - 3;
      const d = (0.06 + R(11) * 0.05) * t;
      const base = normalsOf(pts);
      branch = [];
      for (let k = k0; k <= k1; k++) {
        const bump = Math.sin((Math.PI * (k - k0)) / (k1 - k0)) ** 2;
        branch.push({ x: pts[k].x + base[k].x * d * bump, y: pts[k].y + base[k].y * d * bump });
        pts[k] = { x: pts[k].x - base[k].x * d * bump, y: pts[k].y - base[k].y * d * bump };
      }
    }
    // The sides of the band stand square to the line: from the stream's own heading at the two ends (the same as the
    // next reach's, so the joint is clean), and from the neighbouring points in between.
    const normals = pts.map((_, k) => {
      const d = k === 0 ? ta : k === SAMPLES ? tb : unit(pts[k + 1].x - pts[k - 1].x, pts[k + 1].y - pts[k - 1].y);
      return { x: -d.y, y: d.x };
    });
    const half = pts.map((_, k) => { const u = k / SAMPLES; return (wa + (wb - wa) * (u * u * (3 - 2 * u))) / 2; });
    reaches.push({ pts, normals, half, mouth });
    if (branch) reaches.push({ pts: branch, normals: normalsOf(branch), half: branch.map(() => wa * 0.42), mouth: false });
    // Small side streams here and there along the way, reaching up the valley.
    for (let j = 0; j < 2; j++) {
      if (R(j * 3) >= 0.55) continue;
      const idx = 3 + Math.floor(R(j * 3 + 1) * (SAMPLES - 6));
      const flowDir = unit(pts[idx + 1].x - pts[idx - 1].x, pts[idx + 1].y - pts[idx - 1].y);
      const side = R(j * 3 + 2) < 0.5 ? 1 : -1;
      reaches.push(twig(pts[idx], rot({ x: -flowDir.x, y: -flowDir.y }, side * (0.6 + R(j * 3 + 20) * 0.5)), (0.26 + R(j * 3 + 21) * 0.3) * t, wa * 0.42, gx, s.y, 30 + j));
    }
    if (s.hidden && !feeder.has(keyOfSq(s))) {
      // The stream comes from ground not yet explored: run it right up to the edge of the square, where the fog begins.
      const e = { x: (s.rawX - cam.x + 0.5 + s.hidden[0] * 0.5) * t, y: (s.y - cam.y + 0.5 + s.hidden[1] * 0.5) * t };
      const dir = unit(a.x - e.x, a.y - e.y);
      const sl = Math.hypot(a.x - e.x, a.y - e.y);
      const spts: Pt[] = [];
      const snorm: Pt[] = [];
      for (let k = 0; k <= SAMPLES; k++) {
        const u = k / SAMPLES;
        const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
        const h10 = u ** 3 - 2 * u ** 2 + u;
        const h01 = -2 * u ** 3 + 3 * u ** 2;
        const h11 = u ** 3 - u ** 2;
        spts.push({
          x: h00 * e.x + h10 * dir.x * sl * TENSION + h01 * a.x + h11 * ta.x * sl * TENSION,
          y: h00 * e.y + h10 * dir.y * sl * TENSION + h01 * a.y + h11 * ta.y * sl * TENSION,
        });
        const d = unit(dir.x + (ta.x - dir.x) * u, dir.y + (ta.y - dir.y) * u);
        snorm.push({ x: -d.y, y: d.x });
      }
      reaches.push({ pts: spts, normals: snorm, half: spts.map(() => wa / 2), mouth: false });
    } else if (!feeder.has(keyOfSq(s))) {
      // The source: it frays into little streams, reaching up the valley.
      nodes.push({ p: a, half: wa / 2 });
      feather(reaches, a, { x: -ta.x, y: -ta.y }, wa / 2, gx, s.y, 50);
    }
    if (target && !mouth && feeder.get(keyOfSq(target)) !== s) nodes.push({ p: b, half: wb / 2 }); // and the end of a tributary, which melts into the stream it joins
  }
  if (reaches.length === 0) return;

  /** The picture of the sea laid on the map (not on the screen), so the water does not swim when the map is moved. */
  const waterPattern = (c: CanvasRenderingContext2D): CanvasPattern | null => {
    if (!water) return null;
    const pattern = c.createPattern(water, 'repeat');
    pattern?.setTransform(new DOMMatrix().translate(-cam.x * t, -cam.y * t).scale(t / (water.naturalWidth / PERIOD_X)));
    return pattern;
  };
  /** Fills each layer once from all the given reaches together (so the translucent layers do not double up where they overlap). */
  const paintLayers = (c: CanvasRenderingContext2D, rs: Reach[], discs: { p: Pt; half: number }[]) => {
    const pattern = waterPattern(c);
    const off = Math.max(0.7, Math.min(3.5, 0.024 * t)); // how far the banks and shading shift, in pixels
    for (const layer of LAYERS) {
      const path = new Path2D();
      for (const r of rs) {
        const left: Pt[] = [];
        const right: Pt[] = [];
        r.pts.forEach((p, k) => {
          const thin = Math.min(1, (r.half[k] * 2) / (0.06 * t)); // near a spring the bank is as slight as the thread of water
          const h = Math.max(0.4, r.half[k] * layer.scale + (layer.plus / 2) * Math.max(0.15, thin));
          left.push({ x: p.x + r.normals[k].x * h, y: p.y + r.normals[k].y * h });
          right.push({ x: p.x - r.normals[k].x * h, y: p.y - r.normals[k].y * h });
        });
        path.moveTo(left[0].x, left[0].y);
        for (let k = 1; k < left.length; k++) path.lineTo(left[k].x, left[k].y);
        for (let k = right.length - 1; k >= 0; k--) path.lineTo(right[k].x, right[k].y);
        path.closePath();
      }
      // Round the tip of a spring with a disc, drawn the way round the bands go so they merge.
      for (const n of discs) {
        const r = Math.max(0.8, n.half * layer.scale + layer.plus / 2);
        path.moveTo(n.p.x + r, n.p.y); // each disc starts its own piece of the path, or a line would be drawn to it from the last one
        path.arc(n.p.x, n.p.y, r, 0, Math.PI * 2, true);
        path.closePath();
      }
      c.fillStyle = layer.style === 'water' ? (pattern ?? '#2c6a93') : layer.style;
      // Light from the north-west: the bank on the lit side shows a wider sandy lip, the one in shadow a darker rim.
      if (layer.shift) {
        c.save();
        c.translate(layer.shift * off, layer.shift * off);
        c.fill(path, 'nonzero');
        c.restore();
      } else c.fill(path, 'nonzero');
      if (layer.style === 'water') {
        // The river lies below the land: the wall on its north-west side shades the water, which brightens away from it.
        c.save();
        c.clip(path, 'nonzero');
        c.fillStyle = 'rgba(6, 22, 38, 0.6)';
        c.fill(path, 'nonzero');
        const lit = new Path2D();
        lit.addPath(path, new DOMMatrix().translate(off * 1.1, off * 1.1));
        c.fillStyle = pattern ?? '#2c6a93';
        c.fill(lit, 'nonzero');
        c.restore();
      }
    }
  };

  // Where a river meets the sea or a lake its last stretch dissolves into the shallows: drawn on a canvas of its own and
  // faded out toward the shore, so the water, its bank and the ground beside it melt away with no edge to be seen.
  const canFade = typeof document !== 'undefined';
  const slice = (r: Reach, from: number, to: number): Reach => ({
    pts: r.pts.slice(from, to + 1), normals: r.normals.slice(from, to + 1), half: r.half.slice(from, to + 1), mouth: false,
  });
  const body: Reach[] = [];
  const tails: Reach[] = [];
  for (const r of reaches) {
    if (r.mouth && canFade) {
      body.push(slice(r, 0, FADE_FROM));
      tails.push(slice(r, FADE_FROM, r.pts.length - 1));
    } else body.push(r);
  }
  paintLayers(ctx, body, nodes);
  for (const r of tails) {
    const reach = r.half.reduce((m, h) => Math.max(m, h), 0) * 3 + 6;
    const xs = r.pts.map((p) => p.x);
    const ys = r.pts.map((p) => p.y);
    const ox = Math.floor(Math.min(...xs) - reach);
    const oy = Math.floor(Math.min(...ys) - reach);
    const w = Math.ceil(Math.max(...xs) + reach) - ox;
    const h = Math.ceil(Math.max(...ys) + reach) - oy;
    if (w <= 0 || h <= 0 || w > 1500 || h > 1500) continue;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const c = off.getContext('2d');
    if (!c) continue;
    c.translate(-ox, -oy);
    paintLayers(c, [r], []);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    const a = r.pts[0];
    const b = r.pts[r.pts.length - 1];
    const g = c.createLinearGradient(a.x - ox, a.y - oy, b.x - ox, b.y - oy);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(0.5, 'rgba(0, 0, 0, 0.8)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    ctx.drawImage(off, ox, oy);
  }
}