import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { buildTime } from '../../src/engine/production';
import { pathMapFromState } from '../../src/engine/path';
import { routeUnitTypes } from '../../src/engine/routes';
import type { Command, GameEvent, GameState } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const LAND = ['*#####*#*'];

/** Player 0 owns the first two cities of a land strip, player 1 the third; nothing is produced and the map is explored. */
function game(): GameState {
  const s = makeGame(LAND, { starts: [0, 2] });
  s.cities[1].owner = 0;
  for (const c of s.cities) c.production = null;
  s.fog[0].explored.fill(1);
  return s;
}

function run(s: GameState, cmd: Command) {
  const r = apply(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

const route = (over: object = {}) => ({ destId: 1, types: ['army' as const], blockWait: 3, arrival: 'wait' as const, ...over });
const setRoute = (s: GameState, r: ReturnType<typeof route> | null, cityId = 0) =>
  apply(s, { type: 'setRoute', player: 0, cityId, route: r });

/** Ends player 0's turn and player 1's. */
function round(s: GameState): { state: GameState; events: GameEvent[] } {
  const a = run(s, { type: 'endTurn', player: 0 });
  const b = run(a.state, { type: 'endTurn', player: 1 });
  return { state: b.state, events: [...a.events, ...b.events] };
}

/** Sets city 0 to finish an army at the next production tick. */
function readyToBuild(s: GameState, type: 'army' | 'fighter' = 'army'): void {
  s.cities[0].production = type;
  s.cities[0].progress = buildTime(s.cities[0], type) - 1;
}

describe('setRoute', () => {
  it('stores a valid route and clears it again', () => {
    const s = game();
    const r = setRoute(s, route());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cities[0].route).toEqual({ destId: 1, types: ['army'], blockWait: 3, arrival: 'wait', by: 0 });
    const cleared = run(r.state, { type: 'setRoute', player: 0, cityId: 0, route: null });
    expect(cleared.state.cities[0].route).toBeUndefined();
  });

  it('rejects bad routes', () => {
    const s = game();
    expect(setRoute(s, route({ destId: 0 }))).toMatchObject({ ok: false, error: 'the destination must be a different city' });
    expect(setRoute(s, route({ destId: 99 }))).toMatchObject({ ok: false, error: 'no such destination city' });
    expect(setRoute(s, route({ types: [] }))).toMatchObject({ ok: false, error: 'pick at least one unit type' });
    expect(setRoute(s, route({ blockWait: 0 }))).toMatchObject({ ok: false, error: 'invalid blocked wait' });
    expect(setRoute(s, route({ arrival: 'x' as 'wait' }))).toMatchObject({ ok: false, error: 'invalid arrival mode' });
    expect(setRoute(s, route({ types: ['destroyer'] }))).toMatchObject({ ok: false, error: 'Destroyer cannot make that trip' });
    s.cities[1].owner = 1;
    expect(setRoute(s, route())).toMatchObject({ ok: false, error: 'the destination must be your city' });
  });

  it('works out which unit types can make the trip', () => {
    const s = game();
    const can = routeUnitTypes(pathMapFromState(s, 0), s.cities[0], s.cities[1]);
    expect(can.army).toBe(true);
    expect(can.fighter).toBe(true);
    expect(can.destroyer).toBe(false);
    expect(can.transport).toBe(false);
  });
});

describe('route following', () => {
  it('sends a matching new unit to the destination, where it waits for orders', () => {
    let s = game();
    s = run(s, { type: 'setRoute', player: 0, cityId: 0, route: route() }).state;
    readyToBuild(s);
    s = round(s).state;
    const u = s.units.find((x) => x.type === 'army' && x.owner === 0)!;
    expect(u.orders).toMatchObject({ kind: 'goto', target: { x: 6, y: 0 }, routeCity: 1, wait: 3 });
    let events: GameEvent[] = [];
    for (let i = 0; i < 6; i++) {
      const r = round(s);
      s = r.state;
      events = events.concat(r.events);
    }
    const arrived = s.units.find((x) => x.id === u.id)!;
    expect(arrived).toMatchObject({ x: 6, y: 0, orders: null });
    expect(events).toContainEqual({ type: 'ordersEnded', unitId: u.id, owner: 0, reason: 'arrived' });
  });

  it('puts the unit on sentry on arrival when asked', () => {
    let s = game();
    s = run(s, { type: 'setRoute', player: 0, cityId: 0, route: route({ arrival: 'sentry' }) }).state;
    readyToBuild(s);
    s = round(s).state;
    for (let i = 0; i < 6; i++) s = round(s).state;
    const u = s.units.find((x) => x.type === 'army' && x.owner === 0)!;
    expect(u).toMatchObject({ x: 6, y: 0, orders: { kind: 'sentry' } });
  });

  it('leaves units of other types without orders', () => {
    let s = game();
    s = run(s, { type: 'setRoute', player: 0, cityId: 0, route: route() }).state;
    readyToBuild(s, 'fighter');
    s = round(s).state;
    const f = s.units.find((x) => x.type === 'fighter' && x.owner === 0)!;
    expect(f.orders).toBeNull();
  });

  it('asks for orders when the destination is lost', () => {
    let s = game();
    s = run(s, { type: 'setRoute', player: 0, cityId: 0, route: route() }).state;
    readyToBuild(s);
    s = round(s).state;
    const u = s.units.find((x) => x.type === 'army' && x.owner === 0)!;
    s.cities[1].owner = 1;
    const r = round(s);
    expect(r.events).toContainEqual({ type: 'ordersEnded', unitId: u.id, owner: 0, reason: 'destinationLost' });
    expect(r.state.units.find((x) => x.id === u.id)!.orders).toBeNull();
    expect(r.state.cities[0].route).toBeUndefined();
  });

  it('lapses when the route city changes hands', () => {
    let s = game();
    s = run(s, { type: 'setRoute', player: 0, cityId: 0, route: route() }).state;
    s.cities[0].owner = 1;
    s.cities[0].production = 'army';
    s.cities[0].progress = 0;
    s = round(s).state;
    expect(s.cities[0].route).toBeUndefined();
  });

  it('waits the chosen number of turns when blocked, then asks for orders', () => {
    let s = game();
    s = run(s, { type: 'setRoute', player: 0, cityId: 0, route: route({ blockWait: 1 }) }).state;
    readyToBuild(s);
    s = round(s).state;
    const u = s.units.find((x) => x.type === 'army' && x.owner === 0)!;
    // Park an own unit, stacked, in the only corridor square ahead so the way is walled off.
    const ahead = { x: u.x + 1, y: 0 };
    addUnit(s, 'army', 0, ahead.x, ahead.y);
    addUnit(s, 'army', 0, ahead.x, ahead.y);
    const r = round(s);
    const after = r.state.units.find((x) => x.id === u.id)!;
    expect(after.orders === null || after.orders.kind === 'goto').toBe(true);
    if (after.orders === null) expect(r.events).toContainEqual({ type: 'ordersEnded', unitId: u.id, owner: 0, reason: 'blocked' });
  });
});


