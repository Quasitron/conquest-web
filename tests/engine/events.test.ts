import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { eventsFor } from '../../src/engine/events';
import { moveUnit } from '../../src/engine/movement';
import type { GameEvent } from '../../src/engine/types';
import { addUnit, attackerAlwaysHits, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];

describe('eventsFor', () => {
  it('keeps own events and hides unseen enemy moves', () => {
    const s = makeGame(M);
    const mine = addUnit(s, 'army', 0, 1, 1);
    const r = apply(s, { type: 'move', player: 0, unitId: mine.id, dir: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(eventsFor(r.state, r.events, 0)).toEqual(r.events);
    expect(eventsFor(r.state, r.events, 1)).toEqual([]);
  });

  it('shows an enemy move that ends in sight', () => {
    const s = makeGame(M);
    const d = addUnit(s, 'destroyer', 0, 3, 1);
    const r = apply(s, { type: 'move', player: 0, unitId: d.id, dir: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(eventsFor(r.state, r.events, 1)).toEqual([]);
    const r2 = apply(r.state, { type: 'move', player: 0, unitId: d.id, dir: 2 });
    if (!r2.ok) throw new Error(r2.error);
    expect(eventsFor(r2.state, r2.events, 1)).toEqual(r2.events);
  });

  it('reports an enemy transport sinking without revealing its cargo', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 1, 4, 1);
    for (let i = 0; i < 3; i++) addUnit(s, 'army', 1, 4, 1, { carriedBy: t.id });
    const d = addUnit(s, 'destroyer', 0, 3, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, attackerAlwaysHits(), d, 2, events)).toBeNull();
    const destroyedForAttacker = eventsFor(s, events, 0).filter((e) => e.type === 'unitDestroyed');
    expect(destroyedForAttacker).toEqual([expect.objectContaining({ unitId: t.id, reason: 'combat' })]);
    expect(eventsFor(s, events, 1).filter((e) => e.type === 'unitDestroyed')).toHaveLength(4);
  });

  it('hides combat between other players far from you', () => {
    const s = makeGame(M, { players: 3 });
    addUnit(s, 'destroyer', 1, 5, 1);
    const d = addUnit(s, 'destroyer', 0, 4, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, attackerAlwaysHits(), d, 2, events)).toBeNull();
    expect(eventsFor(s, events, 2)).toEqual([]);
    expect(eventsFor(s, events, 1).some((e) => e.type === 'combat')).toBe(true);
  });

  it('shows production only to its owner and turn starts to everyone', () => {
    const s = makeGame(M);
    const u = addUnit(s, 'army', 0, 0, 0);
    const events: GameEvent[] = [
      { type: 'unitProduced', unitId: u.id, cityId: 0, unitType: 'army' },
      { type: 'turnStarted', player: 1, turn: 2 },
    ];
    expect(eventsFor(s, events, 0)).toEqual(events);
    expect(eventsFor(s, events, 1)).toEqual([events[1]]);
  });
});
