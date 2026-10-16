import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { updateFog } from '../../src/engine/fog';
import { availableActions, describeOrders, loadCandidates } from '../../src/ui/actions';
import { addUnit, makeGame } from '../helpers';

// Player 0 starts in the city at (0,0); player 1 at (6,0).
const M = ['*##...*', '###...#', '##*....'];

function viewOf(s: ReturnType<typeof makeGame>, id: number) {
  updateFog(s, 0);
  const v = getPlayerView(s, 0);
  return { v, u: v.myUnits.find((x) => x.id === id)! };
}

describe('availableActions', () => {
  it('offers an army in a city everything except load, unload and go home', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 0);
    const { v, u } = viewOf(s, a.id);
    const acts = availableActions(v, u);
    expect(acts.load).toBe(false);
    expect(acts.unload).toBe(false);
    expect(acts.goHome).toBe(false);
    expect(acts.sentry).toBe(true);
    expect(acts.patrol).toBe(true);
    expect(acts.explore).toBe(true);
    expect(acts.clearOrders).toBe(false);
    expect(acts.moveTo).toBe(true);
    expect(acts.hold).toBe(true);
    expect(acts.disband).toBe(true);
  });

  it('offers load and unload to a loaded transport in a city while another army waits there', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0, { carriedBy: t.id, orders: { kind: 'sentry' } });
    addUnit(s, 'army', 0, 0, 0);
    const { v, u } = viewOf(s, t.id);
    const acts = availableActions(v, u);
    expect(acts.load).toBe(true);
    expect(acts.unload).toBe(true);
    expect(acts.goHome).toBe(false);
    expect(acts.sentry).toBe(true);
  });

  it('offers a fighter in the field go home but not patrol, explore or sentry', () => {
    const s = makeGame(M);
    const f = addUnit(s, 'fighter', 0, 1, 1);
    const { v, u } = viewOf(s, f.id);
    const acts = availableActions(v, u);
    expect(acts.goHome).toBe(true);
    expect(acts.patrol).toBe(false);
    expect(acts.explore).toBe(false);
    expect(acts.sentry).toBe(false);
    expect(acts.load).toBe(false);
  });

  it('offers an army aboard a transport at sea go home and sentry, but not unload', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 3, 0, { carriedBy: t.id, orders: { kind: 'sentry' } });
    const { v, u } = viewOf(s, a.id);
    const acts = availableActions(v, u);
    expect(acts.goHome).toBe(true);
    expect(acts.sentry).toBe(true);
    expect(acts.unload).toBe(false);
    expect(acts.clearOrders).toBe(true);
    expect(acts.explore).toBe(true);
  });
});

describe('loadCandidates', () => {
  it('lists own armies on the same square that are not already aboard, in id order', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 0, 0);
    const a1 = addUnit(s, 'army', 0, 0, 0);
    const a2 = addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0, { carriedBy: t.id });
    addUnit(s, 'army', 1, 0, 0);
    addUnit(s, 'fighter', 0, 0, 0);
    const { v, u } = viewOf(s, t.id);
    expect(loadCandidates(v, u).map((x) => x.id)).toEqual([a1.id, a2.id]);
  });

  it('is empty for a unit that carries nothing', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 0, 0);
    addUnit(s, 'army', 0, 0, 0);
    const { v, u } = viewOf(s, a.id);
    expect(loadCandidates(v, u)).toEqual([]);
  });
});

describe('describeOrders', () => {
  it('describes each order kind', () => {
    expect(describeOrders(null)).toBe('None');
    expect(describeOrders({ kind: 'sentry' })).toBe('Sentry');
    expect(describeOrders({ kind: 'goto', target: { x: 34, y: 12 } })).toBe('Go-to 34,12');
    expect(describeOrders({ kind: 'patrol', a: { x: 3, y: 4 }, b: { x: 10, y: 12 }, toB: true })).toBe('Patrol 3,4 ↔ 10,12');
    expect(describeOrders({ kind: 'explore' })).toBe('Explore');
  });
});
