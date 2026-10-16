import { UNIT_STATS, isCrippled, type PlayerView, type Pos, type Unit } from '../engine';
import type { Camera } from './camera';
import type { StepTarget } from './targets';
import { TERRAIN_COLORS, UNIT_GLYPH } from './colors';
import { badgeMode, cityStackTop } from './labels';

export interface DrawOptions {
  view: PlayerView;
  cam: Camera;
  width: number;
  height: number;
  selected: Pos | null;
  targets: StepTarget[];
  /** Color per seat, indexed by PlayerId. */
  colors: string[];
  /** The blinking unit. */
  activeId: number | null;
  /** False draws the active unit at alpha 0.25. */
  blinkOn: boolean;
  /** Preview path from the selected unit (excluding its start square). */
  path: Pos[] | null;
  /** False draws the path preview in red. */
  pathOk: boolean;
  /** Drawn near the last path square. */
  pathLabel: string | null;
  /** The hovered square; marked in red with the label when `path` is null (unreachable). */
  pathTarget: Pos | null;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function drawMap(ctx: CanvasRenderingContext2D, o: DrawOptions): void {
  const { view, cam, width, height, colors } = o;
  const t = cam.tile;
  const visible = new Set(view.visibleSquares);
  ctx.fillStyle = TERRAIN_COLORS.unexplored;
  ctx.fillRect(0, 0, width, height);

  const x0 = Math.floor(cam.x);
  const y0 = Math.max(0, Math.floor(cam.y));
  const cols = Math.ceil(width / t) + 1;
  const rows = Math.ceil(height / t) + 1;
  /** Calls fn for each on-screen square with its map coords and screen position. */
  const each = (fn: (mx: number, my: number, sx: number, sy: number) => void) => {
    for (let j = 0; j < rows; j++) {
      const my = y0 + j;
      if (my >= view.height) break;
      for (let i = 0; i < cols; i++) {
        const rawX = x0 + i;
        if (!view.wrap && (rawX < 0 || rawX >= view.width)) continue;
        fn(mod(rawX, view.width), my, (rawX - cam.x) * t, (my - cam.y) * t);
      }
    }
  };

  // Terrain, cities and fog.
  each((mx, my, sx, sy) => {
    const i = my * view.width + mx;
    const terrain = view.terrain[i];
    if (terrain === null) return;
    ctx.fillStyle = terrain === 'water' ? TERRAIN_COLORS.water : TERRAIN_COLORS.land;
    ctx.fillRect(sx, sy, t, t);
    if (terrain === 'city') {
      const city = view.knownCities.find((c) => c.x === mx && c.y === my);
      ctx.fillStyle = city && city.owner !== null ? colors[city.owner] : TERRAIN_COLORS.neutralCity;
      ctx.fillRect(sx + t * 0.15, sy + t * 0.15, t * 0.7, t * 0.7);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + t * 0.15, sy + t * 0.15, t * 0.7, t * 0.7);
    }
    if (!visible.has(i)) {
      ctx.fillStyle = TERRAIN_COLORS.fog;
      ctx.fillRect(sx, sy, t, t);
    }
  });

  // Move/attack targets.
  for (const target of o.targets) {
    each((mx, my, sx, sy) => {
      if (mx !== target.x || my !== target.y) return;
      ctx.fillStyle = target.attack ? TERRAIN_COLORS.attackTarget : TERRAIN_COLORS.moveTarget;
      ctx.fillRect(sx + t * 0.3, sy + t * 0.3, t * 0.4, t * 0.4);
    });
  }

  /** A glyph disc centred at (ox, oy) within the square, scaled by `scale`. */
  const glyph = (sx: number, sy: number, color: string, text: string, alpha: number, scale = 1, ox = 0.5, oy = 0.5) => {
    const cx = sx + t * ox;
    const cy = sy + t * oy;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, t * 0.38 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(t * 0.5 * scale)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 1);
    ctx.globalAlpha = 1;
  };

  /** Top-right badge: a white dot below 16px tiles, else a white circle with a dark count. */
  const badge = (sx: number, sy: number, count: number, alpha = 1) => {
    const cx = sx + t * 0.8;
    const cy = sy + t * 0.2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (badgeMode(t) === 'dot') {
      ctx.arc(cx, cy, t * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.arc(cx, cy, t * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.font = `bold ${Math.round(t * 0.25)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), cx, cy + 1);
    ctx.globalAlpha = 1;
  };

  const ownAlpha = (u: Unit) => (u.id === o.activeId && !o.blinkOn ? 0.25 : u.movesLeft > 0 ? 1 : 0.6);

  // Enemy markers (fade with age).
  for (const e of view.enemies) {
    const age = view.turn - e.turnSeen;
    const alpha = e.visibleNow ? 1 : age < 1 ? 0.7 : 0.4;
    each((mx, my, sx, sy) => {
      if (mx === e.x && my === e.y) glyph(sx, sy, colors[e.owner], UNIT_GLYPH[e.type], alpha);
    });
  }

  // Own city stacks: the top unit at 60% in the top-left, a count badge when 2 or more (dot below 16px tiles).
  const inOwnCity = (x: number, y: number) => view.knownCities.some((c) => c.x === x && c.y === y && c.owner === view.me);
  for (const city of view.knownCities) {
    if (city.owner !== view.me) continue;
    const stack = view.myUnits.filter((u) => u.carriedBy === null && u.x === city.x && u.y === city.y);
    const top = cityStackTop(stack);
    if (top === null) continue;
    // The active unit represents its stack when it is in one, so the blink shows there too.
    const shown = stack.find((u) => u.id === o.activeId) ?? top;
    const alpha = ownAlpha(shown);
    each((mx, my, sx, sy) => {
      if (mx !== city.x || my !== city.y) return;
      if (badgeMode(t) === 'dot') {
        badge(sx, sy, stack.length, alpha);
        return;
      }
      glyph(sx, sy, colors[view.me], UNIT_GLYPH[shown.type], alpha, 0.6, 0.3, 0.3);
      if (stack.length >= 2) badge(sx, sy, stack.length, alpha);
    });
  }

  // Own top-level units outside own cities.
  for (const u of view.myUnits) {
    if (u.carriedBy !== null || inOwnCity(u.x, u.y)) continue;
    each((mx, my, sx, sy) => {
      if (mx !== u.x || my !== u.y) return;
      glyph(sx, sy, colors[view.me], UNIT_GLYPH[u.type], ownAlpha(u));
      const cargo = view.myUnits.filter((c) => c.carriedBy === u.id).length;
      if (cargo > 0) badge(sx, sy, cargo, ownAlpha(u));
      if (isCrippled(u)) {
        ctx.fillStyle = '#ff3b3b';
        ctx.fillRect(sx + t * 0.1, sy + t * 0.1, t * 0.18, t * 0.18);
      }
      const range = UNIT_STATS[u.type].range;
      if (range !== null && u.fuel !== null && u.fuel <= Math.ceil(range / 4)) {
        ctx.fillStyle = '#ffb000';
        ctx.fillRect(sx + t * 0.1, sy + t * 0.72, t * 0.18, t * 0.18);
      }
    });
  }

  // Path preview: a dotted polyline through square centres, unwrapped so it never jumps across the seam.
  if (o.path && o.path.length > 0) {
    const raw = o.selected ? [o.selected, ...o.path] : o.path;
    // Shift the whole path onto the copy of its start nearest the camera (the copy each() draws it in).
    const shift = view.wrap ? Math.round((cam.x - raw[0].x) / view.width) * view.width : 0;
    const pts: Pos[] = [{ x: raw[0].x + shift, y: raw[0].y }];
    for (const p of raw.slice(1)) {
      const prev = pts[pts.length - 1].x;
      let d = p.x - prev;
      if (view.wrap) {
        d = mod(p.x - prev, view.width);
        if (d > view.width / 2) d -= view.width;
      }
      pts.push({ x: prev + d, y: p.y });
    }
    const color = o.pathOk ? '#fff' : '#ff3b3b';
    const cx = (p: Pos) => (p.x - cam.x + 0.5) * t;
    const cy = (p: Pos) => (p.y - cam.y + 0.5) * t;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(cx(p), cy(p)) : ctx.lineTo(cx(p), cy(p))));
    ctx.stroke();
    ctx.setLineDash([]);
    if (o.pathLabel) {
      const last = pts[pts.length - 1];
      ctx.font = `bold ${Math.round(t * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(o.pathLabel, cx(last) + t * 0.4, cy(last) - t * 0.2);
      ctx.fillStyle = color;
      ctx.fillText(o.pathLabel, cx(last) + t * 0.4, cy(last) - t * 0.2);
    }
  }

  // Unreachable hover: no path to draw, so mark the hovered square and say why.
  if (!o.path && o.pathLabel && o.pathTarget) {
    const at = o.pathTarget;
    const label = o.pathLabel;
    each((mx, my, sx, sy) => {
      if (mx !== at.x || my !== at.y) return;
      const m = t * 0.2;
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx + m, sy + m);
      ctx.lineTo(sx + t - m, sy + t - m);
      ctx.moveTo(sx + t - m, sy + m);
      ctx.lineTo(sx + m, sy + t - m);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `bold ${Math.round(t * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(label, sx + t * 0.9, sy + t * 0.3);
      ctx.fillStyle = '#ff3b3b';
      ctx.fillText(label, sx + t * 0.9, sy + t * 0.3);
    });
  }

  // Selection.
  if (o.selected) {
    const sel = o.selected;
    each((mx, my, sx, sy) => {
      if (mx !== sel.x || my !== sel.y) return;
      ctx.strokeStyle = TERRAIN_COLORS.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, t - 2, t - 2);
    });
  }
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D, view: PlayerView, colors: string[],
  w: number, h: number, cam: Camera, viewW: number, viewH: number,
): void {
  const sx = w / view.width;
  const sy = h / view.height;
  ctx.fillStyle = TERRAIN_COLORS.unexplored;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < view.height; y++) {
    for (let x = 0; x < view.width; x++) {
      const terrain = view.terrain[y * view.width + x];
      if (terrain === null) continue;
      ctx.fillStyle = terrain === 'water' ? TERRAIN_COLORS.water : TERRAIN_COLORS.land;
      ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
    }
  }
  for (const c of view.knownCities) {
    ctx.fillStyle = c.owner === null ? TERRAIN_COLORS.neutralCity : colors[c.owner];
    ctx.fillRect(c.x * sx - 1, c.y * sy - 1, Math.max(2, sx) + 1, Math.max(2, sy) + 1);
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(cam.x * sx, cam.y * sy, (viewW / cam.tile) * sx, (viewH / cam.tile) * sy);
}
