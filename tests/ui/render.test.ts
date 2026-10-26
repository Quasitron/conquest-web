import { describe, it, expect, afterAll } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { explosionFade } from '../../src/ui/explosions';
import { drawMap, drawMinimap, type DrawOptions } from '../../src/ui/render';
import { PLAYER_COLORS, TERRAIN_COLORS, UNIT_GLYPH } from '../../src/ui/colors';
import { addUnit, makeGame } from '../helpers';
import { UNIT_ICONS } from '../../src/ui/unitIcons';
import type { GameState } from '../../src/engine/types';

/**
 * Records fillRect, fillText (with x), arc (radius and the alpha in effect) and stroke (with strokeStyle);
 * every other canvas method is a no-op.
 */
function fakeCtx() {
  const calls = {
    fillRect: 0,
    fillText: [] as string[],
    fillAt: [] as { text: string; x: number }[],
    arcs: [] as { r: number; alpha: number }[],
    strokes: [] as string[],
    hatches: 0,
    rects: [] as { x: number; y: number; w: number; h: number; style: string }[],
    dashes: [] as number[][],
    points: [] as { x: number; y: number }[],
    pictures: 0,
    flips: 0,
  };
  const target = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: (x: number, y: number, w: number, h: number) => { calls.fillRect++; calls.rects.push({ x, y, w, h, style: String(target.fillStyle) }); },
    fillText: (t: string, x: number) => { calls.fillText.push(t); calls.fillAt.push({ text: t, x }); },
    arc: (_x: number, _y: number, r: number) => { calls.arcs.push({ r, alpha: target.globalAlpha }); },
    // The diagonal hatch beyond the map's edges is background, not an overlay: counted apart from the strokes.
    stroke: () => { if (target.strokeStyle === '#1b222c') calls.hatches++; else calls.strokes.push(target.strokeStyle); },
    setLineDash: (d: number[]) => { calls.dashes.push(d); },
    drawImage: () => { calls.pictures++; },
    scale: (x: number) => { if (x < 0) calls.flips++; },
    moveTo: (x: number, y: number) => { calls.points.push({ x, y }); },
    lineTo: (x: number, y: number) => { calls.points.push({ x, y }); },
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}),
    set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const M = ['*##...*', '###...#', '##*....'];

/** Default new DrawOptions: nothing active, nothing previewed. */
const NO_OVERLAY = { activeId: null, blinkOn: true, path: null, pathOk: true, pathLabel: null, pathTarget: null, route: null, routeLabel: null, attack: null };

/** Draws player 0's view of the game and returns what was recorded. */
function paint(s: GameState, tile: number, extra: Partial<DrawOptions> = {}, cam = { x: 0, y: 0, tile }) {
  const { ctx, calls } = fakeCtx();
  drawMap(ctx, {
    view: getPlayerView(s, 0), cam, width: 140, height: 60, selected: null, targets: [], colors: PLAYER_COLORS,
    ...NO_OVERLAY, ...extra,
  });
  return calls;
}

describe('render', () => {
  it('draws every on-screen square and own unit glyphs', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 1, 1);
    const view = getPlayerView(s, 0);
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, { view, cam: { x: 0, y: 0, tile: 20 }, width: 140, height: 60, selected: { x: 1, y: 1 }, targets: [], colors: PLAYER_COLORS, ...NO_OVERLAY });
    // background + 4 explored squares (the start city sits in the corner, sight 1, no wrap) + the city's skyline: 5
    // buildings, the ground band, the flag pole and the flag (8 rectangles)
    expect(calls.fillRect).toBe(6 + 8);
    expect(calls.fillText).toContain('A');
  });

  it('a city holding 3 own armies shows the count 3', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    expect(paint(s, 20).fillText).toContain('3');
  });

  it('a transport with 2 armies shows the cargo count 2', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 1, 1);
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    expect(paint(s, 20).fillText).toContain('2');
  });

  it('below 16px tiles badges become dots: no count text, and the city glyph is replaced by the dot', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    const t = addUnit(s, 'transport', 0, 1, 1);
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    const calls = paint(s, 14);
    // Only the transport's own glyph is text: no count, and no army glyph for the city stack.
    expect(calls.fillText).toEqual([UNIT_GLYPH.transport]);
    // Two white dots (city and transport), each at the dot radius.
    expect(calls.arcs.filter((a) => a.r === 14 * 0.1 && a.alpha === 1)).toHaveLength(2);
  });

  it('dot mode: a non-top active unit in a city blinks the city dot', () => {
    const s = makeGame(M);
    const active = addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    const off = paint(s, 14, { activeId: active.id, blinkOn: false });
    expect(off.arcs).toEqual([{ r: 14 * 0.1, alpha: 0.25 }]);
    const on = paint(s, 14, { activeId: active.id, blinkOn: true });
    expect(on.arcs).toEqual([{ r: 14 * 0.1, alpha: 1 }]);
  });

  it('the active unit in a city takes the whole square and alternates with the city under it', () => {
    const s = makeGame(M);
    // The transport is created first, so the army is the stack top; the transport is the active unit.
    const transport = addUnit(s, 'transport', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    // Off beat: nothing of the stack is drawn, only the city.
    const off = paint(s, 20, { activeId: transport.id, blinkOn: false });
    expect(off.fillText).not.toContain(UNIT_GLYPH.transport);
    expect(off.fillText).not.toContain(UNIT_GLYPH.army);
    expect(off.arcs).toEqual([]);
    // On beat: the active unit (not the stack top) at full size, with the count badge for the 2 units.
    const on = paint(s, 20, { activeId: transport.id, blinkOn: true });
    expect(on.fillText).toContain(UNIT_GLYPH.transport);
    expect(on.fillText).not.toContain(UNIT_GLYPH.army);
    expect(on.arcs.map((a) => a.r)).toEqual([20 * 0.38, 20 * 0.2]);
  });

  it('a city unit that is not the active one stays small in the corner', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 0, 0);
    const calls = paint(s, 20, { activeId: null, blinkOn: false });
    expect(calls.fillText).toContain(UNIT_GLYPH.army);
    expect(calls.arcs.map((a) => a.r)).toEqual([20 * 0.38 * 0.6]);
  });

  it('an active unit aboard a carrier shows its own glyph on the carrier square, blinking, with the cargo badge', () => {
    const s = makeGame(M);
    const transport = addUnit(s, 'transport', 0, 3, 1);
    const army = addUnit(s, 'army', 0, 3, 1, { carriedBy: transport.id });
    const off = paint(s, 20, { activeId: army.id, blinkOn: false });
    expect(off.fillText).toContain(UNIT_GLYPH.army);
    expect(off.fillText).not.toContain(UNIT_GLYPH.transport);
    expect(off.fillText).toContain('1');
    expect(off.arcs.map((a) => a.alpha)).toEqual([0.25, 0.25]);
    expect(paint(s, 20, { activeId: army.id, blinkOn: true }).arcs.map((a) => a.alpha)).toEqual([1, 1]);
  });

  it('draws city names only at tile sizes where labels are visible', () => {
    const s = makeGame(M);
    s.cities[0].name = 'Paris';
    expect(paint(s, 28).fillText).toContain('Paris');
    expect(paint(s, 16).fillText).not.toContain('Paris');
  });

  it('a committed route is a solid line with its label', () => {
    const s = makeGame(M);
    const calls = paint(s, 20, { route: [{ x: 0, y: 0 }, { x: 1, y: 0 }], routeLabel: 'Go to' });
    expect(calls.strokes).toContain('#7fd4ff');
    expect(calls.dashes).toContainEqual([]);
    expect(calls.dashes).not.toContainEqual([3, 3]);
    expect(calls.fillText).toContain('Go to');
  });

  it('the attack option draws its label', () => {
    const s = makeGame(M);
    const calls = paint(s, 20, { attack: { at: { x: 1, y: 1 }, label: 'Attack (50%)' } });
    expect(calls.fillText).toContain('Attack (50%)');
    expect(calls.strokes).toContain('#ff3b3b');
  });
  it('the path label is drawn when a path is given, and the preview is red when not ok', () => {
    const s = makeGame(M);
    const calls = paint(s, 20, {
      selected: { x: 0, y: 0 }, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathOk: false, pathLabel: 'arrives turn 3',
    });
    expect(calls.fillText).toContain('arrives turn 3');
    expect(calls.strokes).toEqual(['#ff3b3b']);
  });

  it('a path preview is white when ok', () => {
    const s = makeGame(M);
    const calls = paint(s, 20, { selected: { x: 0, y: 0 }, path: [{ x: 1, y: 0 }] });
    expect(calls.strokes).toEqual(['#fff']);
  });

  it('draws no path when the path is null', () => {
    const s = makeGame(M);
    expect(paint(s, 20, { selected: { x: 0, y: 0 }, path: null, pathLabel: null }).strokes).toEqual([]);
  });

  it('an unreachable hover draws a red mark and the label on the hovered square', () => {
    const s = makeGame(M);
    const calls = paint(s, 20, { selected: { x: 0, y: 0 }, path: null, pathLabel: 'no known path', pathTarget: { x: 1, y: 1 } });
    expect(calls.fillText).toContain('no known path');
    expect(calls.strokes).toContain('#ff3b3b');
  });

  it('draws nothing for a null path without a label', () => {
    const s = makeGame(M);
    const calls = paint(s, 20, { selected: { x: 0, y: 0 }, path: null, pathLabel: null, pathTarget: { x: 1, y: 1 } });
    expect(calls.strokes).toEqual([]);
    expect(calls.fillText).not.toContain('no known path');
  });

  it('on a wrapped map the path label lands on the on-screen copy near the camera', () => {
    const s = makeGame(M, { wrap: true });
    // Camera at the seam (map width 7): the selected square's nearest copy is x = 7, so the path runs 7..9.
    const calls = paint(s, 20, {
      selected: { x: 0, y: 1 }, path: [{ x: 1, y: 1 }, { x: 2, y: 1 }], pathLabel: 'arrives turn 3',
    }, { x: 6.5, y: 0, tile: 20 });
    const label = calls.fillAt.find((f) => f.text === 'arrives turn 3');
    expect(label).toBeDefined();
    expect(label!.x).toBeGreaterThanOrEqual(0);
    expect(label!.x).toBeLessThanOrEqual(140);
  });

  it('on a wrapped map a path is drawn on screen even where its nearest-to-camera copy would be off-screen', () => {
    const s = makeGame(M, { wrap: true });
    // Camera at x=0 on a 7-wide map shown whole: the copy of x=5 nearest the camera is at x=-2, off-screen to the
    // left, but the path must still appear where x=5 really is.
    const calls = paint(s, 20, { selected: { x: 5, y: 1 }, path: [{ x: 6, y: 1 }] }, { x: 0, y: 0, tile: 20 });
    expect(calls.points.some((p) => p.x >= 0 && p.x <= 140 && p.y >= 0 && p.y <= 60)).toBe(true);
  });
  it('a fight playing out draws its effect on its square, and nothing once it is over', () => {
    const s = makeGame(M);
    const fight = {
      at: { x: 1, y: 1 }, attackerId: 9, from: { x: 2, y: 1 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser' as const,
      defenderType: 'army' as const, attackerWon: true, moved: true, destroyed: true, captured: false, text: 't',
    };
    const plain = paint(s, 20).strokes.length;
    const early = paint(s, 20, { fx: [{ fight, age: 100, duration: 800 }] }).strokes.length;
    const burst = paint(s, 20, { fx: [{ fight, age: 600, duration: 800 }] }).strokes.length;
    const over = paint(s, 20, { fx: [{ fight, age: 900, duration: 800 }] }).strokes.length;
    expect(early).toBeGreaterThan(plain);
    expect(burst).toBeGreaterThan(plain);
    expect(over).toBe(plain);
  });
  it('beyond a non-wrapping map\'s edges a hatch shows, and the unexplored fill covers only the map', () => {
    const s = makeGame(M);
    // Camera two squares left of the map: the map starts 40px in; it is 7 squares (140px) wide, 3 (60px) tall.
    const calls = paint(s, 20, {}, { x: -2, y: 0, tile: 20 });
    expect(calls.hatches).toBe(1);
    const unexplored = calls.rects.find((r) => r.style === TERRAIN_COLORS.unexplored)!;
    expect(unexplored).toMatchObject({ x: 40, y: 0, w: 140, h: 60 });
  });

  it('on a wrapping map the unexplored fill runs the full width, so there is no edge to see', () => {
    const s = makeGame(M, { wrap: true });
    const calls = paint(s, 20, {}, { x: -2, y: 0, tile: 20 });
    const unexplored = calls.rects.find((r) => r.style === TERRAIN_COLORS.unexplored)!;
    expect(unexplored).toMatchObject({ x: 0, w: 140 });
  });
  it('while a fight plays, the real unit on its square gives way to the fight\'s own two units', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 1, 1); // the finished result: an army standing on the attacked square
    const fight = {
      at: { x: 1, y: 1 }, attackerId: 9, from: { x: 2, y: 1 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser' as const,
      defenderType: 'army' as const, attackerWon: false, moved: false, destroyed: true, captured: false, text: 't',
    };
    const armyGlyph = UNIT_GLYPH.army;
    expect(paint(s, 20).fillText.filter((x) => x === armyGlyph)).toHaveLength(1);
    const during = paint(s, 20, { fx: [{ fight, age: 100, duration: 800 }] }).fillText;
    // One army (the defender's stand-in, replacing the real one) and the attacking cruiser on its own square.
    expect(during.filter((x) => x === armyGlyph)).toHaveLength(1);
    expect(during).toContain(UNIT_GLYPH.cruiser);
    // Once the fight is over the map shows the result again, with no stand-ins.
    const after = paint(s, 20, { fx: [{ fight, age: 900, duration: 800 }] }).fillText;
    expect(after.filter((x) => x === armyGlyph)).toHaveLength(1);
    expect(after).not.toContain(UNIT_GLYPH.cruiser);
  });
  it('a unit that dies in a later fight of a replay is still drawn until then', () => {
    const s = makeGame(M); // the finished result: the army is gone, killed in the later fight
    const later = {
      at: { x: 1, y: 1 }, attackerId: 9, from: { x: 2, y: 1 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser' as const,
      defenderType: 'army' as const, attackerWon: true, moved: false, destroyed: true, captured: false, text: 't',
    };
    expect(paint(s, 20).fillText).not.toContain(UNIT_GLYPH.army);
    const waiting = paint(s, 20, { pending: [later] }).fillText;
    expect(waiting).toContain(UNIT_GLYPH.army);
    expect(waiting).toContain(UNIT_GLYPH.cruiser);
  });
  it('a blinking active unit is drawn at alpha 0.25 while blink is off', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    expect(paint(s, 20, { activeId: a.id, blinkOn: false }).arcs.map((x) => x.alpha)).toContain(0.25);
  });

  it('the minimap draws a marker for the selected unit only when given one (the caller blinks it)', () => {
    const s = makeGame(M);
    const v = getPlayerView(s, 0);
    const mini = (marker: { x: number; y: number } | null) => {
      const { ctx, calls } = fakeCtx();
      drawMinimap(ctx, v, PLAYER_COLORS, 70, 30, { x: 0, y: 0, tile: 20 }, 140, 60, null, marker);
      return calls.arcs.length;
    };
    expect(mini(null)).toBe(0);
    expect(mini({ x: 2, y: 1 })).toBe(1);
  });

  it('draws a minimap without throwing', () => {
    const s = makeGame(M);
    const { ctx, calls } = fakeCtx();
    drawMinimap(ctx, getPlayerView(s, 0), PLAYER_COLORS, 70, 30, { x: 0, y: 0, tile: 20 }, 140, 60);
    expect(calls.fillRect).toBeGreaterThan(0);
  });
});

describe('explosion fade', () => {
  it('stays full until the burst is half over, dims steadily, and is half strength when the fight ends', () => {
    const f = (b: number, s: number) => explosionFade(b, s);
    expect(f(0.2, 0)).toBe(1);
    expect(f(0.5, 0)).toBe(1);
    expect(f(0.75, 0)).toBeCloseTo(0.875, 5);
    expect(f(1, 0)).toBeCloseTo(0.75, 5);
    expect(f(1, 0.5)).toBeCloseTo(0.625, 5);
    expect(f(1, 1)).toBeCloseTo(0.5, 5);
    for (let i = 1; i <= 10; i++) expect(f(Math.min(1, i / 5), Math.max(0, (i - 5) / 5))).toBeLessThanOrEqual(f(Math.min(1, (i - 1) / 5), Math.max(0, (i - 6) / 5)));
  });
});

describe('unit pictures on the map', () => {
  // A stand-in for the browser's Image: every picture is already loaded and 160 x 100.
  class LoadedImage {
    complete = true;
    naturalWidth = 160;
    naturalHeight = 100;
    onload: (() => void) | null = null;
    src = '';
  }
  const g = globalThis as unknown as Record<string, unknown>;
  afterAll(() => { delete g.Image; });

  it('shows the letter badge when zoomed out, and the picture once the square is big enough', () => {
    g.Image = LoadedImage;
    const s = makeGame(M);
    addUnit(s, 'destroyer', 0, 1, 1);
    // Zoomed out (20 px squares): the letter, no picture.
    const far = paint(s, 20);
    expect(far.fillText).toContain(UNIT_GLYPH.destroyer);
    expect(far.pictures).toBe(0);
    // Zoomed in (40 px squares): the picture instead of the letter.
    const near = paint(s, 40);
    expect(near.pictures).toBe(1 + 1); // the unit's picture and the city's
    expect(near.fillText).not.toContain(UNIT_GLYPH.destroyer);
  });

  it('a fight that destroys something ends in the explosion picture over the loser, in place of the code burst', () => {
    g.Image = LoadedImage;
    const s = makeGame(M);
    const fight = {
      at: { x: 1, y: 1 }, attackerId: 9, from: { x: 2, y: 1 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser' as const,
      defenderType: 'army' as const, attackerWon: true, moved: false, destroyed: true, captured: false, text: 't',
    };
    const shots = paint(s, 40, { fx: [{ fight, age: 100, duration: 800 }] });
    const burst = paint(s, 40, { fx: [{ fight, age: 600, duration: 800 }] });
    const last = paint(s, 40, { fx: [{ fight, age: 780, duration: 800 }] });
    // The shots are the usual rings; once the result bursts the explosion pictures (fire and smoke) are drawn instead.
    expect(burst.pictures).toBeGreaterThan(shots.pictures);
    expect(last.pictures).toBeGreaterThan(shots.pictures);
    expect(burst.strokes.length).toBeLessThan(shots.strokes.length);
    // A plain hit keeps the code burst and gets no explosion.
    const hit = paint(s, 40, { fx: [{ fight: { ...fight, destroyed: false }, age: 600, duration: 800 }] });
    expect(hit.pictures).toBe(shots.pictures);
  });
  it('the explosion lingers a little after its fight has ended, and then is gone', () => {
    g.Image = LoadedImage;
    const s = makeGame(M);
    const fight = {
      at: { x: 1, y: 1 }, attackerId: 9, from: { x: 2, y: 1 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser' as const,
      defenderType: 'army' as const, attackerWon: true, moved: false, destroyed: true, captured: false, text: 't',
    };
    const base = paint(s, 40).pictures;
    const justAfter = paint(s, 40, { fx: [{ fight, age: 900, duration: 800 }] }).pictures; // 100 ms after the end
    const muchLater = paint(s, 40, { fx: [{ fight, age: 800 + 2000, duration: 800 }] }).pictures;
    expect(justAfter).toBeGreaterThan(base);
    expect(muchLater).toBe(base);
  });
  it('mirrors a picture when the unit heads the other way from the way it faces', () => {
    g.Image = LoadedImage;
    const s = makeGame(M);
    const d = addUnit(s, 'destroyer', 0, 1, 1); // the destroyer picture faces right
    const f = addUnit(s, 'fighter', 0, 2, 1, { fuel: 20 }); // the fighter picture faces right too
    const army = addUnit(s, 'army', 0, 0, 1); // the army picture faces right
    const flips = (left: number[]) => paint(s, 40, { headingLeft: new Set(left) }).flips;
    expect(flips([])).toBe(0); // every picture faces right and every unit heads right
    expect(flips([d.id])).toBe(1); // the destroyer heads left, so it is mirrored
    expect(flips([f.id, d.id])).toBe(2); // so is the fighter
    expect(flips([army.id])).toBe(1); // and the army
  });

  it('a unit with no picture keeps its letter at any zoom', () => {
    g.Image = LoadedImage;
    const s = makeGame(M);
    addUnit(s, 'submarine', 0, 1, 1);
    const picture = UNIT_ICONS.submarine; // every unit has one now, so take it away for this test
    delete UNIT_ICONS.submarine;
    try {
      const calls = paint(s, 60);
      expect(calls.pictures).toBe(1); // only the city's
      expect(calls.fillText).toContain(UNIT_GLYPH.submarine);
    } finally {
      UNIT_ICONS.submarine = picture;
    }
  });
});
describe('cities', () => {
  it('are a skyline on a band in the owner\'s colour with a flag, and a plain grey band and no flag when nobody owns them', () => {
    const s = makeGame(M);
    const own = paint(s, 40).rects.filter((r) => r.style === PLAYER_COLORS[0]);
    // The owner's colour shows as the ground band and the flag, and nothing else (no wash behind the city).
    expect(own).toHaveLength(2);
    s.fog[0].explored.fill(1); // the whole map is known, so the unowned city at 2,2 is drawn too
    const neutral = paint(s, 40, {}, { x: 0, y: 0, tile: 40 });
    expect(neutral.rects.some((r) => r.style === TERRAIN_COLORS.neutralCity)).toBe(true);
    // Windows are only drawn on squares big enough for them to be seen.
    expect(paint(s, 40).fillRect).toBeGreaterThan(paint(s, 20).fillRect - 20);
  });
});
describe('city artwork', () => {
  class LoadedImage {
    complete = true;
    naturalWidth = 286;
    naturalHeight = 320;
    onload: (() => void) | null = null;
    src = '';
  }
  const g = globalThis as unknown as Record<string, unknown>;
  afterAll(() => { delete g.Image; });

  it('draws the picture once the squares are big enough, the code skyline when they are small', () => {
    g.Image = LoadedImage;
    const s = makeGame(M);
    expect(paint(s, 40).pictures).toBe(1);
    expect(paint(s, 20).pictures).toBe(0);
    // The owner's colour still marks the city: the ground band and the flag.
    expect(paint(s, 40).rects.filter((r) => r.style === PLAYER_COLORS[0])).toHaveLength(2);
  });

  it('falls back to the code skyline while the picture has not loaded', () => {
    delete g.Image;
    const s = makeGame(M);
    const calls = paint(s, 40);
    expect(calls.pictures).toBe(0);
    expect(calls.fillRect).toBeGreaterThan(15); // buildings and windows
  });
});