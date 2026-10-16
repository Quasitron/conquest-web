import { describe, it, expect } from 'vitest';
import type { UnitType } from '../../src/engine';
import { describeEvent } from '../../src/ui/describe';

const names = ['Ann', 'Ben'];
const units: Record<number, { type: UnitType; name: string }> = {
  142: { type: 'army', name: '142nd Army' },
  3: { type: 'carrier', name: '3rd Carrier' },
  7: { type: 'fighter', name: '7th Fighter' },
  8: { type: 'fighter', name: '8th Fighter' },
  9: { type: 'fighter', name: '9th Fighter' },
  12: { type: 'army', name: '12th Army' },
};
const lookup = {
  unit: (id: number) => units[id],
  city: (id: number) => (id === 3 ? 'Paris' : undefined),
};

describe('describeEvent', () => {
  it('describes key events from the viewer perspective', () => {
    expect(describeEvent({ type: 'cityCaptured', cityId: 3, by: 0, from: null }, 0, names, lookup)).toBe('You captured Paris.');
    expect(describeEvent({ type: 'cityCaptured', cityId: 3, by: 1, from: 0 }, 0, names, lookup)).toBe('Ben captured Paris, one of your cities!');
    expect(describeEvent({ type: 'cityCaptured', cityId: 3, by: 1, from: null }, 0, names, lookup)).toBe('Ben captured Paris.');
    expect(describeEvent({ type: 'cityCaptured', cityId: 4, by: 0, from: null }, 0, names, lookup)).toBe('You captured a city.');
    expect(describeEvent({ type: 'unitProduced', unitId: 12, cityId: 3, unitType: 'army' }, 0, names, lookup)).toBe('Paris produced 12th Army.');
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

  it('ordersEnded reads as plain text', () => {
    const text = (reason: 'arrived' | 'blocked' | 'enemySighted' | 'lowFuel' | 'nothingToExplore' | 'cityFound' | 'returning', unitId = 142) =>
      describeEvent({ type: 'ordersEnded', unitId, owner: 0, reason }, 0, names, lookup);
    expect(text('arrived')).toBe('142nd Army arrived.');
    expect(text('returning', 7)).toBe('7th Fighter low on fuel: heading home.');
    expect(text('blocked')).toBe('142nd Army stopped: path blocked.');
    expect(text('enemySighted')).toBe('142nd Army stopped: enemy sighted.');
    expect(text('lowFuel')).toBe('142nd Army stopped: low on fuel.');
    expect(text('nothingToExplore')).toBe('142nd Army stopped: nothing left to explore.');
    expect(text('cityFound')).toBe('142nd Army stopped: found a city.');
    expect(text('arrived', 55)).toBe('Unit 55 arrived.');
    expect(describeEvent({ type: 'ordersEnded', unitId: 12, owner: 0, reason: 'arrived' }, 0, names)).toBe('Unit 12 arrived.');
  });

  it('cargoUnloaded names the transport and summarizes the cargo', () => {
    expect(describeEvent({ type: 'cargoUnloaded', transportId: 3, owner: 0, unitIds: [7, 8] }, 0, names, lookup)).toBe(
      '3rd Carrier unloaded 2 Fighters.',
    );
    expect(describeEvent({ type: 'cargoUnloaded', transportId: 3, owner: 0, unitIds: [142, 7, 9] }, 0, names, lookup)).toBe(
      '3rd Carrier unloaded 1 Army, 2 Fighters.',
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
