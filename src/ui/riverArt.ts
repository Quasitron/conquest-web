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

/** How wide a river is, in squares, for the number of squares draining through it: a trickle grows to a wide stream. */
export function riverWidth(flow: number): number {
  return Math.min(0.46, 0.1 + 0.055 * Math.sqrt(flow));
}

/** The layers a river is drawn in, widest first: damp ground, the bank, the water, a tint and a faint centre line. */
const LAYERS = [
  { scale: 2.9, plus: 3, style: 'rgba(70, 60, 36, 0.17)' },
  { scale: 1.8, plus: 2.5, style: 'rgba(206, 190, 142, 0.5)' },
  { scale: 1.16, plus: 1.2, style: 'rgba(22, 44, 46, 0.62)' },
  { scale: 1.0, plus: 0, style: 'water' },
  { scale: 1.0, plus: 0, style: 'rgba(76, 156, 164, 0.3)' },
  { scale: 0.3, plus: 0, style: 'rgba(210, 234, 236, 0.14)' },
] as const;

interface Pt { x: number; y: number }

/** One stretch of river, from the middle of a square to the next one down: points along its centre line, with a half width at each. */
interface Reach { pts: Pt[]; normals: Pt[]; half: number[] }

const SAMPLES = 9;
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
  const nodeAt = (rawX: number, y: number): Pt => {
    const gx = mod(rawX, W);
    return {
      x: (rawX - cam.x + 0.5 + (hash2(gx, y, 11) - 0.5) * 0.5) * t,
      y: (y - cam.y + 0.5 + (hash2(gx, y, 12) - 0.5) * 0.5) * t,
    };
  };

  interface Square { rawX: number; y: number; idx: number; flow: number; to: { rawX: number; y: number } | 'sea' | null; seaDir: readonly [number, number] | null }
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
      squares.set(keyOf(rawX, y), { rawX, y, idx, flow, to, seaDir });
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
  /** The width at a river square's point: a spring is a thread, and a river widens as the streams join it. */
  const widthOf = (s: Square) => riverWidth(s.flow) * t * (feeder.has(keyOfSq(s)) ? 1 : 0.55);
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
    if (s.to === 'sea') return unit(...(((): [number, number] => [s.seaDir![0], s.seaDir![1]])()));
    return unit(to.x - from.x, to.y - from.y);
  };

  const reaches: Reach[] = [];
  const nodes: { p: Pt; half: number }[] = [];
  const mouths: { p: Pt; dir: readonly [number, number]; half: number }[] = [];
  for (const s of squares.values()) {
    if (s.to === null || isSpur(s)) continue;
    const a = nodeAt(s.rawX, s.y);
    const b = endOf(s);
    const wa = widthOf(s);
    const target = nextOf(s);
    const mouth = s.to === 'sea';
    let wb = wa;
    if (mouth) wb = wa * 1.3; // opens out a little where it meets the sea
    else if (target && feeder.get(keyOfSq(target)) === s) wb = widthOf(target); // the main stream: the same width on both sides of the point
    const ta = headingAt(s);
    let tb: Pt;
    if (mouth) tb = unit(s.seaDir![0], s.seaDir![1]); // enters the shore straight on
    else if (target && feeder.get(keyOfSq(target)) === s) tb = headingAt(target);
    else if (target && target.to !== null) {
      // A tributary arrives bending toward the main stream's direction.
      const after = target.to === 'sea' ? endOf(target) : endOf(target);
      tb = unit(after.x - a.x, after.y - a.y);
    } else tb = unit(b.x - a.x, b.y - a.y);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // A bend of its own, to one side or the other, so the line is not a string of straight steps (zero slope at the ends, so reaches join smoothly).
    const bend = (hash2(mod(s.rawX, W), s.y, 13) - 0.5) * 0.4 * len;
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
      const swing = Math.sin(Math.PI * u) ** 2 * bend;
      pts.push({ x: x - dir.y * swing, y: y + dir.x * swing });
    }
    // The sides of the band stand square to the line: from the stream's own heading at the two ends (the same as the
    // next reach's, so the joint is clean), and from the neighbouring points in between.
    const normals = pts.map((_, k) => {
      const d = k === 0 ? ta : k === SAMPLES ? tb : unit(pts[k + 1].x - pts[k - 1].x, pts[k + 1].y - pts[k - 1].y);
      return { x: -d.y, y: d.x };
    });
    const half = pts.map((_, k) => { const u = k / SAMPLES; return (wa + (wb - wa) * (u * u * (3 - 2 * u))) / 2; });
    reaches.push({ pts, normals, half });
    if (!feeder.has(keyOfSq(s))) nodes.push({ p: a, half: wa / 2 }); // round the tip of a spring
    if (mouth) mouths.push({ p: b, dir: s.seaDir!, half: wb / 2 });
  }  if (reaches.length === 0) return;

  let pattern: CanvasPattern | null = null;
  if (water) {
    pattern = ctx.createPattern(water, 'repeat');
    // The picture is laid on the map, not on the screen, so the water does not swim when the map is moved.
    pattern?.setTransform(new DOMMatrix().translate(-cam.x * t, -cam.y * t).scale(t / (water.naturalWidth / PERIOD_X)));
  }
  for (const layer of LAYERS) {
    const path = new Path2D();
    for (const r of reaches) {
      const left: Pt[] = [];
      const right: Pt[] = [];
      r.pts.forEach((p, k) => {
        const h = Math.max(0.5, r.half[k] * layer.scale + layer.plus / 2);
        left.push({ x: p.x + r.normals[k].x * h, y: p.y + r.normals[k].y * h });
        right.push({ x: p.x - r.normals[k].x * h, y: p.y - r.normals[k].y * h });
      });
      path.moveTo(left[0].x, left[0].y);
      for (let k = 1; k < left.length; k++) path.lineTo(left[k].x, left[k].y);
      for (let k = right.length - 1; k >= 0; k--) path.lineTo(right[k].x, right[k].y);
      path.closePath();
    }
    // Round the joints between reaches (and the sources) with a disc, drawn the way round the bands go so they merge.
    for (const n of nodes) {
      const r = Math.max(1, n.half * layer.scale + layer.plus / 2);
      path.moveTo(n.p.x + r, n.p.y); // each disc starts its own piece of the path, or a line would be drawn to it from the last one
      path.arc(n.p.x, n.p.y, r, 0, Math.PI * 2, true);
      path.closePath();
    }
    ctx.fillStyle = layer.style === 'water' ? (pattern ?? '#2c6a93') : layer.style;
    ctx.fill(path, 'nonzero');
  }
  // Where a river meets the sea or a lake it ends at the shore and melts into the shallows: a soft light-blue glow.
  for (const m of mouths) {
    const cx = m.p.x + m.dir[0] * 0.1 * t;
    const cy = m.p.y + m.dir[1] * 0.1 * t;
    const r = Math.max(4, m.half * 2.6 + 0.1 * t);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, 'rgba(120, 186, 200, 0.55)');
    glow.addColorStop(0.55, 'rgba(120, 186, 200, 0.22)');
    glow.addColorStop(1, 'rgba(120, 186, 200, 0)');
    // Only the water side of the shore gets it, so the bank on land stays clean.
    const pad = 0.04 * t;
    ctx.save();
    ctx.beginPath();
    if (m.dir[0] !== 0) ctx.rect(m.dir[0] > 0 ? m.p.x - pad : m.p.x + pad - r * 2, cy - r, r * 2, r * 2);
    else ctx.rect(cx - r, m.dir[1] > 0 ? m.p.y - pad : m.p.y + pad - r * 2, r * 2, r * 2);
    ctx.clip();
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
}
