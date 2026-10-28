import { describe, expect, it } from 'vitest';
import { getPlayerView } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { newMemo, nextAction, portCity, wantedProduction } from '../../src/ai/basic';
import { tuningFor } from '../../src/ai/difficulty';
import { addUnit, makeGame } from '../helpers';

/** Player 1 (the AI, on Hard by default) plays; the whole map is explored. Player 0 owns the first city on the row. */
function game(rows: string[], opts: Parameters<typeof makeGame>[1] = {}): GameState {
  const s = makeGame(rows, { rules: { advancedUnits: true }, ...opts });
  s.currentPlayer = 1;
  for (const c of s.cities) c.production = c.owner === null ? null : 'army';
  s.fog[1].explored.fill(1);
  for (const c of s.cities) if (c.owner !== null) s.fog[1].knownCityOwner[c.id] = c.owner;
  return s;
}
const view = (s: GameState) => getPlayerView(s, 1);
/** Sets each own city to build what the Hard AI wants, so the next command is about units. */
function settle(s: GameState): void {
  const v = view(s);
  const port = portCity(v);
  for (const c of s.cities) if (c.owner === 1) c.production = wantedProduction(view(s), view(s).myCities.find((x) => x.id === c.id)!, port, tuningFor('hard'));
}
const next = (s: GameState, level: 'normal' | 'hard' = 'hard') => { settle(s); return nextAction(view(s), newMemo(level)); };

// City 0 (x=0) is player 0's, the last city is player 1's.
const ROW = ['*#######*'];

describe('Hard AI bombers (Advanced units rule)', () => {
  it('a bomber flies to the square beside the nearest enemy city', () => {
    const s = game(ROW);
    addUnit(s, 'bomber', 1, 8, 0);
    expect(next(s)).toEqual({ type: 'setOrders', unitId: s.units[0].id, orders: { kind: 'goto', target: { x: 1, y: 0 } } });
  });

  it('bombs the city once from beside it, then heads home', () => {
    const s = game(ROW);
    const bomber = addUnit(s, 'bomber', 1, 1, 0);
    const memo = newMemo('hard');
    settle(s);
    expect(nextAction(view(s), memo)).toEqual({ type: 'move', unitId: bomber.id, dir: 6 });
    expect(nextAction(view(s), memo)).toEqual({ type: 'goHome', unitId: bomber.id });
  });

  it('stays home when the city is out of reach with fuel to return, or when the rule is off, or below Hard', () => {
    const far = game(['*' + '#'.repeat(40) + '*']);
    addUnit(far, 'bomber', 1, 41, 0);
    expect(next(far)).toBeNull();
    const off = game(ROW, { rules: { advancedUnits: false } });
    addUnit(off, 'bomber', 1, 8, 0);
    expect(next(off)).toBeNull();
    const normal = game(ROW);
    addUnit(normal, 'bomber', 1, 8, 0);
    expect(next(normal, 'normal')).toBeNull();
  });

  it('a bomber low on fuel in the open goes home instead of attacking', () => {
    const s = game(ROW);
    addUnit(s, 'bomber', 1, 5, 0, { fuel: 7 });
    expect(next(s)).toMatchObject({ type: 'goHome' });
  });

  it('a hurt bomber repairs in its city', () => {
    const s = game(ROW);
    const bomber = addUnit(s, 'bomber', 1, 8, 0, { damage: 1 });
    expect(next(s)).toEqual({ type: 'setOrders', unitId: bomber.id, orders: { kind: 'repair' } });
  });

  it('with a bomber of its own the second non-port city builds bombers, from turn 25 with four cities', () => {
    const s = game(['*#*#*#*#*', '.........']);
    for (const c of s.cities) c.owner = 1;
    s.turn = 30;
    const v = view(s);
    const byId = [...v.myCities].sort((a, b) => a.id - b.id);
    const kinds = byId.map((c) => wantedProduction(v, c, null, tuningFor('hard')));
    expect(kinds.filter((k) => k === 'bomber')).toHaveLength(1);
    expect(wantedProduction({ ...v, turn: 10 }, byId[1], null, tuningFor('hard'))).not.toBe('bomber');
    expect(wantedProduction({ ...v, rules: { ...v.rules, advancedUnits: false } }, byId[1], null, tuningFor('hard'))).not.toBe('bomber');
    expect(wantedProduction(v, byId[1], null, tuningFor('normal'))).not.toBe('bomber');
  });
});

describe('Hard AI airbases (Advanced units rule)', () => {
  it('an idle army on open land a few squares from its city turns itself into an Airbase once it has a bomber', () => {
    const s = game(['*#########*', '...........']);
    s.cities[0].owner = 1;
    s.cities[1].owner = 0;
    s.turn = 40;
    addUnit(s, 'bomber', 1, 0, 0);
    for (let i = 0; i < 3; i++) addUnit(s, 'army', 1, 0, 0, { orders: { kind: 'sentry' } });
    const army = addUnit(s, 'army', 1, 4, 0);
    expect(next(s)).toEqual({ type: 'buildAirbase', unitId: army.id });
  });

  it('does nothing of the kind without a bomber, below turn 30, or when the rule is off', () => {
    const base = (mutate: (s: GameState) => void) => {
      const s = game(['*#########*']);
      s.cities[0].owner = 1;
      s.cities[1].owner = 0;
      s.turn = 40;
      addUnit(s, 'bomber', 1, 0, 0, { orders: { kind: 'sentry' } });
      for (let i = 0; i < 3; i++) addUnit(s, 'army', 1, 0, 0, { orders: { kind: 'sentry' } });
      addUnit(s, 'army', 1, 4, 0);
      mutate(s);
      return next(s);
    };
    expect(base(() => {})).toMatchObject({ type: 'buildAirbase' });
    expect(base((s) => { s.units = s.units.filter((u) => u.type !== 'bomber'); })).not.toMatchObject({ type: 'buildAirbase' });
    expect(base((s) => { s.turn = 20; })).not.toMatchObject({ type: 'buildAirbase' });
    expect(base((s) => { s.rules.advancedUnits = false; })).not.toMatchObject({ type: 'buildAirbase' });
  });

  it('a bomber lands on an own airbase to refuel when that is nearer than a city', () => {
    const s = game(['*##########*', '............']);
    s.cities[0].owner = 0;
    s.cities[1].owner = 1;
    addUnit(s, 'airbase', 1, 6, 0, { movesLeft: 0, fuel: null });
    const bomber = addUnit(s, 'bomber', 1, 7, 0, { fuel: 5 });
    // Low on fuel: the airbase one square away is the place to land, not the city five squares off.
    expect(next(s)).toEqual({ type: 'setOrders', unitId: bomber.id, orders: { kind: 'goto', target: { x: 6, y: 0 } } });
  });
});
