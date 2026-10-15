import { UNIT_STATS, isCrippled, type PlayerView, type Pos } from '../engine';
import type { Camera } from './camera';
import type { StepTarget } from './targets';
import { TERRAIN_COLORS, UNIT_GLYPH } from './colors';

export interface DrawOptions {
  view: PlayerView;
  cam: Camera;
  width: number;
  height: number;
  selected: Pos | null;
  targets: StepTarget[];
  /** Color per seat, indexed by PlayerId. */
  colors: string[];
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

  const glyph = (sx: number, sy: number, color: string, text: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx + t / 2, sy + t / 2, t * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(t * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx + t / 2, sy + t / 2 + 1);
    ctx.globalAlpha = 1;
  };

  // Enemy markers (fade with age).
  for (const e of view.enemies) {
    const age = view.turn - e.turnSeen;
    const alpha = e.visibleNow ? 1 : age < 1 ? 0.7 : 0.4;
    each((mx, my, sx, sy) => {
      if (mx === e.x && my === e.y) glyph(sx, sy, colors[e.owner], UNIT_GLYPH[e.type], alpha);
    });
  }

  // Own top-level units outside cities (units in cities are listed in the side panel).
  const cityAt = (x: number, y: number) => view.knownCities.some((c) => c.x === x && c.y === y);
  for (const u of view.myUnits) {
    if (u.carriedBy !== null || cityAt(u.x, u.y)) continue;
    each((mx, my, sx, sy) => {
      if (mx !== u.x || my !== u.y) return;
      glyph(sx, sy, colors[view.me], UNIT_GLYPH[u.type], u.movesLeft > 0 ? 1 : 0.6);
      const hasCargo = view.myUnits.some((c) => c.carriedBy === u.id);
      if (hasCargo) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx + t * 0.7, sy + t * 0.1, t * 0.18, t * 0.18);
      }
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
