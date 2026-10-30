import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { updateFog } from '../../src/engine/fog';
import { UNIT_BUTTONS, availableActions, describeOrders, loadCandidates, visibleButtons } from '../../src/ui/actions';
import { addUnit, makeGame } from '../helpers';

// Player 0 starts in the city at (0,0); player 1 at (6,0).
const M = ['*##...*', '###...#', '##*....'];

function viewOf(s: ReturnType<typeof makeGame>, id: number) {
  updateFog(s, 0);
  const v = getPlayerView(s, 0);
  return { v, u: v.myUnits.find((x) => x.id === id)! };
}

describe('repair action', () => {
  it('is offered to a damaged unit (at sea it goes to a city first) that is not already repairing', () => {
    const s = makeGame(M);
    const hurt = addUnit(s, 'destroyer', 0, 0, 0, { damage: 1 });
    const fit = addUnit(s, 'destroyer', 0, 0, 0);
    const out = addUnit(s, 'destroyer', 0, 4, 1, { damage: 1 });
    const busy = addUnit(s, 'destroyer', 0, 0, 0, { damage: 1, orders: { kind: 'repair' } });
    const can = (id: number) => { const { v, u } = viewOf(s, id); return availableActions(v, u).repair; };
    // A hurt unit at sea can be sent to a city to repair; a healthy one or one already repairing cannot.
    expect([can(hurt.id), can(fit.id), can(out.id), can(busy.id)]).toEqual([true, false, true, false]);
    expect(describeOrders({ kind: 'repair' })).toBe('Repair');
  });
});

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
    expect(acts.patrol).toBe(true);
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

describe('UNIT_BUTTONS and the new actions', () => {
  it('lists the unit buttons in order', () => {
    expect(UNIT_BUTTONS).toEqual([
      'next', 'skip', 'hold', 'sentry', 'repair', 'moveTo', 'explore', 'load', 'unload', 'patrol', 'escort', 'airbase', 'sabotage', 'incite', 'goHome', 'clearOrders', 'center', 'info', 'disband',
    ]);
  });

  it('always offers info and fit, and patrol to a fighter', () => {
    const s = makeGame(M);
    const f = addUnit(s, 'fighter', 0, 0, 0);
    const { v, u } = viewOf(s, f.id);
    const acts = availableActions(v, u);
    expect(acts.info).toBe(true);
    expect(acts.fit).toBe(true);
    expect(acts.patrol).toBe(true);
    expect(acts.explore).toBe(false);
  });
});
describe('visibleButtons', () => {
  it('drops load and unload for an army aboard a transport at sea, keeps sentry, in button order', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 0);
    const a = addUnit(s, 'army', 0, 3, 0, { carriedBy: t.id, orders: { kind: 'sentry' } });
    const { v, u } = viewOf(s, a.id);
    const shown = visibleButtons(v, u);
    expect(shown).not.toContain('load');
    expect(shown).not.toContain('unload');
    expect(shown).toContain('sentry');
    expect(shown).toEqual(UNIT_BUTTONS.filter((id) => shown.includes(id)));
  });
});
describe('Build Airbase action', () => {
  it('is offered to an Army or Armor on open land when Advanced units is on, never in a city, and an airbase cannot move', () => {
    const s = makeGame(M, { rules: { advancedUnits: true } });
    const field = addUnit(s, 'army', 0, 1, 0);
    const city = addUnit(s, 'armor', 0, 0, 0);
    const base = addUnit(s, 'airbase', 0, 2, 0, { movesLeft: 0, fuel: null });
    const can = (id: number) => { const { v, u } = viewOf(s, id); return availableActions(v, u); };
    expect([can(field.id).airbase, can(city.id).airbase, can(base.id).airbase]).toEqual([true, false, false]);
    expect([can(base.id).moveTo, can(base.id).patrol, can(base.id).sentry, can(base.id).skip]).toEqual([false, false, false, false]);
    const off = makeGame(M);
    const a = addUnit(off, 'army', 0, 1, 0);
    const { v, u } = viewOf(off, a.id);
    expect(availableActions(v, u).airbase).toBe(false);
  });
});
describe('spy actions', () => {
  it('Sabotage in an enemy city, Incite Revolt only for an Elite spy', () => {
    const s = makeGame(M, { rules: { advancedUnits: true, promotions: true } });
    const green = addUnit(s, 'spy', 0, 6, 0);
    const elite = addUnit(s, 'spy', 0, 6, 0, { wins: 5 });
    const home = addUnit(s, 'spy', 0, 0, 0, { wins: 5 });
    const can = (id: number) => { const { v, u } = viewOf(s, id); const a = availableActions(v, u); return [a.sabotage, a.incite]; };
    updateFog(s, 0);
    expect(can(green.id)).toEqual([true, false]);
    expect(can(elite.id)).toEqual([true, true]);
    expect(can(home.id)).toEqual([false, false]);
  });
});
