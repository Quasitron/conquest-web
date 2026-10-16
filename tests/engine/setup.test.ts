import { describe, it, expect } from 'vitest';
import { parseAscii } from '../../src/engine/ascii';
import { createGame } from '../../src/engine/setup';
import { areFriendly } from '../../src/engine/relations';
import { cargoOf, destroyUnit, topLevelUnitsAt, trimCargo, isAtRefuelPoint } from '../../src/engine/query';
import type { GameEvent } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const rows = ['*..##*', '...###'];

describe('createGame', () => {
  it('assigns start cities with army production', () => {
    const s = makeGame(rows);
    expect(s.cities).toHaveLength(2);
    expect(s.cities[0]).toMatchObject({ owner: 0, production: 'army', progress: 1 });
    expect(s.cities[1]).toMatchObject({ owner: 1, production: 'army' });
    expect(s.turn).toBe(1);
    expect(s.currentPlayer).toBe(0);
    expect(s.units).toEqual([]);
    expect(s.players.map((p) => p.name)).toEqual(['P0', 'P1']);
    expect(s.winner).toBeNull();
  });

  it('validates players and start cities', () => {
    const map = parseAscii(rows);
    const p = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind: 'ai' as const }));
    expect(() => createGame({ map, players: p(1), startCityIndices: [0], seed: 1 })).toThrow();
    expect(() => createGame({ map, players: p(7), startCityIndices: [0, 1, 0, 1, 0, 1, 0], seed: 1 })).toThrow();
    expect(() => createGame({ map, players: p(2), startCityIndices: [0], seed: 1 })).toThrow();
    expect(() => createGame({ map, players: p(2), startCityIndices: [0, 0], seed: 1 })).toThrow();
    expect(() => createGame({ map, players: p(2), startCityIndices: [0, 5], seed: 1 })).toThrow();
  });

  it('produces JSON-serializable state', () => {
    const s = makeGame(rows);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('relations', () => {
  it('a player is friendly only to itself in v1', () => {
    const s = makeGame(rows);
    expect(areFriendly(s, 0, 0)).toBe(true);
    expect(areFriendly(s, 0, 1)).toBe(false);
    expect(areFriendly(s, null, null)).toBe(false);
    expect(areFriendly(s, 0, null)).toBe(false);
  });
});

describe('queries', () => {
  it('spawns units with increasing ids and full moves and fuel', () => {
    const s = makeGame(rows);
    const a = addUnit(s, 'army', 0, 3, 0);
    const f = addUnit(s, 'fighter', 0, 1, 1);
    expect(f.id).toBe(a.id + 1);
    expect(f.movesLeft).toBe(5);
    expect(f.fuel).toBe(20);
    expect(a.fuel).toBeNull();
  });

  it('destroying a carrier destroys its cargo', () => {
    const s = makeGame(rows);
    const t = addUnit(s, 'transport', 0, 1, 0);
    addUnit(s, 'army', 0, 1, 0, { carriedBy: t.id });
    addUnit(s, 'army', 0, 1, 0, { carriedBy: t.id });
    const events: GameEvent[] = [];
    destroyUnit(s, t, 'combat', events);
    expect(s.units).toHaveLength(0);
    expect(events.map((e) => e.type === 'unitDestroyed' && e.reason)).toEqual(['cargoLost', 'cargoLost', 'combat']);
  });

  it('trimCargo removes the most recently built cargo beyond capacity', () => {
    const s = makeGame(rows);
    const t = addUnit(s, 'transport', 0, 1, 0, { damage: 2 });
    const armies = [0, 1, 2, 3].map(() => addUnit(s, 'army', 0, 1, 0, { carriedBy: t.id }));
    trimCargo(s, t, []);
    expect(cargoOf(s, t).map((u) => u.id)).toEqual([armies[0].id, armies[1].id]);
  });

  it('top-level units exclude cargo; refuel points are friendly cities and carriers', () => {
    const s = makeGame(rows);
    const c = addUnit(s, 'carrier', 0, 1, 0);
    const f = addUnit(s, 'fighter', 0, 1, 0, { carriedBy: c.id });
    expect(topLevelUnitsAt(s, 1, 0)).toEqual([c]);
    expect(isAtRefuelPoint(s, f)).toBe(true);
    const g = addUnit(s, 'fighter', 0, 0, 0);
    expect(isAtRefuelPoint(s, g)).toBe(true);
    const h = addUnit(s, 'fighter', 0, 5, 0);
    expect(isAtRefuelPoint(s, h)).toBe(false);
  });
});
