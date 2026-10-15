import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { drawMap, drawMinimap } from '../../src/ui/render';
import { PLAYER_COLORS } from '../../src/ui/colors';
import { addUnit, makeGame } from '../helpers';

/** Records fillRect and fillText calls; every other canvas method is a no-op. */
function fakeCtx() {
  const calls = { fillRect: 0, fillText: [] as string[] };
  const target = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', globalAlpha: 1,
    fillRect: () => { calls.fillRect++; },
    fillText: (t: string) => { calls.fillText.push(t); },
  };
  const ctx = new Proxy(target, {
    get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}),
    set: (t, k, v) => { (t as Record<string | symbol, unknown>)[k] = v; return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const M = ['*##...*', '###...#', '##*....'];

describe('render', () => {
  it('draws every on-screen square and own unit glyphs', () => {
    const s = makeGame(M);
    addUnit(s, 'army', 0, 1, 1);
    const view = getPlayerView(s, 0);
    const { ctx, calls } = fakeCtx();
    drawMap(ctx, { view, cam: { x: 0, y: 0, tile: 20 }, width: 140, height: 60, selected: { x: 1, y: 1 }, targets: [], colors: PLAYER_COLORS });
    // background + 4 explored squares (the start city sits in the corner, sight 1, no wrap) + the city's inner square
    expect(calls.fillRect).toBe(6);
    expect(calls.fillText).toContain('A');
  });

  it('draws a minimap without throwing', () => {
    const s = makeGame(M);
    const { ctx, calls } = fakeCtx();
    drawMinimap(ctx, getPlayerView(s, 0), PLAYER_COLORS, 70, 30, { x: 0, y: 0, tile: 20 }, 140, 60);
    expect(calls.fillRect).toBeGreaterThan(0);
  });
});
