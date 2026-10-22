import { describe, it, expect } from 'vitest';
// The project's type check has no Node typings; this test only uses Node to check that files exist.
// @ts-ignore
import { existsSync } from 'node:fs';
import { UNIT_STATS, type UnitType } from '../../src/engine';
import { cardLines } from '../../src/ui/labels';

describe('unit cards', () => {
  it('list the unit numbers, with Range only for aircraft', () => {
    expect(cardLines('army')).toEqual(['Move 1', 'Attack 2', 'Defense 2', 'Hits 1']);
    expect(cardLines('fighter')).toEqual(['Move 5', 'Attack 2', 'Defense 2', 'Hits 1', 'Range 20']);
  });

  it('every unit type has a card picture in public/art', () => {
    for (const type of Object.keys(UNIT_STATS) as UnitType[]) {
      // @ts-ignore (the project's type check has no Node typings)
      expect(existsSync(`public/art/${type}.webp`), type).toBe(true);
    }
  });
});