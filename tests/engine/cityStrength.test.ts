import { describe, expect, it } from 'vitest';
import { CITY_STRENGTH_HITS, getPlayerView } from '../../src/engine';
import { attackCity } from '../../src/engine/attack';
import { advanceProduction } from '../../src/engine/production';
import { addUnit, attackerAlwaysHits, defenderAlwaysHits, makeGame } from '../helpers';
import { cityAttackChance } from '../../src/ui/plans';

const M = ['*.*'];

describe('city strength (house rule)', () => {
  it('is off by default: a city falls to one successful attack and keeps no damage', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 0);
    attackCity(s, attackerAlwaysHits(), a, s.cities[1], []);
    expect(s.cities[1].owner).toBe(0);
    expect(s.cities[1].damage).toBeUndefined();
  });

  it('a city that beats an attacker keeps the hits it took, and one that is taken is reset', () => {
    const s = makeGame(M, { rules: { cityStrength: true } });
    const city = s.cities[1];
    const first = addUnit(s, 'army', 0, 1, 0);
    // the army lands one hit, then the city kills it
    attackCity(s, { next: (() => { let n = 0; return () => (n++ === 0 ? 0 : 0.999); })() }, first, city, []);
    expect(city.damage).toBe(1);
    expect(city.owner).not.toBe(0);
    const second = addUnit(s, 'army', 0, 1, 0);
    attackCity(s, attackerAlwaysHits(), second, city, []);
    expect(city.owner).toBe(0);
    expect(city.damage).toBe(0);
  });

  it('a fresh city takes several hits to fall', () => {
    const s = makeGame(M, { rules: { cityStrength: true } });
    const a = addUnit(s, 'army', 0, 1, 0);
    const seq = [0, 0, 0.999];
    attackCity(s, { next: () => seq.shift() ?? 0.999 }, a, s.cities[1], []); // two hits, then the army dies
    expect(s.cities[1].owner).not.toBe(0);
    expect(s.cities[1].damage).toBe(2);
    expect(CITY_STRENGTH_HITS).toBe(3);
  });

  it('leaves neutral cities as easy as before: one hit takes them, and they keep no damage', () => {
    const s = makeGame(M, { rules: { cityStrength: true } });
    const city = s.cities[1];
    city.owner = null;
    const a = addUnit(s, 'army', 0, 1, 0);
    attackCity(s, attackerAlwaysHits(), a, city, []);
    expect(city.owner).toBe(0);
    const b = addUnit(s, 'army', 0, 1, 0);
    city.owner = null;
    attackCity(s, defenderAlwaysHits(), b, city, []);
    expect(city.damage ?? 0).toBe(0);
    expect(cityAttackChance(getPlayerView(s, 0), b, null, 0)).toBeCloseTo(0.5, 5);
  });

  it('heals one hit a turn for its owner', () => {
    const s = makeGame(M, { rules: { cityStrength: true } });
    const city = s.cities[0];
    city.damage = 2;
    advanceProduction(s, city.owner as number, []);
    expect(city.damage).toBe(1);
    advanceProduction(s, city.owner as number, []);
    advanceProduction(s, city.owner as number, []);
    expect(city.damage).toBe(0);
  });

  it('the win chance estimate drops as the city is worn down', () => {
    const s = makeGame(M, { rules: { cityStrength: true } });
    const u = addUnit(s, 'army', 0, 1, 0);
    const v = getPlayerView(s, 0);
    expect(cityAttackChance(v, u, 1, 2)).toBeGreaterThan(cityAttackChance(v, u, 1, 0));
  });
});
