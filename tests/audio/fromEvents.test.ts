import { describe, it, expect } from 'vitest';
import type { GameEvent } from '../../src/engine';
import { MAX_SOUNDS, produceSound, soundsForEvents } from '../../src/audio/fromEvents';

const combat: GameEvent = {
  type: 'combat', attackerId: 1, attackerOwner: 1, attackerType: 'cruiser',
  defender: { kind: 'unit', unitId: 2, owner: 0, unitType: 'army' },
  x: 1, y: 1, attackerWon: true, attackerDamage: 0, defenderDamage: 1,
};
const destroyed = (reason: 'combat' | 'crashed' | 'disbanded'): GameEvent =>
  ({ type: 'unitDestroyed', unitId: 2, owner: 0, unitType: 'army', reason });

describe('soundsForEvents', () => {
  it('each unit type has its own production sound, with chime for an unknown type', () => {
    for (const t of ['army', 'fighter', 'transport', 'destroyer', 'submarine', 'cruiser', 'battleship', 'carrier', 'armor']) {
      expect(produceSound(t)).toBe(`produce-${t}`);
    }
    expect(produceSound('zeppelin')).toBe('chime');
  });

  it('does not play production sounds in the turn-start batch (they play as each report opens)', () => {
    const built = (id: number): GameEvent => ({ type: 'unitProduced', unitId: id, cityId: 1, unitType: 'army' });
    expect(soundsForEvents([built(1), built(2), { type: 'turnStarted', player: 0, turn: 2 }], 0)).toEqual(['turn']);
  });

  it('plays nothing for quiet events', () => {
    expect(soundsForEvents([{ type: 'unitMoved', unitId: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }], 0)).toEqual([]);
    expect(soundsForEvents([], 0)).toEqual([]);
  });

  it('a fight is a shot, then an explosion when a unit died', () => {
    expect(soundsForEvents([combat], 2)).toEqual(['shot']);
    expect(soundsForEvents([combat, destroyed('combat')], 2)).toEqual(['shot', 'explosion']);
  });

  it('winning or losing a fight adds no sound of its own beyond the shot and any explosion', () => {
    // Player 1 attacked player 0's army and won.
    expect(soundsForEvents([combat, destroyed('combat')], 1)).toEqual(['shot', 'explosion']);
    expect(soundsForEvents([combat, destroyed('combat')], 0)).toEqual(['shot', 'explosion']);
    const defended: GameEvent = { ...(combat as object), attackerWon: false } as GameEvent;
    expect(soundsForEvents([defended], 0)).toEqual(['shot']);
    expect(soundsForEvents([defended], 1)).toEqual(['shot']);
    // Taking a city: the shot, a boom as it falls, then the fanfare (once).
    const taken: GameEvent = { type: 'cityCaptured', cityId: 1, by: 1, from: 0 };
    expect(soundsForEvents([combat, taken], 1)).toEqual(['shot', 'explosion', 'capture']);
    // If a unit already blew up in the same batch, that boom is the one.
    expect(soundsForEvents([combat, destroyed('combat'), taken], 1)).toEqual(['shot', 'explosion', 'capture']);
  });

  it('your own promotion chimes, and reaching Elite has its own sound; the enemy\'s is silent', () => {
    const promoted = (owner: number, rank: number) => ({ type: 'unitPromoted', unitId: 1, owner, rank }) as unknown as GameEvent;
    expect(soundsForEvents([promoted(0, 1)], 0)).toEqual(['promote']);
    expect(soundsForEvents([promoted(0, 2)], 0)).toEqual(['promote']);
    expect(soundsForEvents([promoted(0, 3)], 0)).toEqual(['promote-elite']);
    expect(soundsForEvents([promoted(1, 3)], 0)).toEqual([]);
  });

  it('a crash is its own sound; disbanding is silent', () => {
    expect(soundsForEvents([destroyed('crashed')], 0)).toEqual(['crash']);
    expect(soundsForEvents([destroyed('disbanded')], 0)).toEqual([]);
  });

  it('city capture is seen from each side', () => {
    const e: GameEvent = { type: 'cityCaptured', cityId: 1, by: 0, from: 1 };
    expect(soundsForEvents([e], 0)).toEqual(['explosion', 'capture']);
    expect(soundsForEvents([e], 1)).toEqual(['explosion', 'lost']);
    expect(soundsForEvents([e], 2)).toEqual([]); // a capture between two other players is not heard
    expect(soundsForEvents([{ type: 'cityCaptured', cityId: 1, by: 0, from: null }], 0)).toEqual(['explosion', 'capture']);
  });

  it('only my turn start, my unloads and my sightings count', () => {
    expect(soundsForEvents([{ type: 'turnStarted', player: 0, turn: 3 }], 0)).toEqual(['turn']);
    expect(soundsForEvents([{ type: 'turnStarted', player: 1, turn: 3 }], 0)).toEqual([]);
    expect(soundsForEvents([{ type: 'cargoUnloaded', transportId: 1, owner: 0, unitIds: [2] }], 0)).toEqual(['unload']);
    expect(soundsForEvents([{ type: 'cargoUnloaded', transportId: 1, owner: 1, unitIds: [2] }], 0)).toEqual([]);
    expect(soundsForEvents([{ type: 'ordersEnded', unitId: 1, owner: 0, reason: 'enemySighted' }], 0)).toEqual(['alert']);
    expect(soundsForEvents([{ type: 'ordersEnded', unitId: 1, owner: 0, reason: 'arrived' }], 0)).toEqual([]);
    expect(soundsForEvents([{ type: 'ordersEnded', unitId: 1, owner: 1, reason: 'enemySighted' }], 0)).toEqual([]);
  });

  it('game over is a win or a loss', () => {
    expect(soundsForEvents([{ type: 'gameOver', winner: 0 }], 0)).toEqual(['win']);
    expect(soundsForEvents([{ type: 'gameOver', winner: 1 }], 0)).toEqual(['lose']);
    expect(soundsForEvents([{ type: 'gameOver', winner: null }], 0)).toEqual(['lose']);
  });

  it('leaves out battle sounds when the batch ends with your turn starting (the Combat report covers them)', () => {
    const start: GameEvent = { type: 'turnStarted', player: 0, turn: 4 };
    expect(soundsForEvents([combat, destroyed('combat'), start], 0)).toEqual(['turn']);
    const lost: GameEvent = { type: 'cityCaptured', cityId: 1, by: 1, from: 0 };
    expect(soundsForEvents([combat, lost, start], 0)).toEqual(['lost', 'turn']);
    // Another player's turn starting does not count.
    expect(soundsForEvents([combat, { type: 'turnStarted', player: 1, turn: 4 }], 0)).toEqual(['shot']);
  });

  it('plays each sound once per batch, in order of first appearance', () => {
    const built = (id: number): GameEvent => ({ type: 'unitProduced', unitId: id, cityId: 1, unitType: 'army' });
    
    expect(soundsForEvents([combat, combat, destroyed('combat'), combat, destroyed('combat')], 2)).toEqual(['shot', 'explosion']);
  });

  it('caps a big batch, dropping the least important sounds first', () => {
    const events: GameEvent[] = [
      { type: 'unitProduced', unitId: 1, cityId: 1, unitType: 'army' },
      { type: 'cargoUnloaded', transportId: 1, owner: 0, unitIds: [2] },
      combat, destroyed('combat'), destroyed('crashed'),
      { type: 'ordersEnded', unitId: 1, owner: 0, reason: 'enemySighted' },
      { type: 'cityCaptured', cityId: 1, by: 1, from: 0 },
    ];
    const out = soundsForEvents(events, 0);
    expect(out.length).toBe(MAX_SOUNDS);
    expect(out).toContain('lost');
    expect(out).toContain('alert');
    expect(out).not.toContain('unload');
    // Order of appearance is kept.
    expect(out.length).toBe(MAX_SOUNDS);
    expect(out).toEqual(['explosion', 'crash', 'alert', 'lost']);
  });
});







