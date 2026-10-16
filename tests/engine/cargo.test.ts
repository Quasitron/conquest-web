import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { eventsFor } from '../../src/engine/events';
import { loadUnits } from '../../src/engine/cargo';
import { moveUnit } from '../../src/engine/movement';
import { cargoOf, unitById } from '../../src/engine/query';
import { Rng } from '../../src/engine/rng';
import type { Command, GameEvent, GameState } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];
const rng = new Rng(1);

function run(s: GameState, cmd: Command) {
  const r = apply(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('auto-sentry and auto-load', () => {
  it('an army boarding a transport at sea is sentried', () => {
    const s = makeGame(M);
    addUnit(s, 'transport', 0, 3, 1);
    const a = addUnit(s, 'army', 0, 2, 1);
    expect(moveUnit(s, rng, a, 2, [])).toBeNull();
    expect(a.orders).toEqual({ kind: 'sentry' });
  });

  it('a fighter landing on a carrier is sentried', () => {
    const s = makeGame(M);
    addUnit(s, 'carrier', 0, 3, 1);
    const f = addUnit(s, 'fighter', 0, 2, 1);
    expect(moveUnit(s, rng, f, 2, [])).toBeNull();
    expect(f.orders).toEqual({ kind: 'sentry' });
  });

  function cityWithTwoArmies(rules: { sentriedStayAsGarrison: boolean }) {
    const s = makeGame(M, { rules });
    s.cities[2].owner = 0;
    const t = addUnit(s, 'transport', 0, 2, 2);
    const sentried = addUnit(s, 'army', 0, 2, 2, { orders: { kind: 'sentry' } });
    const plain = addUnit(s, 'army', 0, 2, 2);
    return { s, t, sentried, plain };
  }

  it('auto-load takes sentried armies by default', () => {
    const { s, t, sentried, plain } = cityWithTwoArmies({ sentriedStayAsGarrison: false });
    expect(moveUnit(s, rng, t, 2, [])).toBeNull();
    expect(sentried.carriedBy).toBe(t.id);
    expect(plain.carriedBy).toBe(t.id);
    expect(sentried.orders).toEqual({ kind: 'sentry' });
    expect(plain.orders).toEqual({ kind: 'sentry' });
  });

  it('with sentriedStayAsGarrison, auto-load takes only armies without orders', () => {
    const { s, t, sentried, plain } = cityWithTwoArmies({ sentriedStayAsGarrison: true });
    expect(moveUnit(s, rng, t, 2, [])).toBeNull();
    expect(sentried.carriedBy).toBeNull();
    expect(plain.carriedBy).toBe(t.id);
    expect(plain.orders).toEqual({ kind: 'sentry' });
  });
});

describe('moving through cities', () => {
  function transportAtSeaWithCargo() {
    const s = makeGame(M);
    s.cities[2].owner = 0;
    const t = addUnit(s, 'transport', 0, 3, 2);
    const a = addUnit(s, 'army', 0, 3, 2, { carriedBy: t.id, orders: { kind: 'sentry' } });
    return { s, t, a };
  }

  it('a transport entering a friendly city keeps its cargo aboard', () => {
    const { s, t, a } = transportAtSeaWithCargo();
    expect(moveUnit(s, rng, t, 6, [])).toBeNull();
    expect(a.carriedBy).toBe(t.id);
    expect(a.x).toBe(2);
  });

  it('a hand move into a friendly city sets unloadNextTurn; next own turn start unloads and wakes the cargo', () => {
    const { s, t, a } = transportAtSeaWithCargo();
    const r1 = run(s, { type: 'move', player: 0, unitId: t.id, dir: 6 });
    expect(unitById(r1.state, t.id)!.unloadNextTurn).toBe(true);
    const r2 = run(r1.state, { type: 'endTurn', player: 0 });
    const r3 = run(r2.state, { type: 'endTurn', player: 1 });
    expect(r3.events).toContainEqual({ type: 'cargoUnloaded', transportId: t.id, owner: 0, unitIds: [a.id] });
    const army = unitById(r3.state, a.id)!;
    expect(army.carriedBy).toBeNull();
    expect(army.orders).toBeNull();
    expect(unitById(r3.state, t.id)!.unloadNextTurn).toBe(false);
  });

  it('moving the transport out again before the next turn cancels the unload', () => {
    const { s, t, a } = transportAtSeaWithCargo();
    const r1 = run(s, { type: 'move', player: 0, unitId: t.id, dir: 6 });
    const tt = unitById(r1.state, t.id)!;
    tt.movesLeft = 1;
    const r2 = run(r1.state, { type: 'move', player: 0, unitId: t.id, dir: 2 });
    expect(unitById(r2.state, t.id)!.unloadNextTurn).toBe(false);
    const r3 = run(run(r2.state, { type: 'endTurn', player: 0 }).state, { type: 'endTurn', player: 1 });
    expect(unitById(r3.state, a.id)!.carriedBy).toBe(t.id);
    expect(r3.events.some((e) => e.type === 'cargoUnloaded')).toBe(false);
  });

  it('a hand move cancels a unit\'s orders', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1, { orders: { kind: 'explore' } });
    const r = run(s, { type: 'move', player: 0, unitId: a.id, dir: 2 });
    expect(unitById(r.state, a.id)!.orders).toBeNull();
  });
});

describe('load command', () => {
  function cityWithTransport(armies: number) {
    const s = makeGame(M);
    s.cities[2].owner = 0;
    const t = addUnit(s, 'transport', 0, 2, 2);
    const ids = Array.from({ length: armies }, () => addUnit(s, 'army', 0, 2, 2).id);
    return { s, t, ids };
  }

  it('boards the chosen armies in a city', () => {
    const { s, t, ids } = cityWithTransport(3);
    const r = run(s, { type: 'load', player: 0, transportId: t.id, unitIds: [ids[0], ids[2]] });
    const st = r.state;
    expect(cargoOf(st, unitById(st, t.id)!).map((u) => u.id)).toEqual([ids[0], ids[2]]);
    expect(unitById(st, ids[0])!.orders).toEqual({ kind: 'sentry' });
    expect(unitById(st, ids[1])!.carriedBy).toBeNull();
  });

  it('rejects too many with not enough room', () => {
    const { s, t, ids } = cityWithTransport(7);
    const r = apply(s, { type: 'load', player: 0, transportId: t.id, unitIds: ids });
    expect(r).toEqual({ ok: false, error: 'not enough room' });
  });

  it('rejects outside a city', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 1);
    const a = addUnit(s, 'army', 0, 3, 1);
    expect(apply(s, { type: 'load', player: 0, transportId: t.id, unitIds: [a.id] }).ok).toBe(false);
  });
});

describe('unload command', () => {
  function loaded(inCity: boolean) {
    const s = makeGame(M);
    s.cities[2].owner = 0;
    const [x, y] = inCity ? [2, 2] : [3, 1];
    const t = addUnit(s, 'transport', 0, x, y);
    const a = addUnit(s, 'army', 0, x, y, { carriedBy: t.id, orders: { kind: 'sentry' } });
    return { s, t, a };
  }

  it('at sea wakes the cargo but keeps it aboard', () => {
    const { s, t, a } = loaded(false);
    const r = run(s, { type: 'unload', player: 0, transportId: t.id, unitIds: null });
    const army = unitById(r.state, a.id)!;
    expect(army.orders).toBeNull();
    expect(army.carriedBy).toBe(t.id);
    expect(r.events).toContainEqual({ type: 'cargoUnloaded', transportId: t.id, owner: 0, unitIds: [a.id] });
  });

  it('in a city releases it', () => {
    const { s, t, a } = loaded(true);
    const r = run(s, { type: 'unload', player: 0, transportId: t.id, unitIds: [a.id] });
    const army = unitById(r.state, a.id)!;
    expect(army.carriedBy).toBeNull();
    expect(army.orders).toBeNull();
  });

  it('with no cargo is rejected', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 1);
    expect(apply(s, { type: 'unload', player: 0, transportId: t.id, unitIds: null })).toEqual({
      ok: false,
      error: 'nothing to unload',
    });
  });
});

describe('cargoUnloaded visibility', () => {
  it('cargoUnloaded is visible only to its owner', () => {
    const s = makeGame(M);
    const e: GameEvent = { type: 'cargoUnloaded', transportId: 1, owner: 0, unitIds: [2] };
    expect(eventsFor(s, [e], 0)).toEqual([e]);
    expect(eventsFor(s, [e], 1)).toEqual([]);
  });
});

describe('load clears unloadNextTurn', () => {
  it('loading armies cancels a pending unload', () => {
    const s = makeGame(['*##*', '####', '####']);
    const t = addUnit(s, 'transport', 0, 0, 0, { unloadNextTurn: true });
    const a = addUnit(s, 'army', 0, 0, 0);
    expect(loadUnits(s, t, [a.id])).toBeNull();
    expect(t.unloadNextTurn).toBe(false);
  });
});
