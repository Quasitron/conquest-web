import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { drawMap, drawMinimap } from '../../src/ui/render';
import { PLAYER_COLORS } from '../../src/ui/colors';
import { addUnit, makeGame } from '../helpers';

/** Records fillRect, fillText and arc calls (arc with the alpha in effect); every other canvas method is a no-op. */
function fakeCtx() {
  const calls = { fillRect: 0, fillText: [] as string[], arcAlpha: [] as number[] };
  const target = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: () => { calls.fillRect++; },
    fillText: (t: string) => { calls.fillText.push(t); },
    arc: () => { calls.arcAlpha.push(target.globalAlpha); },
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
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, { view: getPlayerView(s, 0), cam: { x: 0, y: 0, tile: 20 }, width: 140, height: 60, selected: null, targets: [], colors: PLAYER_COLORS, ...NO_OVERLAY });
    expect(calls.fillText).toContain('3');
  });

  it('a transport with 2 armies shows the cargo count 2', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 1, 1);
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, { view: getPlayerView(s, 0), cam: { x: 0, y: 0, tile: 20 }, width: 140, height: 60, selected: null, targets: [], colors: PLAYER_COLORS, ...NO_OVERLAY });
    expect(calls.fillText).toContain('2');
  });

  it('below 16px tiles badges become dots (no count text)', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    const t = addUnit(s, 'transport', 0, 1, 1);
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, { view: getPlayerView(s, 0), cam: { x: 0, y: 0, tile: 14 }, width: 140, height: 60, selected: null, targets: [], colors: PLAYER_COLORS, ...NO_OVERLAY });
    expect(calls.fillText.filter((x) => /^\d+$/.test(x))).toEqual([]);
    expect(calls.arcAlpha.length).toBeGreaterThan(0);
  });

  it('the path label is drawn when a path is given', () => {
    const s = makeGame(M);
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, {
      view: getPlayerView(s, 0), cam: { x: 0, y: 0, tile: 20 }, width: 140, height: 60,
      selected: { x: 0, y: 0 }, targets: [], colors: PLAYER_COLORS,
      activeId: null, blinkOn: true, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathOk: false, pathLabel: 'arrives turn 3',
    });
    expect(calls.fillText).toContain('arrives turn 3');
  });

  it('a blinking active unit is drawn at alpha 0.25 while blink is off', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, { view: getPlayerView(s, 0), cam: { x: 0, y: 0, tile: 20 }, width: 140, height: 60, selected: null, targets: [], colors: PLAYER_COLORS, ...NO_OVERLAY, activeId: a.id, blinkOn: false });
    expect(calls.arcAlpha).toContain(0.25);
  });

  it('draws a minimap without throwing', () => {
    const s = makeGame(M);
    const { ctx, calls } = fakeCtx();
    drawMinimap(ctx, getPlayerView(s, 0), PLAYER_COLORS, 70, 30, { x: 0, y: 0, tile: 20 }, 140, 60);
    expect(calls.fillRect).toBeGreaterThan(0);
  });
});
