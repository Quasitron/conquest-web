import { UNIT_STATS, buildTime, isCrippled, type PlayerView, type Pos, type Unit, type UnitType } from '../engine';
import type { Camera } from './camera';
import type { StepTarget } from './targets';
import { TERRAIN_COLORS, UNIT_GLYPH } from './colors';
import { badgeMode, cityLabelVisible, cityStackTop } from './labels';

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
  /** The committed Go-to/Patrol path, drawn as a solid line. */
  route: Pos[] | null;
  /** Drawn near the last route square. */
  routeLabel: string | null;
  /** The two endpoints of each of the player's patrols, shown while choosing a patrol destination. */
  patrols?: [Pos, Pos][];
  /** The player's city routes, drawn as arrows from each route city to its destination. */
  cityRoutes?: { from: Pos; to: Pos; types: UnitType[] }[];
  /** Production map: hides the units and shows what each own city is building. */
  productionMap?: boolean;
  /** Attack hover: a red crosshair with the label, drawn instead of the hover preview. */
  attack: { at: Pos; label: string } | null;
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

  /** Unwraps a path so it never jumps across the seam, on the copy of its start nearest the camera. */
  const unwrapPath = (raw: Pos[]): Pos[] => {
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
    return pts;
  };
  const cx = (p: Pos) => (p.x - cam.x + 0.5) * t;
  const cy = (p: Pos) => (p.y - cam.y + 0.5) * t;

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

  // Cargo is not drawn itself, so an active unit aboard shows its own glyph on its carrier's square.
  const activeUnit = view.myUnits.find((u) => u.id === o.activeId);
  const activeCargo = activeUnit && activeUnit.carriedBy !== null ? activeUnit : null;
  const activeCarrier = activeCargo ? activeCargo.carriedBy : null;
  /** The unit whose glyph and alpha represent u on the map. */
  const face = (u: Unit): Unit => (activeCargo && u.id === activeCarrier ? activeCargo : u);
  const blinking = (u: Unit) => u.id === o.activeId || u.id === activeCarrier;
  const ownAlpha = (u: Unit) => (blinking(u) && !o.blinkOn ? 0.25 : face(u).movesLeft > 0 ? 1 : 0.6);

  // Enemy markers (fade with age).
  const showUnits = !o.productionMap;
  for (const e of showUnits ? view.enemies : []) {
    const age = view.turn - e.turnSeen;
    const alpha = e.visibleNow ? 1 : age < 1 ? 0.7 : 0.4;
    each((mx, my, sx, sy) => {
      if (mx === e.x && my === e.y) glyph(sx, sy, colors[e.owner], UNIT_GLYPH[e.type], alpha);
    });
  }

  // Own city stacks: the top unit at 60% in the top-left, a count badge when 2 or more (dot below 16px tiles).
  const inOwnCity = (x: number, y: number) => view.knownCities.some((c) => c.x === x && c.y === y && c.owner === view.me);
  for (const city of view.knownCities) {
    if (city.owner !== view.me || !showUnits) continue;
    const stack = view.myUnits.filter((u) => u.carriedBy === null && u.x === city.x && u.y === city.y);
    const top = cityStackTop(stack);
    if (top === null) continue;
    // The active unit represents its stack when it is in one, so the blink shows there too.
    const shown = stack.find(blinking) ?? top;
    const alpha = ownAlpha(shown);
    each((mx, my, sx, sy) => {
      if (mx !== city.x || my !== city.y) return;
      if (badgeMode(t) === 'dot') {
        badge(sx, sy, stack.length, alpha);
        return;
      }
      glyph(sx, sy, colors[view.me], UNIT_GLYPH[face(shown).type], alpha, 0.6, 0.3, 0.3);
      if (stack.length >= 2) badge(sx, sy, stack.length, alpha);
    });
  }

  // Own top-level units outside own cities.
  for (const u of showUnits ? view.myUnits : []) {
    if (u.carriedBy !== null || inOwnCity(u.x, u.y)) continue;
    each((mx, my, sx, sy) => {
      if (mx !== u.x || my !== u.y) return;
      glyph(sx, sy, colors[view.me], UNIT_GLYPH[face(u).type], ownAlpha(u));
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

  // Production map: each own city shows what it is building, with the turns left in the badge.
  if (o.productionMap) {
    for (const city of view.myCities) {
      if (city.production === null) continue;
      const left = Math.max(1, buildTime(city, city.production) - city.progress);
      each((mx, my, sx, sy) => {
        if (mx !== city.x || my !== city.y) return;
        glyph(sx, sy, colors[view.me], UNIT_GLYPH[city.production!], 1);
        badge(sx, sy, left, 1);
      });
    }
  }

  // City names, on top of the units.
  if (cityLabelVisible(t)) {
    ctx.font = `bold ${Math.round(t * 0.32)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3;
    for (const city of view.knownCities) {
      each((mx, my, sx, sy) => {
        if (mx !== city.x || my !== city.y) return;
        ctx.strokeStyle = '#000';
        ctx.strokeText(city.name, sx + t / 2, sy + t);
        ctx.fillStyle = '#fff';
        ctx.fillText(city.name, sx + t / 2, sy + t);
      });
    }
  }

  // Other patrols: a dashed line between the endpoints, with a ring at each end.
  for (const pair of o.patrols ?? []) {
    const pts = unwrapPath(pair);
    ctx.strokeStyle = '#ffb000';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(cx(p), cy(p)) : ctx.lineTo(cx(p), cy(p))));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(cx(p), cy(p), t * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // City routes: an arrow from the route city to its destination, with the unit types it serves.
  for (const r of o.cityRoutes ?? []) {
    const [from, to] = unwrapPath([r.from, r.to]);
    ctx.strokeStyle = '#5ee6b8';
    ctx.fillStyle = '#5ee6b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(cx(from), cy(from));
    ctx.lineTo(cx(to), cy(to));
    ctx.stroke();
    const ang = Math.atan2(cy(to) - cy(from), cx(to) - cx(from));
    const head = Math.max(6, t * 0.45);
    ctx.beginPath();
    ctx.moveTo(cx(to), cy(to));
    ctx.lineTo(cx(to) - head * Math.cos(ang - 0.4), cy(to) - head * Math.sin(ang - 0.4));
    ctx.lineTo(cx(to) - head * Math.cos(ang + 0.4), cy(to) - head * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    if (cityLabelVisible(t)) {
      const label = r.types.map((ty) => UNIT_GLYPH[ty]).join(' ');
      const mx = (cx(from) + cx(to)) / 2;
      const my = (cy(from) + cy(to)) / 2;
      ctx.font = `bold ${Math.round(t * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(label, mx, my - 2);
      ctx.fillText(label, mx, my - 2);
    }
  }

  // Committed route: a solid line, unwrapped like the preview.
  if (o.route && o.route.length > 0) {
    const pts = unwrapPath(o.route);
    ctx.strokeStyle = '#7fd4ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(cx(p), cy(p)) : ctx.lineTo(cx(p), cy(p))));
    ctx.stroke();
    if (o.routeLabel) {
      const last = pts[pts.length - 1];
      ctx.font = `bold ${Math.round(t * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(o.routeLabel, cx(last) + t * 0.4, cy(last) - t * 0.2);
      ctx.fillStyle = '#7fd4ff';
      ctx.fillText(o.routeLabel, cx(last) + t * 0.4, cy(last) - t * 0.2);
    }
  }

  // Path preview: a dotted polyline through square centres, unwrapped so it never jumps across the seam.
  if (!o.attack && o.path && o.path.length > 0) {
    const pts = unwrapPath(o.selected ? [o.selected, ...o.path] : o.path);
    const color = o.pathOk ? '#fff' : '#ff3b3b';
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
  if (!o.attack && !o.path && o.pathLabel && o.pathTarget) {
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

  // Attack hover: a red crosshair (circle plus cross) with the label.
  if (o.attack) {
    const at = o.attack.at;
    const label = o.attack.label;
    each((mx, my, sx, sy) => {
      if (mx !== at.x || my !== at.y) return;
      const hx = sx + t / 2;
      const hy = sy + t / 2;
      ctx.strokeStyle = '#ff3b3b';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(hx, hy, t * 0.35, 0, Math.PI * 2);
      ctx.moveTo(hx - t * 0.48, hy);
      ctx.lineTo(hx + t * 0.48, hy);
      ctx.moveTo(hx, hy - t * 0.48);
      ctx.lineTo(hx, hy + t * 0.48);
      ctx.stroke();
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
