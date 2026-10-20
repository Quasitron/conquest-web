import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { updateFog } from '../../src/engine/fog';
import { boxBetween, eligibleFor, inBox, rawSquareAt, unitsInBox } from '../../src/ui/group';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];

function view(s: ReturnType<typeof makeGame>) {
  updateFog(s, 0);
  return getPlayerView(s, 0);
}

describe('boxBetween / inBox', () => {
  it('orders the corners and tests squares inclusively', () => {
    const b = boxBetween({ x: 3, y: 2 }, { x: 1, y: 0 }, 7);
    expect(b).toEqual({ x0: 1, x1: 3, y0: 0, y1: 2 });
    expect(inBox(b, 7, { x: 1, y: 0 })).toBe(true);
    expect(inBox(b, 7, { x: 3, y: 2 })).toBe(true);
    expect(inBox(b, 7, { x: 4, y: 1 })).toBe(false);
    expect(inBox(b, 7, { x: 2, y: 3 })).toBe(false);
  });

  it('treats a box dragged across the seam of a wrapping map as one span', () => {
    const b = boxBetween({ x: 6, y: 0 }, { x: 8, y: 1 }, 7); // columns 6, 0, 1
    expect(inBox(b, 7, { x: 0, y: 0 })).toBe(true);
    expect(inBox(b, 7, { x: 1, y: 1 })).toBe(true);
    expect(inBox(b, 7, { x: 2, y: 1 })).toBe(false);
  });

  it('never covers more than one copy of the map', () => {
    const b = boxBetween({ x: -10, y: 0 }, { x: 30, y: 0 }, 7);
    expect(b.x1 - b.x0 + 1).toBe(7);
  });
});

describe('rawSquareAt', () => {
  it('clamps on a flat map and keeps the unwrapped column on a wrapping one', () => {
    const cam = { x: 0, y: 0, tile: 10 };
    expect(rawSquareAt(cam, 7, 3, false, -50, 500)).toEqual({ x: 0, y: 2 });
    expect(rawSquareAt(cam, 7, 3, true, -15, 5)).toEqual({ x: -2, y: 0 });
  });
});

describe('unitsInBox', () => {
  it('catches own units on the map and in cities, and aboard ships only when awake', () => {
    const s = makeGame(M);
    const inCity = addUnit(s, 'army', 0, 0, 0);
    const onLand = addUnit(s, 'fighter', 0, 1, 1);
    const ship = addUnit(s, 'transport', 0, 2, 0);
    const awake = addUnit(s, 'army', 0, 2, 0, { carriedBy: ship.id });
    const asleep = addUnit(s, 'army', 0, 2, 0, { carriedBy: ship.id, orders: { kind: 'sentry' } });
    const outside = addUnit(s, 'army', 0, 2, 2);
    const v = view(s);
    const ids = unitsInBox(v, { x0: 0, x1: 2, y0: 0, y1: 1 }).map((u) => u.id);
    expect(ids).toContain(inCity.id);
    expect(ids).toContain(onLand.id);
    expect(ids).toContain(ship.id);
    expect(ids).toContain(awake.id);
    expect(ids).not.toContain(asleep.id);
    expect(ids).not.toContain(outside.id);
  });
});

describe('eligibleFor', () => {
  it('skips units for which the order is unavailable', () => {
    const s = makeGame(M);
    const army = addUnit(s, 'army', 0, 0, 0);
    const fighter = addUnit(s, 'fighter', 0, 1, 0);
    const v = view(s);
    const all = [army.id, fighter.id];
    // A fighter outside a city cannot go on sentry or explore; clear orders needs orders.
    expect(eligibleFor(v, all, 'sentry').map((u) => u.id)).toEqual([army.id]);
    expect(eligibleFor(v, all, 'explore').map((u) => u.id)).toEqual([army.id]);
    expect(eligibleFor(v, all, 'clearOrders')).toEqual([]);
    expect(eligibleFor(v, all, 'goHome').map((u) => u.id)).toEqual([fighter.id]);
    expect(eligibleFor(v, all, 'moveTo')).toHaveLength(2);
    expect(eligibleFor(v, all, 'hold')).toHaveLength(2);
  });

  it('repair takes only the damaged units, in a city or at sea', () => {
    const s = makeGame(M);
    const hurtInPort = addUnit(s, 'destroyer', 0, 0, 0, { damage: 1 });
    const hurtAtSea = addUnit(s, 'cruiser', 0, 4, 1, { damage: 2 });
    const fit = addUnit(s, 'destroyer', 0, 3, 1);
    const v = view(s);
    expect(eligibleFor(v, [hurtInPort.id, hurtAtSea.id, fit.id], 'repair').map((u) => u.id)).toEqual([hurtInPort.id, hurtAtSea.id]);
  });
});
