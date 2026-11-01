import { describe, it, expect } from 'vitest';
import { UNIT_STATS, UNIT_TYPES, isCrippled, attackRating, effectiveMove, cargoCapacity } from '../../src/engine/units';
import type { Unit, UnitType } from '../../src/engine/types';

function unit(type: UnitType, damage = 0): Unit {
  return { id: 1, type, owner: 0, x: 0, y: 0, damage, movesLeft: 0, fuel: null, carriedBy: null, movedThisTurn: false, orders: null, unloadNextTurn: false, name: null, blockedTurns: 0 };
}

describe('unit stats', () => {
  it('defines all twelve unit types', () => {
    expect(UNIT_TYPES).toHaveLength(12);
    for (const t of UNIT_TYPES) expect(UNIT_STATS[t]).toBeDefined();
  });

  it('only aircraft have range', () => {
    for (const t of UNIT_TYPES) {
      expect(UNIT_STATS[t].range !== null).toBe(UNIT_STATS[t].domain === 'air');
    }
  });

  it('a unit is crippled at half its hits or more', () => {
    expect(isCrippled(unit('transport', 1))).toBe(false);
    expect(isCrippled(unit('transport', 2))).toBe(true);
    expect(isCrippled(unit('battleship', 5))).toBe(false);
    expect(isCrippled(unit('battleship', 6))).toBe(true);
    expect(isCrippled(unit('cruiser', 0))).toBe(false);
  });

  it('a crippled unit attacks at half strength, only with the Advanced units rule', () => {
    const adv = { advancedUnits: true };
    expect(attackRating(adv, unit('battleship', 6), 4)).toBe(2);
    expect(attackRating(adv, unit('battleship', 5), 4)).toBe(4);
    expect(attackRating({ advancedUnits: false }, unit('battleship', 6), 4)).toBe(4);
  });

  it('crippled units move 1', () => {
    expect(effectiveMove(unit('destroyer', 0))).toBe(3);
    expect(effectiveMove(unit('destroyer', 2))).toBe(1);
  });

  it('damage reduces cargo capacity', () => {
    expect(cargoCapacity(unit('transport', 0))).toBe(6);
    expect(cargoCapacity(unit('transport', 2))).toBe(2);
    expect(cargoCapacity(unit('carrier', 3))).toBe(5);
    expect(cargoCapacity(unit('army', 0))).toBe(0);
  });
});
