import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { eventsFor } from '../../src/engine/events';
import { chooseHome, executeOrders, wakeSentries } from '../../src/engine/orders';
import { unitById } from '../../src/engine/query';
import type { Command, GameEvent, GameState, Orders, OrdersEndReason } from '../../src/engine/types';
import { addUnit, fixedRng, makeGame } from '../helpers';

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

  it("a goto blocked by an own unit ends 'blocked' the same turn, and never loops", () => {
    const s = game(LAND);
    const a = addUnit(s, 'army', 0, 1, 0, { movesLeft: 0 });
    const r1 = run(s, { type: 'setOrders', player: 0, unitId: a.id, orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(unitById(r1.state, a.id)!.orders).not.toBeNull();
    addUnit(r1.state, 'army', 0, 2, 0);
    const r2 = fullRound(r1.state);
    expect(ended(r2.events)).toEqual([{ type: 'ordersEnded', unitId: a.id, owner: 0, reason: 'blocked' }]);
    const after = unitById(r2.state, a.id)!;
    expect(after.orders).toBeNull();
    expect(after).toMatchObject({ x: 1, movesLeft: 1 });
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

  it('aircraft: patrol/explore rejected', () => {
    const s = game(AIR);
    const f = addUnit(s, 'fighter', 0, 0, 0);
    const msg = 'aircraft cannot patrol or explore yet';
    expect(setOrders(s, f.id, { kind: 'explore' })).toEqual({ ok: false, error: msg });
    expect(setOrders(s, f.id, { kind: 'patrol', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, toB: true })).toEqual({ ok: false, error: msg });
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
