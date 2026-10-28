import { describe, expect, it } from 'vitest';
import { doublesDefense, fightRatings, findPath, parseAscii, pathMapFromState, reliefAt } from '../../src/engine';
import { moveUnit } from '../../src/engine/movement';
import { Rng } from '../../src/engine/rng';
import { DEFAULT_WORLD } from '../../src/mapgen/options';
import { generateWorld } from '../../src/mapgen/generate';
import { addUnit, makeGame } from '../helpers';

const ON = { advancedUnits: true };

describe('terrain (Advanced rules, Appendix III of the manual)', () => {
  it('reads rough, river, forest and mountain from a test map and keeps the land flag', () => {
    const m = parseAscii(['#rvfm.', '*#####']);
    expect(m.terrain.slice(0, 5)).toEqual(['land', 'land', 'land', 'land', 'land']);
    expect(m.relief).toEqual(['clear', 'rough', 'river', 'forest', 'mountain', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear', 'clear']);
    expect(parseAscii(['*#.']).relief).toBeUndefined();
  });

  it('doubles a land unit\'s defence in forest and on mountains against all but an Army, and in a river against Armor', () => {
    expect(doublesDefense('armor', 'army', 'forest')).toBe(true);
    expect(doublesDefense('fighter', 'army', 'mountain')).toBe(true);
    expect(doublesDefense('battleship', 'armor', 'forest')).toBe(true);
    expect(doublesDefense('army', 'army', 'forest')).toBe(false);
    expect(doublesDefense('army', 'army', 'mountain')).toBe(false);
    expect(doublesDefense('armor', 'army', 'river')).toBe(true);
    expect(doublesDefense('army', 'army', 'river')).toBe(false);
    expect(doublesDefense('fighter', 'army', 'river')).toBe(false);
    expect(doublesDefense('armor', 'army', 'rough')).toBe(false);
    expect(doublesDefense('armor', 'transport', 'forest')).toBe(false);
    expect(fightRatings(ON, 'armor', 'army', 'forest')).toEqual({ attack: 2, defense: 4 });
    expect(fightRatings({ advancedUnits: false }, 'armor', 'army', 'forest')).toEqual({ attack: 2, defense: 2 });
  });

  it('keeps Armor out of mountains but lets it attack units in them, and does not advance after a win', () => {
    const s = makeGame(['*#m#*'], { rules: ON });
    const tank = addUnit(s, 'armor', 0, 1, 0, { movesLeft: 2 });
    expect(reliefAt(s, 2, 0)).toBe('mountain');
    expect(moveUnit(s, new Rng(1), tank, 2, [])).toBe('Armor cannot enter mountains');
    expect(tank.movesLeft).toBe(2);
    const foe = addUnit(s, 'army', 1, 2, 0);
    const rng = { next: () => 0 } as never; // every roll goes the attacker's way
    expect(moveUnit(s, rng, tank, 2, [])).toBeNull();
    expect(s.units.includes(foe)).toBe(false);
    expect([tank.x, tank.y]).toEqual([1, 0]);
  });

  it('lets an Army walk into a mountain, and Armor too when the Advanced units rule is off', () => {
    const s = makeGame(['*#m#*'], { rules: ON });
    const army = addUnit(s, 'army', 0, 1, 0);
    expect(moveUnit(s, new Rng(1), army, 2, [])).toBeNull();
    expect([army.x, army.y]).toEqual([2, 0]);
    const t = makeGame(['*#m#*']);
    const tank = addUnit(t, 'armor', 0, 1, 0);
    expect(moveUnit(t, new Rng(1), tank, 2, [])).toBeNull();
    expect(tank.x).toBe(2);
  });

  it('spends the rest of an Armor\'s turn when it enters rough, river or forest ground, but not clear ground', () => {
    for (const ch of ['r', 'v', 'f']) {
      const s = makeGame([`*#${ch}#*`], { rules: ON });
      const tank = addUnit(s, 'armor', 0, 1, 0, { movesLeft: 2 });
      expect(moveUnit(s, new Rng(1), tank, 2, [])).toBeNull();
      expect(tank.movesLeft).toBe(0);
    }
    const clear = makeGame(['*###*'], { rules: ON });
    const tank = addUnit(clear, 'armor', 0, 1, 0, { movesLeft: 2 });
    expect(moveUnit(clear, new Rng(1), tank, 2, [])).toBeNull();
    expect(tank.movesLeft).toBe(1);
    const army = addUnit(makeGame(['*#f#*'], { rules: ON }), 'army', 0, 1, 0);
    expect(army.movesLeft).toBe(1);
  });

  it('plans Armor round a mountain range, while an Army goes straight through', () => {
    const s = makeGame(['*#m#*', '.#m#.', '.###.'], { rules: ON });
    const tank = addUnit(s, 'armor', 0, 1, 0);
    const army = addUnit(s, 'army', 0, 1, 0);
    s.fog[0].explored.fill(1);
    const map = pathMapFromState(s, 0);
    const tankPath = findPath(map, tank, { x: 3, y: 0 });
    const armyPath = findPath(map, army, { x: 3, y: 0 });
    expect(armyPath).toHaveLength(2);
    expect(tankPath).not.toBeNull();
    expect(tankPath!.some((p) => reliefAt(s, p.x, p.y) === 'mountain')).toBe(false);
    expect(tankPath!.length).toBeGreaterThan(2);
  });
});

describe('generated terrain', () => {
  const seed = 4242;
  const plain = generateWorld(DEFAULT_WORLD, seed);
  const rough = generateWorld(DEFAULT_WORLD, seed, true);

  it('is only made when asked, and leaves the coast and cities exactly as they were', () => {
    expect(plain.map.relief).toBeUndefined();
    expect(rough.map.relief).toHaveLength(DEFAULT_WORLD.width * DEFAULT_WORLD.height);
    expect(rough.map.terrain).toEqual(plain.map.terrain);
    expect(rough.map.cities).toEqual(plain.map.cities);
    expect(rough.startCityIndices).toEqual(plain.startCityIndices);
  });

  it('puts every kind of ground on land, leaves water and cities clear, and is repeatable', () => {
    const relief = rough.map.relief!;
    const kinds = new Set<string>();
    rough.map.terrain.forEach((t, i) => {
      if (t === 'land') kinds.add(relief[i]);
      else expect(relief[i]).toBe('clear');
    });
    expect([...kinds].sort()).toEqual(['clear', 'forest', 'mountain', 'river', 'rough']);
    expect(generateWorld(DEFAULT_WORLD, seed, true).map.relief).toEqual(relief);
    const land = rough.map.terrain.filter((t) => t === 'land').length;
    const share = (k: string) => relief.filter((r, i) => rough.map.terrain[i] === 'land' && r === k).length / land;
    expect(share('mountain')).toBeGreaterThan(0.03);
    expect(share('mountain')).toBeLessThan(0.12);
    expect(share('clear')).toBeGreaterThan(0.3);
  });
});
