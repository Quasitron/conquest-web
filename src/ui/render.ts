import { CITY_STRENGTH_HITS, rankOf, UNIT_STATS, buildTime, isCrippled, type PlayerView, type Pos, type Unit, type UnitType } from '../engine';
import type { Camera } from './camera';
import type { StepTarget } from './targets';
import { TERRAIN_COLORS, UNIT_GLYPH } from './colors';
import { badgeMode, cityLabelVisible, cityStackTop } from './labels';
import type { GroupBox } from './group';
import { fightActors, fightFrame, type Fight } from './fights';
import { ICON_MIN_TILE, cityImage, iconFlipped, iconImage, iconSize } from './unitIcons';
import { drawFightFx } from './fightFx';

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
  /** A square to flash with a ring (a report line was just shown), or null. */
  flash?: Pos | null;
  /** Enemy units just discovered at the start of your turn: each gets a flashing red ring for a moment. */
  sightings?: readonly Pos[];
  /** Fights playing out now: `age` ms into a run of `duration` ms. */
  fx?: { fight: Fight; age: number; duration: number }[];
  /** Ids of own units heading left (see unitsHeadingLeft), so their pictures are mirrored; others face right. */
  headingLeft?: ReadonlySet<number>;
  /** Fights of a replay still to come: their units are drawn as they were before the fight, so none vanishes early. */
  pending?: Fight[];
  /** The box being dragged in Group mode, drawn as a yellow rectangle. */
  groupBox?: GroupBox | null;
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
  // Beyond the map's edges a dark diagonal hatch shows, so a real edge never looks like unexplored squares.
  ctx.fillStyle = '#06080b';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#1b222c';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = -height; k < width; k += 10) {
    ctx.moveTo(k, 0);
    ctx.lineTo(k + height, height);
  }
  ctx.stroke();
  // The map itself (all the way across on a wrapping map) is unexplored until squares are revealed.
  const mapLeft = view.wrap ? 0 : (0 - cam.x) * t;
  const mapRight = view.wrap ? width : (view.width - cam.x) * t;
  ctx.fillStyle = TERRAIN_COLORS.unexplored;
  ctx.fillRect(mapLeft, (0 - cam.y) * t, mapRight - mapLeft, view.height * t);

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
  /**
   * A path drawn once in each copy of the map (left, middle, right) on a wrapping map, so it shows wherever the
   * camera is; unwrapPath alone picks one copy and that one can be off-screen. One copy on a flat map.
   */
  const copiesOf = (raw: Pos[]): Pos[][] => {
    const base = unwrapPath(raw);
    return (view.wrap ? [-view.width, 0, view.width] : [0]).map((off) => base.map((p) => ({ x: p.x + off, y: p.y })));
  };
  const cx = (p: Pos) => (p.x - cam.x + 0.5) * t;
  /** A label is drawn only on the copy of a path whose end is actually in view. */
  const onScreenX = (x: number) => x >= 0 && x <= width;
  const cy = (p: Pos) => (p.y - cam.y + 0.5) * t;

  // A city: its skyline (the artwork once loaded, else grey buildings drawn here) standing on a band in the owner's
  // colour, with a flag on the tallest tower, so it reads as a city and as whose, at any zoom. A city nobody owns has a
  // plain grey band and no flag. (There is no colour wash behind it: red over grass just looked brown.)
  const SKYLINE: readonly (readonly [number, number, number])[] = [
    [0.10, 0.14, 0.34], [0.26, 0.12, 0.50], [0.40, 0.16, 0.74], [0.58, 0.12, 0.46], [0.72, 0.18, 0.30],
  ];
  const drawCity = (sx: number, sy: number, owner: string | null) => {
    const tint = owner ?? TERRAIN_COLORS.neutralCity;
    const base = sy + t * 0.8;
    const line = Math.max(1, t * 0.03);
    ctx.lineWidth = line;
    ctx.strokeStyle = '#10151c';
    const art = t >= ICON_MIN_TILE ? cityImage() : null;
    if (art) {
      // The artwork: the skyline picture standing on the owner's band, the flag on its tower.
      const h = t * 0.84;
      const w = Math.min(t * 0.92, h * (art.naturalWidth / art.naturalHeight));
      const hh = w * (art.naturalHeight / art.naturalWidth);
      ctx.drawImage(art, sx + (t - w) / 2, base + t * 0.03 - hh, w, hh);
      ctx.fillStyle = tint;
      ctx.fillRect(sx + t * 0.06, base, t * 0.88, t * 0.13);
      ctx.strokeRect(sx + t * 0.06, base, t * 0.88, t * 0.13);
      if (owner !== null) {
        const px = sx + t * 0.5;
        const top = base + t * 0.03 - hh + hh * 0.05; // the tip of the aerial
        ctx.fillStyle = '#10151c';
        ctx.fillRect(px - line / 2, top - t * 0.12, line, t * 0.12);
        ctx.fillStyle = owner;
        ctx.fillRect(px, top - t * 0.12, t * 0.14, t * 0.07);
        ctx.strokeRect(px, top - t * 0.12, t * 0.14, t * 0.07);
      }
      return;
    }
    for (const [bx, bw, bh] of SKYLINE) {
      ctx.fillStyle = '#cfd6df';
      ctx.fillRect(sx + t * bx, base - t * bh, t * bw, t * bh);
      ctx.strokeRect(sx + t * bx, base - t * bh, t * bw, t * bh);
      if (t >= 28) {
        // dark windows in two columns, from the top down
        ctx.fillStyle = '#3a4656';
        const w = t * bw * 0.22;
        for (let wy = base - t * bh + t * 0.05; wy < base - t * 0.08; wy += t * 0.1) {
          ctx.fillRect(sx + t * bx + t * bw * 0.2, wy, w, t * 0.045);
          ctx.fillRect(sx + t * bx + t * bw * 0.58, wy, w, t * 0.045);
        }
      }
    }
    // The ground band in the owner's colour.
    ctx.fillStyle = tint;
    ctx.fillRect(sx + t * 0.06, base, t * 0.88, t * (t < 20 ? 0.2 : 0.13));
    ctx.strokeRect(sx + t * 0.06, base, t * 0.88, t * (t < 20 ? 0.2 : 0.13));
    // The flag on the tallest tower.
    if (owner !== null) {
      const px = sx + t * 0.48;
      const top = base - t * 0.74;
      ctx.fillStyle = '#10151c';
      ctx.fillRect(px - line / 2, top - t * 0.14, line, t * 0.14); // the pole
      ctx.fillStyle = owner;
      ctx.fillRect(px, top - t * 0.14, t * 0.14, t * 0.08);
      ctx.strokeRect(px, top - t * 0.14, t * 0.14, t * 0.08);
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
      drawCity(sx, sy, city && city.owner !== null ? colors[city.owner] : null);
      // With the city strength rule the band doubles as the strength bar: each hit taken darkens a third from the right.
      if (city && city.owner !== null && city.damage > 0 && view.rules.cityStrength) {
        const bandH = t >= ICON_MIN_TILE ? t * 0.13 : t * (t < 20 ? 0.2 : 0.13);
        const full = t * 0.88;
        const lost = full * Math.min(1, city.damage / CITY_STRENGTH_HITS);
        ctx.fillStyle = '#10151c';
        ctx.fillRect(sx + t * 0.06 + full - lost, sy + t * 0.8, lost, bandH);
        ctx.strokeRect(sx + t * 0.06, sy + t * 0.8, full, bandH);
      }
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

  /**
   * A unit on the map: its picture inside a frame in the owner's colour when the square is big enough, else the
   * letter badge. The picture is mirrored when the unit heads the other way from the way the picture faces.
   */
  const unitMark = (
    sx: number, sy: number, color: string, type: UnitType, alpha: number, scale = 1, ox = 0.5, oy = 0.5, headingLeft = false, rank = 0,
  ) => {
    const img = t * scale >= ICON_MIN_TILE ? iconImage(type) : null;
    if (!img) {
      glyph(sx, sy, color, UNIT_GLYPH[type], alpha, scale, ox, oy);
      return;
    }
    const size = t * scale;
    const cx = sx + t * ox;
    const cy = sy + t * oy;
    const frame = size * 0.94;
    // A light dark underlay (so the picture stands out from the terrain), then a dark outline round a thick border in
    // the owner's colour: the owner reads on any terrain, even a blue player's ship on blue water. There is no colour
    // wash inside the frame (red over grass just looked brown).
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - frame / 2, cy - frame / 2, frame, frame);
    const band = Math.max(3, size * 0.08);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = band + 2;
    ctx.strokeRect(cx - frame / 2, cy - frame / 2, frame, frame);
    ctx.strokeStyle = color;
    ctx.lineWidth = band;
    ctx.strokeRect(cx - frame / 2, cy - frame / 2, frame, frame);
    // The picture fills most of the frame; a long ship may reach nearly edge to edge.
    const fill = iconSize(type);
    const k = Math.min((size * 0.9 * fill) / img.naturalWidth, (size * 0.84 * fill) / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.save();
    ctx.translate(cx, cy);
    if (iconFlipped(type, headingLeft)) ctx.scale(-1, 1);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    // Promotion rank: one gold pip per step, along the top-left of the frame.
    for (let i = 0; i < rank; i++) {
      const r = Math.max(2, size * 0.055);
      ctx.fillStyle = '#f2c230';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx - frame / 2 + band + r + i * r * 2.4, cy - frame / 2 + band + r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
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
  const left = (u: Unit) => o.headingLeft?.has(u.id) ?? false;
  const ownAlpha = (u: Unit) => (blinking(u) && !o.blinkOn ? 0.25 : face(u).movesLeft > 0 ? 1 : 0.6);

  // Enemy markers (fade with age).
  const showUnits = !o.productionMap;
  // While a fight plays, its two squares show the fight's own units (see fightActors), not the finished result.
  const running = (o.fx ?? []).flatMap((a) => {
    const frame = fightFrame(a.age, a.fight, a.duration);
    return frame ? [{ fight: a.fight, frame, actors: fightActors(a.fight, frame) }] : [];
  });
  const hiddenSquares = new Set<string>();
  const hide = (f: Fight) => {
    hiddenSquares.add(`${f.at.x},${f.at.y}`);
    if (f.from) hiddenSquares.add(`${f.from.x},${f.from.y}`);
  };
  for (const r of running) if (r.actors.length > 0) hide(r.fight);
  // A fight still to come in a replay: its units stand as they did before it (a unit that survives one fight and dies
  // in a later one must not vanish early). One that shares a square with a fight playing now gives way to it.
  const waiting = (o.pending ?? []).flatMap((f) => {
    const actors = fightActors(f, { shots: 0, burst: 0, slide: 0, outcome: 'hit' });
    const clash = hiddenSquares.has(`${f.at.x},${f.at.y}`) || (f.from !== null && hiddenSquares.has(`${f.from.x},${f.from.y}`));
    return actors.length > 0 && !clash ? [{ fight: f, actors }] : [];
  });
  for (const w of waiting) hide(w.fight);
  const hidden = (x: number, y: number) => hiddenSquares.has(`${x},${y}`);
  for (const e of showUnits ? view.enemies : []) {
    const age = view.turn - e.turnSeen;
    const alpha = e.visibleNow ? 1 : age < 1 ? 0.7 : 0.4;
    each((mx, my, sx, sy) => {
      if (mx === e.x && my === e.y && !hidden(mx, my)) unitMark(sx, sy, colors[e.owner], e.type, alpha);
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
    const activeHere = blinking(shown);
    each((mx, my, sx, sy) => {
      if (mx !== city.x || my !== city.y || hidden(mx, my)) return;
      if (badgeMode(t) === 'dot') {
        badge(sx, sy, stack.length, alpha);
        return;
      }
      if (activeHere) {
        // The unit that needs orders takes the whole square and alternates with the city under it.
        if (o.blinkOn) {
          unitMark(sx, sy, colors[view.me], face(shown).type, face(shown).movesLeft > 0 ? 1 : 0.6, 1, 0.5, 0.5, left(face(shown)), rankOf(face(shown).wins));
          if (stack.length >= 2) badge(sx, sy, stack.length, 1);
        }
        return;
      }
      unitMark(sx, sy, colors[view.me], face(shown).type, alpha, 0.6, 0.3, 0.3, left(face(shown)));
      if (stack.length >= 2) badge(sx, sy, stack.length, alpha);
    });
  }

  // Own top-level units outside own cities.
  for (const u of showUnits ? view.myUnits : []) {
    if (u.carriedBy !== null || inOwnCity(u.x, u.y)) continue;
    each((mx, my, sx, sy) => {
      if (mx !== u.x || my !== u.y || hidden(mx, my)) return;
      unitMark(sx, sy, colors[view.me], face(u).type, ownAlpha(u), 1, 0.5, 0.5, left(face(u)), rankOf(face(u).wins));
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

  // Newly discovered enemy units flash a red ring (with the alert sound), so the eye is drawn to them.
  if (o.sightings && o.sightings.length > 0 && o.blinkOn) {
    each((mx, my, sx, sy) => {
      if (!o.sightings!.some((f) => f.x === mx && f.y === my)) return;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ff4d3d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sx + t / 2, sy + t / 2, t * 0.66, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + t / 2, sy + t / 2, t * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  // A flashing ring on a square picked out from a report.
  if (o.flash && o.blinkOn) {
    const f = o.flash;
    each((mx, my, sx, sy) => {
      if (mx !== f.x || my !== f.y) return;
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sx + t / 2, sy + t / 2, t * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  // The Group mode box, once in each copy of the map on a wrapping map.
  if (o.groupBox) {
    const g = o.groupBox;
    for (const off of view.wrap ? [-view.width, 0, view.width] : [0]) {
      const rx = (g.x0 + off - cam.x) * t;
      const ry = (g.y0 - cam.y) * t;
      const rw = (g.x1 - g.x0 + 1) * t;
      const rh = (g.y1 - g.y0 + 1) * t;
      ctx.fillStyle = 'rgba(255, 221, 0, 0.18)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = '#ffdd00';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }

  // Fights being played out: the two units (the loser fading, a winner that moves sliding in), then the effect, each
  // drawn on every on-screen copy of the map.
  const copies = view.wrap ? [-view.width, 0, view.width] : [0];
  for (const w of waiting) {
    for (const actor of w.actors) {
      for (const off of copies) unitMark((actor.x + off - cam.x) * t, (actor.y - cam.y) * t, colors[actor.owner], actor.type, actor.alpha, 1, 0.5, 0.5, actor.faceLeft);
    }
  }
  for (const r of running) {
    for (const actor of r.actors) {
      for (const off of copies) unitMark((actor.x + off - cam.x) * t, (actor.y - cam.y) * t, colors[actor.owner], actor.type, actor.alpha, 1, 0.5, 0.5, actor.faceLeft);
    }
    each((mx, my, sx, sy) => {
      if (mx === r.fight.at.x && my === r.fight.at.y) drawFightFx(ctx, sx + t / 2, sy + t / 2, t, r.frame);
    });
  }
  // Other patrols: a dashed line between the endpoints, with a ring at each end.
  for (const pair of o.patrols ?? []) {
    for (const pts of copiesOf(pair)) {
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
  }

  // City routes: an arrow from the route city to its destination, with the unit types it serves.
  for (const r of o.cityRoutes ?? []) {
    for (const [from, to] of copiesOf([r.from, r.to])) {
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
  }

  // Committed route: a solid line, unwrapped like the preview.
  if (o.route && o.route.length > 0) {
    for (const pts of copiesOf(o.route)) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(cx(p), cy(p)) : ctx.lineTo(cx(p), cy(p))));
      ctx.stroke();
      if (o.routeLabel && onScreenX(cx(pts[pts.length - 1]))) {
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
  }

  // Path preview: a dotted polyline through square centres, unwrapped so it never jumps across the seam.
  if (!o.attack && o.path && o.path.length > 0) {
    const color = o.pathOk ? '#fff' : '#ff3b3b';
    for (const pts of copiesOf(o.selected ? [o.selected, ...o.path] : o.path)) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(cx(p), cy(p)) : ctx.lineTo(cx(p), cy(p))));
      ctx.stroke();
      ctx.setLineDash([]);
      if (o.pathLabel && onScreenX(cx(pts[pts.length - 1]))) {
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
  w: number, h: number, cam: Camera, viewW: number, viewH: number, ping: Pos | null = null, marker: Pos | null = null,
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
  // The selected unit: a bright dot (the caller blinks it by passing the marker only on every other beat).
  if (marker) {
    ctx.fillStyle = '#ffe45c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc((marker.x + 0.5) * sx, (marker.y + 0.5) * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // A ping on the minimap marks where a replayed fight is.
  if (ping) {
    const px = (ping.x + 0.5) * sx;
    const py = (ping.y + 0.5) * sy;
    ctx.strokeStyle = '#ffd24a';
    ctx.fillStyle = '#ff4d4d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
