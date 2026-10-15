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
