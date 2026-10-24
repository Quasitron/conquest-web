import { describe, expect, it } from 'vitest';
import { CITY_STRENGTH_HITS, UNIT_STATS, getPlayerView, hitsOf, rankOf, type GameEvent } from '../../src/engine';
import { attackCity, attackUnit, bombardCity } from '../../src/engine/attack';
import { advanceProduction, buildTime } from '../../src/engine/production';
import { addUnit, attackerAlwaysHits, defenderAlwaysHits, makeGame } from '../helpers';
import { cityAttackChance, visibleGarrison } from '../../src/ui/plans';
import { describeEvent } from '../../src/ui/describe';

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

describe('garrisons defend (house rule)', () => {
  it('land units of the owner in a city add 1 defence each, up to +2; ships do not', () => {
    const s = makeGame(M, { rules: { garrisonsDefend: true } });
    const city = s.cities[1];
    const v = () => getPlayerView(s, 0);
    const a = addUnit(s, 'army', 0, 1, 0);
    const base = cityAttackChance(v(), a, city.owner, 0, 0);
    addUnit(s, 'destroyer', city.owner as number, city.x, city.y);
    expect(visibleGarrison(getPlayerView(s, city.owner as number), city, city.owner)).toBe(0);
    addUnit(s, 'army', city.owner as number, city.x, city.y);
    expect(visibleGarrison(getPlayerView(s, city.owner as number), city, city.owner)).toBe(1);
    const one = cityAttackChance(v(), a, city.owner, 0, 1);
    const two = cityAttackChance(v(), a, city.owner, 0, 2);
    const five = cityAttackChance(v(), a, city.owner, 0, 5);
    expect(one).toBeLessThan(base);
    expect(two).toBeLessThan(one);
    expect(five).toBeCloseTo(two, 10);
  });

  it('does nothing when the rule is off, and for neutral cities', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 0);
    expect(cityAttackChance(getPlayerView(s, 0), a, 1, 0, 2)).toBeCloseTo(0.5, 10);
    const on = makeGame(M, { rules: { garrisonsDefend: true } });
    const b = addUnit(on, 'army', 0, 1, 0);
    expect(cityAttackChance(getPlayerView(on, 0), b, null, 0, 2)).toBeCloseTo(0.5, 10);
  });
});
describe('city bombardment (city strength rule)', () => {
  const SEA = ['..*', '..*'];
  it('a battleship wears a player city down to its last hit but never takes it', () => {
    const s = makeGame(SEA, { rules: { cityStrength: true } });
    const city = s.cities[1] ?? s.cities[0];
    city.owner = 1;
    const ship = addUnit(s, 'battleship', 0, 1, 0);
    const ev: unknown[] = [];
    expect(bombardCity(s, attackerAlwaysHits(), ship, city, ev as never[])).toBeNull();
    expect(city.damage).toBe(CITY_STRENGTH_HITS - 1);
    expect(city.owner).toBe(1);
    expect(s.units).toContain(ship);
    expect(bombardCity(s, attackerAlwaysHits(), ship, city, [])).toMatch(/as weak as/);
  });

  it('the city fires back: a ship that loses is sunk and the city keeps what it took', () => {
    const s = makeGame(SEA, { rules: { cityStrength: true } });
    const city = s.cities[1] ?? s.cities[0];
    city.owner = 1;
    const ship = addUnit(s, 'cruiser', 0, 1, 0, { damage: 7 });
    expect(bombardCity(s, defenderAlwaysHits(), ship, city, [])).toBeNull();
    expect(s.units).not.toContain(ship);
    expect(city.damage ?? 0).toBe(0);
  });
});
describe('war-torn cities (house rule)', () => {
  it('each capture from another player slows building by 25%, up to 4, and a neutral city is not affected', () => {
    const s = makeGame(M, { rules: { warTornCities: true } });
    const city = s.cities[1];
    const base = buildTime(city, 'army');
    attackCity(s, attackerAlwaysHits(), addUnit(s, 'army', 0, 1, 0), city, []);
    expect(city.warTorn).toBe(1);
    expect(buildTime(city, 'army')).toBe(Math.ceil(base * 1.25));
    city.owner = 1;
    for (let i = 0; i < 6; i++) {
      attackCity(s, attackerAlwaysHits(), addUnit(s, 'army', 0, 1, 0), city, []);
      city.owner = 1;
    }
    expect(city.warTorn).toBe(4);
    expect(buildTime(city, 'army')).toBe(base * 2);
    const neutral = { ...city, owner: null, warTorn: undefined };
    s.cities[1] = neutral as typeof city;
    attackCity(s, attackerAlwaysHits(), addUnit(s, 'army', 0, 1, 0), neutral as typeof city, []);
    expect(neutral.warTorn).toBeUndefined();
  });

  it('recovers one step every 10 turns of the owner', () => {
    const s = makeGame(M, { rules: { warTornCities: true } });
    const city = s.cities[0];
    city.warTorn = 2;
    for (let i = 0; i < 10; i++) advanceProduction(s, city.owner as number, []);
    expect(city.warTorn).toBe(1);
    for (let i = 0; i < 10; i++) advanceProduction(s, city.owner as number, []);
    expect(city.warTorn).toBe(0);
  });

  it('does nothing when the rule is off', () => {
    const s = makeGame(M);
    const city = s.cities[1];
    attackCity(s, attackerAlwaysHits(), addUnit(s, 'army', 0, 1, 0), city, []);
    expect(city.warTorn).toBeUndefined();
  });
});
describe('promotions (house rule)', () => {
  const SEA2 = ['*...', '...*'];
  const winnerFights = (s: ReturnType<typeof makeGame>, ship: ReturnType<typeof addUnit>, victim: ReturnType<typeof addUnit>) =>
    attackUnit(s, attackerAlwaysHits(), ship, victim, []);

  it('a sea unit is promoted at 1, 3 and 5 wins; a promotion heals one hit and is announced', () => {
    const s = makeGame(SEA2, { rules: { promotions: true } });
    const ship = addUnit(s, 'battleship', 0, 0, 0, { damage: 3 });
    const events: GameEvent[] = [];
    attackUnit(s, attackerAlwaysHits(), ship, addUnit(s, 'destroyer', 1, 1, 0), events);
    expect(ship.wins).toBe(1);
    expect(ship.damage).toBe(2);
    expect(events).toContainEqual({ type: 'unitPromoted', unitId: ship.id, owner: 0, unitType: 'battleship', rank: 1 });
    for (let i = 0; i < 4; i++) { ship.x = 0; ship.y = 0; ship.movesLeft = 2; winnerFights(s, ship, addUnit(s, 'destroyer', 1, 1, 0)); }
    expect(ship.wins).toBe(5);
    expect(rankOf(ship.wins)).toBe(3);
    expect(hitsOf(ship)).toBe(UNIT_STATS.battleship.hits + 1);
  });

  it('a defender that wins also counts, and armies, fighters and a rule that is off do not promote', () => {
    const s = makeGame(SEA2, { rules: { promotions: true } });
    const att = addUnit(s, 'destroyer', 0, 0, 0);
    const def = addUnit(s, 'cruiser', 1, 1, 0);
    attackUnit(s, defenderAlwaysHits(), att, def, []);
    expect(def.wins).toBe(1);
    const army = addUnit(makeGame(SEA2, { rules: { promotions: true } }), 'fighter', 0, 0, 0);
    expect(UNIT_STATS.fighter.promotes).toBe(false);
    expect(army.wins).toBeUndefined();
    const off = makeGame(SEA2);
    const ship = addUnit(off, 'cruiser', 0, 0, 0);
    attackUnit(off, attackerAlwaysHits(), ship, addUnit(off, 'destroyer', 1, 1, 0), []);
    expect(ship.wins).toBeUndefined();
  });
});
describe('rank in reports and sightings', () => {
  const SEA3 = ['*...', '...*'];
  it('a combat event carries the ranks of promoted fighters, and the report names them', () => {
    const s = makeGame(SEA3, { rules: { promotions: true } });
    const ship = addUnit(s, 'battleship', 0, 0, 0, { wins: 3 });
    const events: GameEvent[] = [];
    attackUnit(s, attackerAlwaysHits(), ship, addUnit(s, 'destroyer', 1, 1, 0), events);
    const fight = events.find((e) => e.type === 'combat');
    expect(fight).toMatchObject({ attackerRank: 2 });
    expect(fight && 'defenderRank' in fight).toBe(false);
    expect(describeEvent(fight!, 1, ['You', 'Computer'])).toContain('Veteran Battleship');
  });

  it('an enemy marker carries the rank the unit had when you saw it', () => {
    const s = makeGame(SEA3);
    const other = addUnit(s, 'cruiser', 1, 1, 0, { wins: 5 });
    s.fog[0].lastSeen[other.id] = { unitId: other.id, type: 'cruiser', owner: 1, x: 1, y: 0, turnSeen: s.turn, rank: 3 };
    expect(getPlayerView(s, 0).enemies[0].rank).toBe(3);
  });
});