import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { eventsFor } from '../../src/engine/events';
import { chooseHome, executeOrders, patrolBase, wakeSentries } from '../../src/engine/orders';
import { findPath, pathMapFromState } from '../../src/engine/path';
import { unitById } from '../../src/engine/query';
import type { Command, GameEvent, GameState, Orders, OrdersEndReason } from '../../src/engine/types';
import { addUnit, fixedRng, makeGame } from '../helpers';
import { chebyshev } from '../../src/engine/map';

/** A quiet game: nothing is produced and player 0 has explored the whole map. */
function game(rows: string[], opts: Parameters<typeof makeGame>[1] = {}): GameState {
  const s = makeGame(rows, opts);
  for (const c of s.cities) c.production = null;
  s.fog[0].explored.fill(1);
  return s;
}

function run(s: GameState, cmd: Command) {
  const r = apply(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const setOrders = (s: GameState, unitId: number, orders: Orders | null) =>
  apply(s, { type: 'setOrders', player: 0, unitId, orders });

/** Ends player 0's turn and player 1's, returning the new state and all events. */
function fullRound(s: GameState): { state: GameState; events: GameEvent[] } {
  const a = run(s, { type: 'endTurn', player: 0 });
  const b = run(a.state, { type: 'endTurn', player: 1 });
  return { state: b.state, events: [...a.events, ...b.events] };
}

const ended = (events: GameEvent[]) =>
  events.filter((e): e is Extract<GameEvent, { type: 'ordersEnded' }> => e.type === 'ordersEnded');

const LAND = ['*#####*'];
const FIELD = ['*######*', '########', '########'];

describe('goto', () => {
  it('goto moves at once with remaining moves and continues next turn', () => {
    const s = game(LAND);
    const a = addUnit(s, 'army', 0, 1, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(unitById(r.state, a.id)).toMatchObject({ x: 2, movesLeft: 0, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(r.events.some((e) => e.type === 'unitMoved')).toBe(true);
    const next = fullRound(r.state);
    expect(unitById(next.state, a.id)).toMatchObject({ x: 3, movesLeft: 0 });
  });

  it("goto ends with 'arrived' on reaching the target", () => {
    const s = game(LAND);
    const a = addUnit(s, 'army', 0, 1, 0);
    const r1 = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 3, y: 0 } } });
    expect(ended(r1.events)).toHaveLength(0);
    const r2 = fullRound(r1.state);
    expect(ended(r2.events)).toEqual([{ type: 'ordersEnded', unitId: a.id, owner: 0, reason: 'arrived' }]);
    expect(unitById(r2.state, a.id)).toMatchObject({ x: 3, orders: null });
  });

  const SEA = ['*...*.*'];
  function transportGame(x: number) {
    const s = game(SEA, { starts: [0, 2] });
    s.cities[1].owner = 0;
    const t = addUnit(s, 'transport', 0, x, 0);
    const cargo = [1, 2].map(() => addUnit(s, 'army', 0, x, 0, { carriedBy: t.id, orders: { kind: 'sentry' } }));
    return { s, t, cargo };
  }

  it('a goto transport arriving at its target city unloads its cargo that turn', () => {
    const { s, t, cargo } = transportGame(1);
    const r1 = run(s, { type: 'setOrders', player: 0, unitId: t.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(unitById(r1.state, t.id)).toMatchObject({ x: 3, movesLeft: 0 });
    expect(cargo.every((c) => unitById(r1.state, c.id)!.carriedBy === t.id)).toBe(true);
    const r2 = fullRound(r1.state);
    expect(ended(r2.events).map((e) => e.reason)).toEqual(['arrived']);
    expect(r2.events.some((e) => e.type === 'cargoUnloaded')).toBe(true);
    for (const c of cargo) expect(unitById(r2.state, c.id)).toMatchObject({ carriedBy: null, orders: null, x: 4 });
  });

  it('a goto transport that arrives with exactly enough moves still unloads', () => {
    const { s, t, cargo } = transportGame(2);
    const r = run(s, { type: 'setOrders', player: 0, unitId: t.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(unitById(r.state, t.id)).toMatchObject({ x: 4, movesLeft: 0, orders: null });
    expect(ended(r.events).map((e) => e.reason)).toEqual(['arrived']);
    for (const c of cargo) expect(unitById(r.state, c.id)).toMatchObject({ carriedBy: null, orders: null });
  });

  it('a goto transport passing through a friendly city keeps cargo aboard and asleep', () => {
    const s = game(['*..*..*'], { starts: [0, 2] });
    s.cities[1].owner = 0;
    const t = addUnit(s, 'transport', 0, 2, 0);
    const cargo = addUnit(s, 'army', 0, 2, 0, { carriedBy: t.id, orders: { kind: 'sentry' } });
    const r = run(s, { type: 'setOrders', player: 0, unitId: t.id, orders: { kind: 'goto', target: { x: 5, y: 0 } } });
    expect(unitById(r.state, t.id)).toMatchObject({ x: 4, movesLeft: 0 });
    expect(unitById(r.state, cargo.id)).toMatchObject({ carriedBy: t.id, orders: { kind: 'sentry' } });
    expect(r.events.some((e) => e.type === 'cargoUnloaded')).toBe(false);
  });

  it('goto rejected for an unexplored target, an unreachable target, or the current square', () => {
    const s = game(FIELD);
    s.fog[0].explored[2 * 8 + 7] = 0;
    const a = addUnit(s, 'army', 0, 2, 1);
    const goto = (x: number, y: number) => setOrders(s, a.id, { kind: 'goto', target: { x, y } });
    expect(goto(7, 2)).toEqual({ ok: false, error: 'target is not an explored square' });
    expect(goto(2, 1)).toEqual({ ok: false, error: 'already there' });
    expect(goto(99, 0)).toMatchObject({ ok: false });
    const w = game(['*#.#*']);
    const b = addUnit(w, 'army', 0, 1, 0);
    expect(setOrders(w, b.id, { kind: 'goto', target: { x: 3, y: 0 } })).toEqual({ ok: false, error: 'no known path' });
  });
});

describe('patrol and explore', () => {
  it('patrol reverses at each end and uses all moves', () => {
    const s = game(['*.......*']);
    const d = addUnit(s, 'destroyer', 0, 1, 0);
    const patrol: Orders = { kind: 'patrol', a: { x: 1, y: 0 }, b: { x: 3, y: 0 }, toB: true };
    const r1 = run(s, { type: 'setOrders', player: 0, unitId: d.id, orders: patrol });
    expect(unitById(r1.state, d.id)).toMatchObject({ x: 2, movesLeft: 0, orders: { kind: 'patrol', toB: false } });
    const r2 = fullRound(r1.state);
    expect(unitById(r2.state, d.id)).toMatchObject({ x: 3, movesLeft: 0, orders: { kind: 'patrol', toB: true } });
    expect(ended(r2.events)).toHaveLength(0);
  });

  it('patrol with a === b is rejected', () => {
    const s = game(['*.......*']);
    const d = addUnit(s, 'destroyer', 0, 1, 0);
    const p = { x: 3, y: 0 };
    expect(setOrders(s, d.id, { kind: 'patrol', a: p, b: { ...p }, toB: true }).ok).toBe(false);
  });

  it("explore steps toward unexplored land and ends with 'nothingToExplore' on a fully explored island", () => {
    const s = makeGame(FIELD);
    for (const c of s.cities) c.production = null;
    const a = addUnit(s, 'army', 0, 1, 1);
    const r0 = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'explore' } });
    expect(unitById(r0.state, a.id)).toMatchObject({ x: 1, y: 0, orders: { kind: 'explore' } });
    let state = r0.state;
    let reason: OrdersEndReason | null = null;
    for (let i = 0; i < 60 && reason === null; i++) {
      const round = fullRound(state);
      state = round.state;
      reason = ended(round.events)[0]?.reason ?? null;
      if (reason === 'cityFound') {
        // Finding the enemy city stops the explorer; carry on exploring from next to it.
        reason = null;
        state = run(state, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'explore' } }).state;
      }
    }
    expect(reason).toBe('nothingToExplore');
    expect(unitById(state, a.id)!.orders).toBeNull();
    expect(state.fog[0].explored.every((v) => v === 1)).toBe(true);
  });
});

describe('interruptions', () => {
  it("orders stop with 'enemySighted' when an enemy becomes adjacent", () => {
    const s = game(FIELD);
    const a = addUnit(s, 'army', 0, 1, 1);
    addUnit(s, 'army', 1, 5, 1);
    const r1 = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 6, y: 1 } } });
    expect(ended(r1.events)).toHaveLength(0);
    const r2 = fullRound(r1.state);
    const r3 = fullRound(r2.state);
    const all = [...r2.events, ...r3.events];
    expect(ended(all)).toEqual([{ type: 'ordersEnded', unitId: a.id, owner: 0, reason: 'enemySighted' }]);
    expect(unitById(r3.state, a.id)).toMatchObject({ x: 4, orders: null });
  });

  it("a sentry given next to an enemy holds until the owner's next turn start, then wakes", () => {
    const s = game(FIELD);
    const a = addUnit(s, 'army', 0, 2, 1);
    addUnit(s, 'army', 1, 3, 1);
    const r1 = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'sentry' } });
    expect(ended(r1.events)).toHaveLength(0);
    expect(unitById(r1.state, a.id)!.orders).toEqual({ kind: 'sentry' });
    const r2 = fullRound(r1.state);
    expect(ended(r2.events)).toEqual([{ type: 'ordersEnded', unitId: a.id, owner: 0, reason: 'enemySighted' }]);
    expect(unitById(r2.state, a.id)!.orders).toBeNull();
  });

  it("orders never attack: a goto whose next step holds an enemy ends 'blocked'", () => {
    const s = game(LAND);
    const a = addUnit(s, 'army', 0, 1, 0);
    const enemy = addUnit(s, 'army', 1, 2, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(ended(r.events).map((e) => e.reason)).toEqual(['blocked']);
    expect(r.events.some((e) => e.type === 'combat')).toBe(false);
    expect(unitById(r.state, a.id)).toMatchObject({ x: 1, movesLeft: 1, orders: null });
    expect(unitById(r.state, enemy.id)).toBeDefined();
  });

  it('sentried cargo is not woken by an adjacent enemy', () => {
    const s = game(['*.....*']);
    const t = addUnit(s, 'transport', 0, 3, 0);
    const cargo = addUnit(s, 'army', 0, 3, 0, { carriedBy: t.id, orders: { kind: 'sentry' } });
    addUnit(s, 'destroyer', 1, 4, 0);
    const events: GameEvent[] = [];
    wakeSentries(s, 0, events);
    expect(events).toEqual([]);
    expect(cargo.orders).toEqual({ kind: 'sentry' });
  });
});

describe('aircraft', () => {
  const AIR = ['*' + '.'.repeat(30) + '*'];

  it("aircraft: goto beyond fuel rejected 'out of range'", () => {
    const s = game(AIR);
    const f = addUnit(s, 'fighter', 0, 0, 0);
    expect(setOrders(s, f.id, { kind: 'goto', target: { x: 25, y: 0 } })).toEqual({ ok: false, error: 'out of range' });
    expect(setOrders(s, f.id, { kind: 'goto', target: { x: 10, y: 0 } }).ok).toBe(true);
  });

  it('aircraft: explore rejected', () => {
    const s = game(AIR);
    const f = addUnit(s, 'fighter', 0, 0, 0);
    expect(setOrders(s, f.id, { kind: 'explore' })).toEqual({ ok: false, error: 'aircraft cannot explore yet' });
  });

  describe('patrol', () => {
    const patrol = (b: number, a = 0): Orders => ({ kind: 'patrol', a: { x: a, y: 0 }, b: { x: b, y: 0 }, toB: true });

    it('is accepted up to half the range from a city and rejected beyond', () => {
      const s = game(AIR);
      const f = addUnit(s, 'fighter', 0, 0, 0);
      expect(setOrders(s, f.id, patrol(5)).ok).toBe(true);
      expect(setOrders(s, f.id, patrol(10)).ok).toBe(true);
      expect(setOrders(s, f.id, patrol(11))).toEqual({ ok: false, error: 'out of range' });
    });

    it('needs a city or carrier at one end', () => {
      const s = game(AIR);
      const f = addUnit(s, 'fighter', 0, 0, 0);
      expect(setOrders(s, f.id, patrol(8, 3))).toEqual({
        ok: false, error: 'patrol must start or end at a city or carrier',
      });
    });

    it('can be based on an own carrier with room', () => {
      const s = game(AIR);
      const f = addUnit(s, 'fighter', 0, 0, 0);
      addUnit(s, 'carrier', 0, 5, 0);
      expect(setOrders(s, f.id, patrol(10, 5)).ok).toBe(true);
    });

    it('patrolBase prefers a, then b, and skips a full carrier unless aboard', () => {
      const s = game(AIR);
      const f = addUnit(s, 'fighter', 0, 0, 0);
      const carrier = addUnit(s, 'carrier', 0, 5, 0);
      const o = { a: { x: 0, y: 0 }, b: { x: 5, y: 0 } };
      expect(patrolBase(s, f, o)).toEqual({ x: 0, y: 0 });
      expect(patrolBase(s, f, { a: o.b, b: o.a })).toEqual({ x: 5, y: 0 });
      expect(patrolBase(s, f, { a: { x: 3, y: 0 }, b: { x: 8, y: 0 } })).toBeNull();
      for (let i = 0; i < 8; i++) addUnit(s, 'fighter', 0, 5, 0, { carriedBy: carrier.id });
      expect(patrolBase(s, f, { a: { x: 5, y: 0 }, b: { x: 9, y: 0 } })).toBeNull();
      const aboard = s.units.find((u) => u.carriedBy === carrier.id)!;
      expect(patrolBase(s, aboard, { a: { x: 5, y: 0 }, b: { x: 9, y: 0 } })).toEqual({ x: 5, y: 0 });
    });

    it('flies out, flips, returns, refuels and keeps patrolling', () => {
      let s = game(AIR);
      const f = addUnit(s, 'fighter', 0, 0, 0);
      s = run(s, { type: 'setOrders', player: 0, unitId: f.id, orders: patrol(8) }).state;
      let farthest = 0;
      let refueled = false;
      for (let i = 0; i < 6 && !refueled; i++) {
        s = fullRound(s).state;
        const u = unitById(s, f.id)!;
        farthest = Math.max(farthest, u.x);
        if (u.x === 0 && u.fuel === 20 && i > 0) refueled = true;
      }
      expect(farthest).toBeGreaterThanOrEqual(6);
      expect(refueled).toBe(true);
      expect(unitById(s, f.id)!.orders).toMatchObject({ kind: 'patrol' });
    });

    it('a carrier-based patrol keeps its orders and refuels after landing on the carrier', () => {
      let s = game(AIR);
      const carrier = addUnit(s, 'carrier', 0, 5, 0);
      const f = addUnit(s, 'fighter', 0, 5, 0, { carriedBy: carrier.id });
      const first = run(s, { type: 'setOrders', player: 0, unitId: f.id, orders: patrol(10, 5) });
      const round = fullRound(first.state);
      s = round.state;
      const flights = [...first.events, ...round.events].filter((e) => e.type === 'unitMoved').length;
      expect(flights).toBeGreaterThanOrEqual(10);
      const u = unitById(s, f.id)!;
      expect(u).toMatchObject({ x: 5, carriedBy: carrier.id, fuel: 20 });
      expect(u.orders).toMatchObject({ kind: 'patrol' });
    });

    it('falls back to a city with reason returning when the base is gone', () => {
      const s = game(AIR);
      const f = addUnit(s, 'fighter', 0, 8, 0, { fuel: 12 });
      f.orders = { kind: 'patrol', a: { x: 5, y: 0 }, b: { x: 10, y: 0 }, toB: false };
      const events: GameEvent[] = [];
      executeOrders(s, fixedRng(0.5), f, events);
      expect(f.orders).toEqual({ kind: 'goto', target: { x: 0, y: 0 } });
      expect(ended(events).map((e) => e.reason)).toEqual(['returning']);
    });

    it('ends lowFuel when the base is gone and no city is in reach', () => {
      const s = game(AIR);
      const f = addUnit(s, 'fighter', 0, 8, 0, { fuel: 3 });
      f.orders = { kind: 'patrol', a: { x: 5, y: 0 }, b: { x: 10, y: 0 }, toB: false };
      const events: GameEvent[] = [];
      executeOrders(s, fixedRng(0.5), f, events);
      expect(f.orders).toBeNull();
      expect(ended(events).map((e) => e.reason)).toEqual(['lowFuel']);
    });
  });

  it('aircraft: sentry only at a refuel point', () => {
    const s = game(AIR);
    const home = addUnit(s, 'fighter', 0, 0, 0);
    const away = addUnit(s, 'fighter', 0, 5, 0);
    expect(setOrders(s, home.id, { kind: 'sentry' }).ok).toBe(true);
    expect(setOrders(s, away.id, { kind: 'sentry' })).toEqual({
      ok: false, error: 'aircraft can only sentry in a city or on a carrier',
    });
  });
});

describe('go home', () => {
  const ROW = ['*###*###*'];

  function homeGame() {
    const s = game(ROW, { starts: [0, 2] });
    s.cities[1].owner = 0;
    return s;
  }

  it('goHome picks the nearest own city by path length, lowest id on ties', () => {
    const s = homeGame();
    const tie = addUnit(s, 'army', 0, 2, 0);
    expect(chooseHome(s, tie)).toMatchObject({ city: { id: 0 }, steps: 2 });
    const nearer = addUnit(s, 'army', 0, 3, 0);
    expect(chooseHome(s, nearer)).toMatchObject({ city: { id: 1 }, steps: 1 });
    const r = run(s, { type: 'goHome', player: 0, unitId: nearer.id });
    expect(unitById(r.state, nearer.id)).toMatchObject({ x: 4, orders: null });
    expect(ended(r.events).map((e) => e.reason)).toEqual(['arrived']);
  });

  it('goHome for ships only considers coastal cities', () => {
    const s = game(['......', '.###..', '.#**..', '.###..', '......', '*.....'], { starts: [0, 2] });
    s.cities[1].owner = 0;
    expect(s.cities.map((c) => [c.x, c.y])).toEqual([[2, 2], [3, 2], [0, 5]]);
    // City 0 is landlocked and lower in id, and a ship can step into it through city 1, but ships skip it.
    const d = addUnit(s, 'destroyer', 0, 4, 2);
    expect(chooseHome(s, d)).toMatchObject({ city: { id: 1 }, steps: 1 });
    const a = addUnit(s, 'army', 0, 1, 2);
    expect(chooseHome(s, a)).toMatchObject({ city: { id: 0 }, steps: 1 });
  });

  it("goHome in an own city is rejected 'already home'", () => {
    const s = homeGame();
    const a = addUnit(s, 'army', 0, 4, 0);
    expect(apply(s, { type: 'goHome', player: 0, unitId: a.id })).toEqual({ ok: false, error: 'already home' });
  });

  it("goHome with no reachable city is rejected 'no reachable city'", () => {
    const s = game(['*#.#*'], { starts: [0, 1] });
    const a = addUnit(s, 'army', 0, 3, 0);
    expect(apply(s, { type: 'goHome', player: 0, unitId: a.id })).toEqual({ ok: false, error: 'no reachable city' });
  });
});

describe('other', () => {
  it('setOrders null clears orders', () => {
    const s = game(LAND);
    const a = addUnit(s, 'army', 0, 1, 0, { orders: { kind: 'sentry' } });
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: null });
    expect(unitById(r.state, a.id)!.orders).toBeNull();
  });

  it('ordersEnded is visible only to its owner', () => {
    const s = game(LAND);
    const a = addUnit(s, 'army', 0, 1, 0);
    addUnit(s, 'army', 1, 2, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(ended(eventsFor(r.state, r.events, 0))).toHaveLength(1);
    expect(ended(eventsFor(r.state, r.events, 1))).toHaveLength(0);
  });
});

describe('go-to boarding and aircraft range', () => {
  it('an army going to a transport at sea ends aboard and sentried', () => {
    const s = game(['*##.#*']);
    const t = addUnit(s, 'transport', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 2, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 3, y: 0 } } });
    expect(unitById(r.state, a.id)).toMatchObject({ carriedBy: t.id, orders: { kind: 'sentry' } });
    expect(ended(r.events)).toEqual([{ type: 'ordersEnded', unitId: a.id, owner: 0, reason: 'arrived' }]);
  });

  it('a fighter going to a carrier ends aboard and sentried', () => {
    const s = game(['*..*']);
    const c = addUnit(s, 'carrier', 0, 2, 0);
    const f = addUnit(s, 'fighter', 0, 0, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: f.id, orders: { kind: 'goto', target: { x: 2, y: 0 } } });
    expect(unitById(r.state, f.id)).toMatchObject({ carriedBy: c.id, orders: { kind: 'sentry' } });
  });

  it('rejects an aircraft go-to to a plain square at exactly its fuel distance', () => {
    const s = game(['*###*']);
    const f = addUnit(s, 'fighter', 0, 0, 0, { fuel: 3 });
    const r = setOrders(s, f.id, { kind: 'goto', target: { x: 3, y: 0 } });
    expect(r).toMatchObject({ ok: false, error: 'out of range' });
    expect(setOrders(s, f.id, { kind: 'goto', target: { x: 2, y: 0 } }).ok).toBe(true);
  });

  it('accepts an aircraft go-to to an own city at exactly its fuel distance', () => {
    const s = game(['*##*#', '#####']);
    s.cities[1].owner = 0;
    const f = addUnit(s, 'fighter', 0, 0, 0, { fuel: 3 });
    const r = run(s, { type: 'setOrders', player: 0, unitId: f.id, orders: { kind: 'goto', target: { x: 3, y: 0 } } });
    expect(unitById(r.state, f.id)).toMatchObject({ x: 3, y: 0, orders: null });
    expect(unitById(fullRound(r.state).state, f.id)!.fuel).toBe(20);
  });

  it('ends a running aircraft go-to with lowFuel when fuel no longer reaches', () => {
    const s = game(['*###*']);
    const f = addUnit(s, 'fighter', 0, 0, 0, { fuel: 3, orders: { kind: 'goto', target: { x: 3, y: 0 } } });
    const events: GameEvent[] = [];
    executeOrders(s, fixedRng(0.5), f, events);
    expect(ended(events)).toEqual([{ type: 'ordersEnded', unitId: f.id, owner: 0, reason: 'lowFuel' }]);
    expect(unitById(s, f.id)).toMatchObject({ x: 0, orders: null });
  });
});

describe('own units and waiting orders', () => {
  const unexplore = (s: GameState, xs: number[], h: number) => {
    for (const x of xs) for (let y = 0; y < h; y++) s.fog[0].explored[y * s.width + x] = 0;
  };
  /** A 1-wide water bay with an own destroyer plugging it; the frontier lies beyond the plug. */
  function bay() {
    const s = game(['#######', '*.....*', '#######']);
    unexplore(s, [5, 6], 3);
    const d = addUnit(s, 'destroyer', 0, 1, 1);
    const plug = addUnit(s, 'destroyer', 0, 3, 1);
    return { s, d, plug };
  }
  const exploreCmd = (s: GameState, id: number) => run(s, { type: 'setOrders', player: 0, unitId: id, orders: { kind: 'explore' } });

  it('explore behind an own unit in a 1-wide bay waits instead of ending with nothingToExplore', () => {
    const { s, d } = bay();
    const r0 = exploreCmd(s, d.id);
    expect(ended(r0.events)).toHaveLength(0);
    expect(unitById(r0.state, d.id)).toMatchObject({ x: 2, orders: { kind: 'explore' }, blockedTurns: 0 });
    const r1 = fullRound(r0.state);
    expect(ended(r1.events)).toHaveLength(0);
    expect(unitById(r1.state, d.id)).toMatchObject({ x: 2, orders: { kind: 'explore' }, blockedTurns: 1 });
  });

  it("a blocked order waits two turn starts, then ends 'blocked' on the third", () => {
    const { s, d } = bay();
    let state = exploreCmd(s, d.id).state;
    for (const n of [1, 2]) {
      const r = fullRound(state);
      state = r.state;
      expect(ended(r.events)).toHaveLength(0);
      expect(unitById(state, d.id)).toMatchObject({ orders: { kind: 'explore' }, blockedTurns: n });
    }
    const r3 = fullRound(state);
    expect(ended(r3.events)).toEqual([{ type: 'ordersEnded', unitId: d.id, owner: 0, reason: 'blocked' }]);
    expect(unitById(r3.state, d.id)).toMatchObject({ orders: null, blockedTurns: 0 });
  });

  it('a successful step resets blockedTurns, and setOrders resets it', () => {
    const { s, d, plug } = bay();
    let state = exploreCmd(s, d.id).state;
    state = fullRound(state).state;
    expect(unitById(state, d.id)!.blockedTurns).toBe(1);
    // The plug leaves: the next turn start steps and clears the counter.
    state.units = state.units.filter((u) => u.id !== plug.id);
    const r = fullRound(state);
    expect(unitById(r.state, d.id)).toMatchObject({ blockedTurns: 0 });
    expect(unitById(r.state, d.id)!.x).toBeGreaterThan(2);

    const again = bay();
    let st = exploreCmd(again.s, again.d.id).state;
    st = fullRound(st).state;
    expect(unitById(st, again.d.id)!.blockedTurns).toBe(1);
    const cleared = run(st, { type: 'setOrders', player: 0, unitId: again.d.id, orders: null });
    expect(unitById(cleared.state, again.d.id)!.blockedTurns).toBe(0);
    const reset = fullRound(cleared.state);
    const regiven = run(reset.state, { type: 'setOrders', player: 0, unitId: again.d.id, orders: { kind: 'explore' } });
    expect(unitById(regiven.state, again.d.id)!.blockedTurns).toBe(0);
    const waited = fullRound(regiven.state);
    expect(unitById(waited.state, again.d.id)!.blockedTurns).toBe(1);
    const resetAgain = run(waited.state, { type: 'setOrders', player: 0, unitId: again.d.id, orders: { kind: 'sentry' } });
    expect(unitById(resetAgain.state, again.d.id)!.blockedTurns).toBe(0);
  });

  it('a new order blocked by an own unit is kept and does not count a blocked turn', () => {
    const s = game(['*#####*']);
    const a = addUnit(s, 'army', 0, 1, 0);
    addUnit(s, 'army', 0, 2, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 5, y: 0 } } });
    expect(ended(r.events)).toHaveLength(0);
    expect(unitById(r.state, a.id)).toMatchObject({ x: 1, blockedTurns: 0, orders: { kind: 'goto' } });
  });

  it('a goto steps around an own unit on the direct next square and arrives', () => {
    const s = game(['*######*', '########', '########']);
    const a = addUnit(s, 'army', 0, 1, 1);
    const target = { x: 6, y: 1 };
    const direct = findPath(pathMapFromState(s, 0), a, target)!;
    const blocker = addUnit(s, 'army', 0, direct[0].x, direct[0].y);
    let state = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target } }).state;
    expect(unitById(state, a.id)).toMatchObject({ movesLeft: 0, blockedTurns: 0, orders: { kind: 'goto' } });
    const first = unitById(state, a.id)!;
    expect([first.x, first.y]).not.toEqual([1, 1]);
    expect([first.x, first.y]).not.toEqual([blocker.x, blocker.y]);
    let reason: OrdersEndReason | null = null;
    for (let i = 0; i < 10 && reason === null; i++) {
      const round = fullRound(state);
      state = round.state;
      reason = ended(round.events)[0]?.reason ?? null;
    }
    expect(reason).toBe('arrived');
    expect(unitById(state, a.id)).toMatchObject({ x: 6, y: 1 });
  });

  it("a goto whose only route holds a visible enemy ends 'blocked' at once", () => {
    const s = game(['*#####*']);
    const a = addUnit(s, 'army', 0, 1, 0);
    addUnit(s, 'army', 1, 2, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 5, y: 0 } } });
    expect(ended(r.events).map((e) => e.reason)).toEqual(['blocked']);
    expect(unitById(r.state, a.id)).toMatchObject({ orders: null, blockedTurns: 0 });
  });

  it('an own unit in a corridor leaves the order waiting at the next turn start (counter 1)', () => {
    const s = game(['*#####*']);
    const a = addUnit(s, 'army', 0, 1, 0, { movesLeft: 0 });
    const r1 = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    addUnit(r1.state, 'army', 0, 2, 0);
    const r2 = fullRound(r1.state);
    expect(ended(r2.events)).toHaveLength(0);
    expect(unitById(r2.state, a.id)).toMatchObject({ x: 1, blockedTurns: 1, orders: { kind: 'goto' } });
  });
});

describe('explore frontier', () => {
  it('skips a frontier square holding an own army and explores the next-nearest one', () => {
    const s = game(['*#######', '#######*']);
    for (let y = 0; y < 2; y++) for (let x = 5; x < 8; x++) s.fog[0].explored[y * 8 + x] = 0;
    const a = addUnit(s, 'army', 0, 1, 0);
    addUnit(s, 'army', 0, 4, 0);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'explore' } });
    expect(ended(r.events)).toHaveLength(0);
    expect(unitById(r.state, a.id)).toMatchObject({ x: 2, orders: { kind: 'explore' } });
  });
});

describe('explore stops at cities', () => {
  const MAP = ['*####*#####', '###########', '##########*'];
  const cityGame = () => {
    const s = makeGame(MAP, { starts: [0, 2] });
    for (const c of s.cities) c.production = null;
    return s;
  };

  it("explore ends with 'cityFound' on stepping next to a neutral city that was not adjacent before", () => {
    const s = cityGame();
    const a = addUnit(s, 'army', 0, 0, 0);
    let state = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'explore' } }).state;
    let reason: OrdersEndReason | null = null;
    for (let i = 0; i < 40 && reason === null; i++) {
      const round = fullRound(state);
      state = round.state;
      reason = ended(round.events)[0]?.reason ?? null;
    }
    expect(reason).toBe('cityFound');
    const u = unitById(state, a.id)!;
    expect(u.orders).toBeNull();
    expect(chebyshev(state, u, { x: 5, y: 0 })).toBe(1);
  });

  it('starting Explore while already next to the city does not stop for that city', () => {
    const s = cityGame();
    s.fog[0].explored.fill(0);
    for (let x = 3; x <= 6; x++) for (let y = 0; y < 3; y++) s.fog[0].explored[y * s.width + x] = 1;
    s.fog[0].knownCityOwner[1] = null;
    const a = addUnit(s, 'army', 0, 4, 1);
    const r = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'explore' } });
    expect(ended(r.events)).toHaveLength(0);
    expect(unitById(r.state, a.id)!.orders).toEqual({ kind: 'explore' });
  });

  it('an own city never triggers cityFound', () => {
    const s = cityGame();
    s.cities[1].owner = 0;
    s.fog[0].knownCityOwner[1] = 0;
    const a = addUnit(s, 'army', 0, 0, 0);
    let state = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'explore' } }).state;
    const reasons: OrdersEndReason[] = [];
    for (let i = 0; i < 40 && reasons.length === 0; i++) {
      const round = fullRound(state);
      state = round.state;
      reasons.push(...ended(round.events).map((e) => e.reason));
    }
    // Only the far enemy city at (10,2) can stop it.
    expect(reasons).toEqual(['cityFound']);
    expect(chebyshev(state, unitById(state, a.id)!, { x: 10, y: 2 })).toBe(1);
  });

  it('a goto passing next to a neutral city does not stop', () => {
    const s = cityGame();
    s.fog[0].explored.fill(1);
    s.fog[0].knownCityOwner[1] = null;
    const a = addUnit(s, 'army', 0, 2, 1);
    let state = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 8, y: 1 } } }).state;
    const reasons: OrdersEndReason[] = [];
    for (let i = 0; i < 12 && reasons.length === 0; i++) {
      const round = fullRound(state);
      state = round.state;
      reasons.push(...ended(round.events).map((e) => e.reason));
    }
    expect(reasons).toEqual(['arrived']);
  });
});

describe('ordersEnded is logged once', () => {
  it('a destroyer exploring a bay that ends nothingToExplore produces exactly one ordersEnded across a turn', () => {
    const s = game(['#####', '*...*', '#####']);
    for (const c of s.cities) c.production = null;
    s.fog[0].explored.fill(0);
    for (const x of [0, 1, 2]) for (let y = 0; y < 3; y++) s.fog[0].explored[y * 5 + x] = 1;
    const d = addUnit(s, 'destroyer', 0, 1, 1);
    const first = run(s, { type: 'setOrders', player: 0, unitId: d.id, orders: { kind: 'explore' } });
    let state = first.state;
    const events: GameEvent[] = [...first.events];
    for (let i = 0; i < 6; i++) {
      for (const pid of [0, 1] as const) {
        const r = run(state, { type: 'endTurn', player: pid });
        state = r.state;
        events.push(...r.events);
      }
    }
    expect(ended(events).filter((e) => e.unitId === d.id)).toHaveLength(1);
  });
});
