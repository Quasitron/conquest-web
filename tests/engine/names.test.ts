import { describe, it, expect } from 'vitest';
import { CITY_NAMES, NAME_REGIONS } from '../../src/data/cityNames';
import {
  apply, cleanName, createGame, defaultCityName, getPlayerView, NAME_MAX, ordinal, parseAscii, unitDisplayName,
} from '../../src/engine';
import { romanSuffix } from '../../src/engine/names';
import { addUnit, makeGame } from '../helpers';

const MAP = ['*##...*', '###...#', '##*....'];

describe('ordinal', () => {
  it('formats ordinals', () => {
    const got = [1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal);
    expect(got).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  });
});

describe('unitDisplayName', () => {
  it('uses the ordinal and type name unless named', () => {
    expect(unitDisplayName({ id: 142, type: 'army', name: null })).toBe('142nd Army');
    expect(unitDisplayName({ id: 142, type: 'army', name: 'Old Guard' })).toBe('Old Guard');
  });
});

describe('city names', () => {
  it('romanSuffix', () => {
    expect(romanSuffix(0)).toBe('');
    expect(romanSuffix(1)).toBe(' II');
    expect(romanSuffix(3)).toBe(' IV');
    expect(romanSuffix(19)).toBe(' XX');
  });

  it('defaultCityName is stable and cycles with roman suffixes', () => {
    const L = CITY_NAMES.length;
    expect(defaultCityName(5)).toBe(defaultCityName(5));
    expect(defaultCityName(L + 5)).toBe(defaultCityName(5) + ' II');
  });

  it('the list obeys its rules', () => {
    for (const r of NAME_REGIONS) expect(CITY_NAMES.filter((n) => n.region === r).length).toBeGreaterThanOrEqual(80);
    const lower = CITY_NAMES.map((n) => n.name.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    for (const n of CITY_NAMES) expect(n.name).toMatch(/^[A-Za-z][A-Za-z '-]{0,19}$/);
    expect(CITY_NAMES.length).toBeGreaterThan(700);
  });

  it('cleanName', () => {
    expect(cleanName('  Paris ')).toBe('Paris');
    expect(cleanName('a\u0007')).toBeNull();
    expect(cleanName('x'.repeat(25))).toBeNull();
    expect(cleanName('x'.repeat(NAME_MAX))).toBe('x'.repeat(NAME_MAX));
    expect(cleanName(5)).toBeNull();
  });
});

describe('createGame names', () => {
  it('uses supplied city names, else defaults', () => {
    const map = parseAscii(MAP);
    const base = { map, players: [{ name: 'a', kind: 'human' as const }, { name: 'b', kind: 'human' as const }], startCityIndices: [0, 1], seed: 1 };
    const named = createGame({ ...base, cityNames: ['A', 'B', 'C'] });
    expect(named.cities.map((c) => c.name)).toEqual(['A', 'B', 'C']);
    const dflt = createGame(base);
    expect(dflt.cities.map((c) => c.name)).toEqual([0, 1, 2].map(defaultCityName));
    expect(dflt.version).toBe(3);
  });

  it('new units have no name and no blocked turns', () => {
    const s = makeGame(MAP);
    const u = addUnit(s, 'army', 0, 1, 1);
    expect(u.name).toBeNull();
    expect(u.blockedTurns).toBe(0);
  });
});

describe('rename commands', () => {
  it('owner renames a city', () => {
    const s = makeGame(MAP);
    const r = apply(s, { type: 'renameCity', player: 0, cityId: 0, name: 'Avalon' });
    expect(r.ok && r.state.cities[0].name).toBe('Avalon');
    expect(r.ok && r.state.rngState).toBe(s.rngState);
  });

  it('rejects a foreign city, duplicates and empty names', () => {
    const s = makeGame(MAP);
    expect(apply(s, { type: 'renameCity', player: 0, cityId: 1, name: 'X' })).toEqual({ ok: false, error: 'not your city' });
    const other = s.cities[1].name.toUpperCase();
    expect(apply(s, { type: 'renameCity', player: 0, cityId: 0, name: other })).toEqual({ ok: false, error: 'name already in use' });
    expect(apply(s, { type: 'renameCity', player: 0, cityId: 0, name: '' })).toEqual({ ok: false, error: 'invalid name' });
    expect(apply(s, { type: 'renameCity', player: 0, cityId: 0, name: 'a\u0001' })).toEqual({ ok: false, error: 'invalid name' });
  });

  it('allows the same city to change only its case', () => {
    const s = makeGame(MAP);
    const own = s.cities[0].name;
    const r = apply(s, { type: 'renameCity', player: 0, cityId: 0, name: own.toUpperCase() });
    expect(r.ok && r.state.cities[0].name).toBe(own.toUpperCase());
  });

  it('renames and resets units', () => {
    const s = makeGame(MAP);
    const u = addUnit(s, 'army', 0, 1, 1);
    const a = apply(s, { type: 'renameUnit', player: 0, unitId: u.id, name: 'Old Guard' });
    expect(a.ok && a.state.units[0].name).toBe('Old Guard');
    if (!a.ok) return;
    const b = apply(a.state, { type: 'renameUnit', player: 0, unitId: u.id, name: '' });
    expect(b.ok && b.state.units[0].name).toBeNull();
    const c = apply(a.state, { type: 'renameUnit', player: 0, unitId: u.id, name: null });
    expect(c.ok && c.state.units[0].name).toBeNull();
    const e = addUnit(s, 'army', 1, 4, 1);
    expect(apply(s, { type: 'renameUnit', player: 0, unitId: e.id, name: 'Mine' })).toEqual({ ok: false, error: 'not your unit' });
  });
});

describe('view names', () => {
  it('knownCities carry names only for explored cities and no enemy unit names leak', () => {
    const s = makeGame(MAP);
    const mine = addUnit(s, 'army', 0, 1, 1);
    mine.name = 'Secret';
    const v = getPlayerView(s, 1);
    expect(v.knownCities.length).toBeLessThan(s.cities.length);
    expect(v.knownCities.some((c) => c.id === 0)).toBe(false);
    for (const c of v.knownCities) expect(typeof c.name).toBe('string');
    expect(JSON.stringify(v)).not.toContain('Secret');
  });
});
