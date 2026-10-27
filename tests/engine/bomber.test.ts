import { describe, expect, it } from 'vitest';
import { UNIT_STATS, buildableTypes, fightRatings } from '../../src/engine';
import { apply } from '../../src/engine/apply';
import { moveUnit } from '../../src/engine/movement';
import { cargoOf, destroyUnit } from '../../src/engine/query';
import { Rng } from '../../src/engine/rng';
import { addUnit, defenderAlwaysHits, fixedRng, makeGame } from '../helpers';

// (0,0) is player 0's city, (6,0) player 1's, (2,2) is neutral.
const M = ['*##...*', '###...#', '##*....'];
const ON = { advancedUnits: true };

describe('Bomber (Advanced units house rule)', () => {
  it('has the manual numbers and is only built when the rule is on', () => {
    const b = UNIT_STATS.bomber;
    expect([b.domain, b.move, b.hits, b.attack, b.defense, b.shot, b.range, b.build, b.buildRepeat]).toEqual(['air', 4, 1, 2, 2, 2, 24, 12, 10]);
    expect(buildableTypes({ advancedUnits: false })).not.toContain('bomber');
    expect(buildableTypes({ advancedUnits: true })).toContain('bomber');
    expect(buildableTypes({ advancedUnits: true })).not.toContain('airbase');
  });

  it('fights poorly against a fighter, and ships (except a carrier) attack aircraft at 1 with the rule on', () => {
    expect(fightRatings(ON, 'bomber', 'fighter')).toEqual({ attack: 1, defense: 2 });
    expect(fightRatings(ON, 'fighter', 'bomber')).toEqual({ attack: 2, defense: 1 });
    expect(fightRatings(ON, 'bomber', 'army')).toEqual({ attack: 2, defense: 2 });
    expect(fightRatings(ON, 'battleship', 'fighter').attack).toBe(1);
    expect(fightRatings(ON, 'carrier', 'fighter').attack).toBe(1); // a carrier's attack is 1 anyway
    expect(fightRatings(ON, 'destroyer', 'army').attack).toBe(2);
    expect(fightRatings({ advancedUnits: false }, 'destroyer', 'fighter').attack).toBe(2);
  });

  it('bombing a city that holds a unit costs it a unit, and the bomber stays where it is', () => {
    const s = makeGame(M, { rules: ON });
    const bomber = addUnit(s, 'bomber', 0, 5, 0);
    const victim = addUnit(s, 'army', 1, 6, 0);
    s.cities[1].progress = 4;
    s.cities[1].production = 'army';
    const events: never[] = [];
    expect(moveUnit(s, fixedRng(0, 0.1, 0), bomber, 2, events as never)).toBeNull();
    expect(s.units.includes(victim)).toBe(false);
    expect(s.cities[1].owner).toBe(1); // bombing never takes a city
    expect(s.cities[1].progress).toBe(4);
    expect([bomber.x, bomber.y, bomber.movesLeft]).toEqual([5, 0, 3]);
  });

  it('bombing otherwise wipes the production built up so far', () => {
    const s = makeGame(M, { rules: ON });
    const bomber = addUnit(s, 'bomber', 0, 5, 0);
    s.cities[1].progress = 4;
    s.cities[1].production = 'army';
    expect(moveUnit(s, fixedRng(0, 0.9), bomber, 2, [])).toBeNull();
    expect(s.cities[1].progress).toBe(0);
    expect(s.cities[1].owner).toBe(1);
  });

  it('a bomber that loses the fight is destroyed, and a neutral city cannot be bombed', () => {
    const s = makeGame(M, { rules: ON });
    const bomber = addUnit(s, 'bomber', 0, 5, 0);
    expect(moveUnit(s, defenderAlwaysHits(), bomber, 2, [])).toBeNull();
    expect(s.units.includes(bomber)).toBe(false);
    const t = makeGame(M, { rules: ON });
    const b2 = addUnit(t, 'bomber', 0, 3, 2);
    expect(moveUnit(t, new Rng(1), b2, 6, [])).toBe('there is nothing to bomb in a neutral city');
    expect(b2.movesLeft).toBe(4);
  });

  it('without the rule aircraft still cannot attack cities', () => {
    const s = makeGame(M);
    const f = addUnit(s, 'fighter', 0, 5, 0);
    expect(moveUnit(s, new Rng(1), f, 2, [])).toBe('only land units can attack cities');
  });
});

describe('Airbase (Advanced units house rule)', () => {
  const land = (s: ReturnType<typeof makeGame>) => addUnit(s, 'army', 0, 1, 0);

  it('an Army or Armor on open land turns into an airbase that cannot move', () => {
    const s = makeGame(M, { rules: ON });
    const a = land(s);
    const r = apply(s, { type: 'buildAirbase', player: 0, unitId: a.id });
    if (!r.ok) throw new Error(r.error);
    const base = r.state.units.find((u) => u.id === a.id)!;
    expect([base.type, base.damage, base.movesLeft, base.fuel]).toEqual(['airbase', 0, 0, null]);
    expect(r.events).toContainEqual({ type: 'airbaseBuilt', unitId: a.id, owner: 0, x: 1, y: 0 });
    expect(moveUnit(r.state, new Rng(1), base, 2, [])).toBe('an airbase cannot move');
    const again = apply(r.state, { type: 'buildAirbase', player: 0, unitId: a.id });
    expect(again).toMatchObject({ ok: false });
  });

  it('is refused without the rule, in a city, on a ship, and for other units', () => {
    const off = makeGame(M);
    expect(apply(off, { type: 'buildAirbase', player: 0, unitId: addUnit(off, 'army', 0, 1, 0).id })).toMatchObject({ ok: false });
    const s = makeGame(M, { rules: ON });
    expect(apply(s, { type: 'buildAirbase', player: 0, unitId: addUnit(s, 'army', 0, 0, 0).id })).toMatchObject({ ok: false, error: 'an airbase needs open land' });
    expect(apply(s, { type: 'buildAirbase', player: 0, unitId: addUnit(s, 'fighter', 0, 1, 1).id })).toMatchObject({ ok: false });
    const t = addUnit(s, 'transport', 0, 4, 0);
    const aboard = addUnit(s, 'army', 0, 4, 0, { carriedBy: t.id });
    expect(apply(s, { type: 'buildAirbase', player: 0, unitId: aboard.id })).toMatchObject({ ok: false });
  });

  it('fighters and bombers land and refuel on it; a carrier takes no bomber', () => {
    const s = makeGame(M, { rules: ON });
    const base = addUnit(s, 'airbase', 0, 2, 0, { movesLeft: 0, fuel: null });
    const bomber = addUnit(s, 'bomber', 0, 3, 0, { fuel: 10, movesLeft: 4 });
    expect(moveUnit(s, new Rng(1), bomber, 6, [])).toBeNull(); // west, onto the airbase
    expect(bomber.carriedBy).toBe(base.id);
    expect(bomber.fuel).toBe(24);
    expect(bomber.movesLeft).toBe(0);
    const f = addUnit(s, 'fighter', 0, 3, 0, { fuel: 5 });
    expect(moveUnit(s, new Rng(1), f, 6, [])).toBeNull();
    expect(cargoOf(s, base).map((u) => u.type).sort()).toEqual(['bomber', 'fighter']);
    const t = makeGame(M, { rules: ON });
    const carrier = addUnit(t, 'carrier', 0, 4, 0);
    const b2 = addUnit(t, 'bomber', 0, 5, 0);
    expect(moveUnit(t, new Rng(1), b2, 6, [])).toBeNull(); // it only flies over the carrier
    expect(b2.carriedBy).toBeNull();
    expect(carrier.id).toBeGreaterThan(0);
  });

  it('holds eight aircraft', () => {
    const s = makeGame(M, { rules: ON });
    const base = addUnit(s, 'airbase', 0, 2, 0, { movesLeft: 0, fuel: null });
    for (let i = 0; i < 8; i++) addUnit(s, 'fighter', 0, 2, 0, { carriedBy: base.id });
    const f = addUnit(s, 'fighter', 0, 3, 0);
    expect(moveUnit(s, new Rng(1), f, 6, [])).toBeNull(); // flies over a full airbase
    expect(f.carriedBy).toBeNull();
  });

  it('destroying the airbase destroys the aircraft on it', () => {
    const s = makeGame(M, { rules: ON });
    const base = addUnit(s, 'airbase', 0, 2, 0, { movesLeft: 0, fuel: null });
    const f = addUnit(s, 'fighter', 0, 2, 0, { carriedBy: base.id });
    destroyUnit(s, base, 'combat', [], 1);
    expect(s.units.includes(f)).toBe(false);
  });

  it('an airbase is not a land unit that could retake a city', () => {
    const s = makeGame(M, { rules: ON });
    s.cities[0].owner = null;
    addUnit(s, 'airbase', 0, 2, 0, { movesLeft: 0, fuel: null });
    // Ending turn 0 with a city-less player holding only an airbase eliminates them.
    const r = apply(s, { type: 'endTurn', player: 0 });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.players[0].eliminated).toBe(true);
  });
});
