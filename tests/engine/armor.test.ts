import { describe, expect, it } from 'vitest';
import { UNIT_STATS, buildableTypes, cargoUsed } from '../../src/engine';
import { apply } from '../../src/engine/apply';
import { attackCity } from '../../src/engine/attack';
import { loadUnits } from '../../src/engine/cargo';
import { moveUnit } from '../../src/engine/movement';
import { cargoOf, trimCargo } from '../../src/engine/query';
import { Rng } from '../../src/engine/rng';
import { addUnit, attackerAlwaysHits, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];
const ON = { advancedUnits: true };

describe('Armor (Advanced units house rule)', () => {
  it('is a faster, tougher army that takes two places on a transport', () => {
    const a = UNIT_STATS.armor;
    expect([a.domain, a.move, a.hits, a.attack, a.defense, a.slots, a.build, a.buildRepeat]).toEqual(['land', 2, 2, 2, 2, 2, 12, 10]);
    expect(UNIT_STATS.army.slots).toBe(1);
  });

  it('can only be built when the rule is on', () => {
    expect(buildableTypes({ advancedUnits: false })).not.toContain('armor');
    expect(buildableTypes({ advancedUnits: true })).toContain('armor');
    const off = makeGame(M);
    const r = apply(off, { type: 'setProduction', player: 0, cityId: off.cities[0].id, unitType: 'armor' });
    expect(r).toMatchObject({ ok: false, error: 'that unit is not in this game' });
    const on = makeGame(M, { rules: ON });
    expect(apply(on, { type: 'setProduction', player: 0, cityId: on.cities[0].id, unitType: 'armor' }).ok).toBe(true);
  });

  it('a transport holds three Armor, or two Armor and two Armies, but not more', () => {
    const s = makeGame(M, { rules: ON });
    s.cities[2].owner = 0;
    const t = addUnit(s, 'transport', 0, 2, 2);
    const tanks = [1, 2, 3, 4].map(() => addUnit(s, 'armor', 0, 2, 2));
    expect(loadUnits(s, t, tanks.map((u) => u.id))).toBe('not enough room');
    expect(loadUnits(s, t, tanks.slice(0, 3).map((u) => u.id))).toBeNull();
    expect(cargoUsed(cargoOf(s, t))).toBe(6);
    const army = addUnit(s, 'army', 0, 2, 2);
    expect(loadUnits(s, t, [army.id])).toBe('not enough room');
  });

  it('a transport leaving a city takes only what fits', () => {
    const s = makeGame(M, { rules: ON });
    s.cities[2].owner = 0;
    const t = addUnit(s, 'transport', 0, 2, 2);
    for (let i = 0; i < 3; i++) addUnit(s, 'armor', 0, 2, 2);
    const extra = addUnit(s, 'army', 0, 2, 2);
    expect(moveUnit(s, new Rng(1), t, 2, [])).toBeNull(); // east
    expect(cargoUsed(cargoOf(s, t))).toBe(6);
    expect(extra.carriedBy).toBeNull();
  });

  it('damage that shrinks a transport sinks cargo by space, newest first', () => {
    const s = makeGame(M, { rules: ON });
    const t = addUnit(s, 'transport', 0, 3, 1);
    const old = addUnit(s, 'armor', 0, 3, 1);
    const mid = addUnit(s, 'armor', 0, 3, 1);
    const last = addUnit(s, 'armor', 0, 3, 1);
    for (const u of [old, mid, last]) u.carriedBy = t.id;
    t.damage = 1; // capacity 6 -> 4
    const events: never[] = [];
    trimCargo(s, t, events);
    expect(cargoOf(s, t).map((u) => u.id)).toEqual([old.id, mid.id]);
  });

  it('an undamaged Armor that takes a city leaves an Army there with no moves', () => {
    const s = makeGame(M, { rules: ON });
    const tank = addUnit(s, 'armor', 0, 1, 0);
    const city = s.cities[1];
    attackCity(s, attackerAlwaysHits(), tank, city, []);
    expect(city.owner).toBe(0);
    const garrison = s.units.filter((u) => u.owner === 0 && u.x === city.x && u.y === city.y);
    expect(garrison.map((u) => u.type)).toEqual(['army']);
    expect(garrison[0].movesLeft).toBe(0);
  });

  it('a damaged Armor that takes a city leaves nothing behind', () => {
    const s = makeGame(M, { rules: ON });
    const tank = addUnit(s, 'armor', 0, 1, 0);
    tank.damage = 1;
    const city = s.cities[1];
    attackCity(s, attackerAlwaysHits(), tank, city, []);
    expect(city.owner).toBe(0);
    expect(s.units.filter((u) => u.owner === 0 && u.x === city.x && u.y === city.y)).toEqual([]);
  });
});