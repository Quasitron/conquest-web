import { describe, it, expect } from 'vitest';
import { moveUnit } from '../../src/engine/movement';
import { cargoOf } from '../../src/engine/query';
import type { GameEvent } from '../../src/engine/types';
import { addUnit, attackerAlwaysHits, defenderAlwaysHits, fixedRng, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];

describe('unit combat', () => {
  it('a winning army moves into the defender square', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    const e = addUnit(s, 'army', 1, 2, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, attackerAlwaysHits(), a, 2, events)).toBeNull();
    expect(s.units).not.toContain(e);
    expect(a).toMatchObject({ x: 2, y: 1, movesLeft: 0 });
    expect(events.find((ev) => ev.type === 'combat')).toMatchObject({ attackerWon: true });
  });

  it('a losing attacker is destroyed', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    const e = addUnit(s, 'army', 1, 2, 1);
    expect(moveUnit(s, defenderAlwaysHits(), a, 2, [])).toBeNull();
    expect(s.units).not.toContain(a);
    expect(s.units).toContain(e);
  });

  it('an army that sinks a ship stays on land', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 2, 1);
    addUnit(s, 'destroyer', 1, 3, 1);
    expect(moveUnit(s, attackerAlwaysHits(), a, 2, [])).toBeNull();
    expect(a).toMatchObject({ x: 2, y: 1 });
  });

  it('a winner does not advance onto a square still holding other enemy units', () => {
    const s = makeGame(M);
    const c = addUnit(s, 'cruiser', 0, 3, 1);
    addUnit(s, 'destroyer', 1, 4, 1);
    addUnit(s, 'fighter', 1, 4, 1);
    expect(moveUnit(s, attackerAlwaysHits(), c, 2, [])).toBeNull();
    expect(c).toMatchObject({ x: 3, y: 1 });
    expect(s.units.filter((u) => u.x === 4 && u.y === 1)).toHaveLength(1);
    for (const u of s.units) {
      const owners = new Set(s.units.filter((o) => o.x === u.x && o.y === u.y).map((o) => o.owner));
      expect(owners.size).toBe(1);
    }
  });

  it('enforces attack restrictions', () => {
    const s = makeGame(M);
    const army = addUnit(s, 'army', 0, 2, 1);
    addUnit(s, 'submarine', 1, 3, 1);
    expect(moveUnit(s, attackerAlwaysHits(), army, 2, [])).toBeTruthy(); // land vs sub

    const s2 = makeGame(M);
    const sub = addUnit(s2, 'submarine', 0, 3, 1);
    addUnit(s2, 'army', 1, 2, 1);
    expect(moveUnit(s2, attackerAlwaysHits(), sub, 6, [])).toBeTruthy(); // sub vs land

    const s3 = makeGame(M);
    const d = addUnit(s3, 'destroyer', 0, 3, 1);
    addUnit(s3, 'army', 1, 2, 1);
    expect(moveUnit(s3, attackerAlwaysHits(), d, 6, [])).toBeTruthy(); // no bombard ability

    const s4 = makeGame(M);
    const d4 = addUnit(s4, 'destroyer', 0, 3, 1);
    addUnit(s4, 'fighter', 1, 2, 1);
    expect(moveUnit(s4, attackerAlwaysHits(), d4, 6, [])).toBeTruthy(); // ship vs plane over land

    const s5 = makeGame(M);
    const a5 = addUnit(s5, 'army', 0, 2, 1);
    addUnit(s5, 'fighter', 1, 3, 1);
    expect(moveUnit(s5, attackerAlwaysHits(), a5, 2, [])).toBeTruthy(); // army vs plane over water
  });

  it('cruisers bombard with the defender at half defense', () => {
    const s = makeGame(M);
    const c = addUnit(s, 'cruiser', 0, 3, 1);
    const e = addUnit(s, 'army', 1, 2, 1);
    // 0.6 < 2/(2+1) → attacker hit; it would be a defender hit at normal odds 2/(2+2)
    expect(moveUnit(s, fixedRng(0.6), c, 6, [])).toBeNull();
    expect(s.units).not.toContain(e);
    expect(c).toMatchObject({ x: 3, y: 1 });
  });

  it('armies on a transport can attack onto land but not at sea', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 1);
    const a = addUnit(s, 'army', 0, 3, 1, { carriedBy: t.id });
    addUnit(s, 'destroyer', 1, 4, 1);
    expect(moveUnit(s, attackerAlwaysHits(), a, 2, [])).toBeTruthy();
    addUnit(s, 'army', 1, 2, 1);
    expect(moveUnit(s, attackerAlwaysHits(), a, 6, [])).toBeNull();
    expect(a).toMatchObject({ x: 2, y: 1, carriedBy: null });
  });
});

describe('damage effects', () => {
  it('a damaged transport loses armies beyond its reduced capacity', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 1);
    for (let i = 0; i < 5; i++) addUnit(s, 'army', 0, 3, 1, { carriedBy: t.id });
    const d = addUnit(s, 'destroyer', 1, 4, 1);
    // destroyer hits twice (transport damage 2), then transport hits three times (destroyer sunk)
    expect(moveUnit(s, fixedRng(0, 0, 0.999), d, 6, [])).toBeNull();
    expect(s.units).not.toContain(d);
    expect(t.damage).toBe(2);
    expect(cargoOf(s, t)).toHaveLength(2);
  });

  it('sinking a transport destroys its cargo', () => {
    const s = makeGame(M);
    const t = addUnit(s, 'transport', 0, 3, 1);
    for (let i = 0; i < 5; i++) addUnit(s, 'army', 0, 3, 1, { carriedBy: t.id });
    const d = addUnit(s, 'destroyer', 1, 4, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, attackerAlwaysHits(), d, 6, events)).toBeNull();
    expect(s.units).toEqual([d]);
    expect(events.filter((e) => e.type === 'unitDestroyed')).toHaveLength(6);
  });

  it('an attacker crippled in combat stops moving', () => {
    const s = makeGame(M);
    const c = addUnit(s, 'cruiser', 0, 3, 1);
    addUnit(s, 'destroyer', 1, 4, 1);
    // destroyer hits 4 times (cruiser damage 4 of 8 → crippled), then cruiser hits twice
    expect(moveUnit(s, fixedRng(0.9, 0.9, 0.9, 0.9, 0), c, 2, [])).toBeNull();
    expect(c).toMatchObject({ x: 4, y: 1, damage: 4, movesLeft: 0 });
  });
});

describe('cities', () => {
  it('an army captures a neutral city and becomes its garrison', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    const events: GameEvent[] = [];
    expect(moveUnit(s, attackerAlwaysHits(), a, 3, events)).toBeNull();
    expect(s.cities[2]).toMatchObject({ owner: 0, production: null, progress: 0 });
    expect(s.units).not.toContain(a);
    expect(events).toContainEqual({ type: 'cityCaptured', cityId: 2, by: 0, from: null });
  });

  it('capturing an enemy city destroys the units inside and tells the loser', () => {
    const s = makeGame(M);
    s.cities[2].owner = 1;
    s.cities[2].production = 'destroyer';
    const d = addUnit(s, 'destroyer', 1, 2, 2);
    const g = addUnit(s, 'army', 1, 2, 2);
    const a = addUnit(s, 'army', 0, 1, 1);
    expect(moveUnit(s, attackerAlwaysHits(), a, 3, [])).toBeNull();
    expect(s.units).not.toContain(d);
    expect(s.units).not.toContain(g);
    expect(s.cities[2].owner).toBe(0);
    expect(s.fog[1].knownCityOwner[2]).toBe(0);
  });

  it('a failed assault destroys the army and leaves the city', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    expect(moveUnit(s, defenderAlwaysHits(), a, 3, [])).toBeNull();
    expect(s.units).not.toContain(a);
    expect(s.cities[2].owner).toBeNull();
  });

  it('only land units can attack cities', () => {
    const s = makeGame(M);
    const d = addUnit(s, 'destroyer', 0, 3, 2);
    expect(moveUnit(s, attackerAlwaysHits(), d, 6, [])).toBe('only land units can attack cities');
    const f = addUnit(s, 'fighter', 0, 2, 1);
    expect(moveUnit(s, attackerAlwaysHits(), f, 4, [])).toBe('only land units can attack cities');
  });
});
