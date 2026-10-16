import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { drawMap, drawMinimap, type DrawOptions } from '../../src/ui/render';
import { PLAYER_COLORS, UNIT_GLYPH } from '../../src/ui/colors';
import { addUnit, makeGame } from '../helpers';
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
  };
  const target = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: () => { calls.fillRect++; },
    fillText: (t: string, x: number) => { calls.fillText.push(t); calls.fillAt.push({ text: t, x }); },
    arc: (_x: number, _y: number, r: number) => { calls.arcs.push({ r, alpha: target.globalAlpha }); },
    stroke: () => { calls.strokes.push(target.strokeStyle); },
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}),
    set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const M = ['*##...*', '###...#', '##*....'];

/** Default new DrawOptions: nothing active, nothing previewed. */
const NO_OVERLAY = { activeId: null, blinkOn: true, path: null, pathOk: true, pathLabel: null };

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
    // background + 4 explored squares (the start city sits in the corner, sight 1, no wrap) + the city's inner square
    expect(calls.fillRect).toBe(6);
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

  it('a non-top active unit in a city is the stack glyph shown, and the whole marker blinks', () => {
    const s = makeGame(M);
    // The transport is created first, so the army is the stack top; the transport is the active unit.
    const transport = addUnit(s, 'transport', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    const off = paint(s, 20, { activeId: transport.id, blinkOn: false });
    expect(off.fillText).toContain(UNIT_GLYPH.transport);
    expect(off.fillText).not.toContain(UNIT_GLYPH.army);
    // City glyph and the count badge (2 units), both at 0.25.
    expect(off.arcs.map((a) => a.alpha)).toEqual([0.25, 0.25]);
    const on = paint(s, 20, { activeId: transport.id, blinkOn: true });
    expect(on.fillText).toContain(UNIT_GLYPH.transport);
    expect(on.arcs.map((a) => a.alpha)).toEqual([1, 1]);
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

  it('a blinking active unit is drawn at alpha 0.25 while blink is off', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    expect(paint(s, 20, { activeId: a.id, blinkOn: false }).arcs.map((x) => x.alpha)).toContain(0.25);
  });

  it('draws a minimap without throwing', () => {
    const s = makeGame(M);
    const { ctx, calls } = fakeCtx();
    drawMinimap(ctx, getPlayerView(s, 0), PLAYER_COLORS, 70, 30, { x: 0, y: 0, tile: 20 }, 140, 60);
    expect(calls.fillRect).toBeGreaterThan(0);
  });
});
