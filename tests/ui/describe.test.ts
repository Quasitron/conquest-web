import { describe, it, expect } from 'vitest';
import { describeEvent } from '../../src/ui/describe';

const names = ['Ann', 'Ben'];

describe('describeEvent', () => {
  it('describes key events from the viewer perspective', () => {
    expect(describeEvent({ type: 'cityCaptured', cityId: 3, by: 0, from: null }, 0, names)).toBe('You captured a city.');
    expect(describeEvent({ type: 'cityCaptured', cityId: 3, by: 1, from: 0 }, 0, names)).toBe('Ben captured one of your cities!');
    expect(describeEvent({ type: 'unitProduced', unitId: 1, cityId: 0, unitType: 'army' }, 0, names)).toBe('New Army ready.');
    expect(describeEvent({ type: 'gameOver', winner: null }, 0, names)).toBe('Game over: no survivors.');
    expect(describeEvent({ type: 'gameOver', winner: 1 }, 0, names)).toBe('Ben wins!');
    expect(describeEvent({ type: 'unitMoved', unitId: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, 0, names)).toBeNull();
    expect(
      describeEvent({ type: 'unitDestroyed', unitId: 4, owner: 0, unitType: 'fighter', reason: 'crashed' }, 0, names),
    ).toBe('Your Fighter ran out of fuel and crashed.');
  });

  it('turnStarted is not described', () => {
    expect(describeEvent({ type: 'turnStarted', turn: 3, player: 1 }, 0, names)).toBeNull();
  });

  it('ordersEnded reasons read as plain text', () => {
    const text = (reason: 'arrived' | 'blocked' | 'enemySighted' | 'lowFuel' | 'nothingToExplore') =>
      describeEvent({ type: 'ordersEnded', unitId: 12, owner: 0, reason }, 0, names, () => 'army');
    expect(text('arrived')).toBe('Army 12 stopped: arrived.');
    expect(text('blocked')).toBe('Army 12 stopped: path blocked.');
    expect(text('enemySighted')).toBe('Army 12 stopped: enemy sighted.');
    expect(text('lowFuel')).toBe('Army 12 stopped: low fuel.');
    expect(text('nothingToExplore')).toBe('Army 12 stopped: nothing left to explore.');
    expect(describeEvent({ type: 'ordersEnded', unitId: 12, owner: 0, reason: 'arrived' }, 0, names)).toBe('Unit 12 stopped: arrived.');
  });

  it('cargoUnloaded counts units', () => {
    expect(describeEvent({ type: 'cargoUnloaded', transportId: 5, owner: 0, unitIds: [1, 2, 3] }, 0, names)).toBe(
      'Transport 5 unloaded 3 unit(s).',
    );
  });

  it('describes combat', () => {
    const text = describeEvent(
      {
        type: 'combat', attackerId: 1, attackerOwner: 1, attackerType: 'destroyer',
        defender: { kind: 'unit', unitId: 2, owner: 0, unitType: 'transport' },
        x: 0, y: 0, attackerWon: true, attackerDamage: 1, defenderDamage: 3,
      },
      0,
      names,
    );
    expect(text).toBe("Ben's Destroyer attacked your Transport and won.");
  });
});
