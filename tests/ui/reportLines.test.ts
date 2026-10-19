import { describe, it, expect } from 'vitest';
import { getPlayerView, type GameEvent } from '../../src/engine';
import type { LogEntry } from '../../src/app/session';
import { battlesAgainstMe, recentSightings } from '../../src/ui/reportLines';
import { addUnit, makeGame } from '../helpers';

const names = ['You', 'Computer'];
const lookup = { unit: () => undefined, city: () => undefined };

const started = (turn: number, player: number): LogEntry => ({ turn, event: { type: 'turnStarted', player, turn } });
const combat = (turn: number, attackerOwner: number, won: boolean, x = 3, y = 1): LogEntry => ({
  turn,
  event: {
    type: 'combat', attackerId: 9, attackerOwner, attackerType: 'cruiser',
    defender: { kind: 'unit', unitId: 4, owner: attackerOwner === 0 ? 1 : 0, unitType: 'army' },
    x, y, attackerWon: won, attackerDamage: 0, defenderDamage: 1,
  } satisfies GameEvent,
});

describe('battlesAgainstMe', () => {
  it('lists battles others started since the start of your previous turn, not your own or older ones', () => {
    const log: LogEntry[] = [
      started(1, 0), combat(1, 0, true), // my own turn 1 attack
      started(1, 1), combat(1, 1, true, 5, 2), combat(1, 1, false, 6, 2), // computer's turn 1
      started(2, 0), // my turn 2 now under way
    ];
    const lines = battlesAgainstMe(log, 0, names, lookup);
    expect(lines.map((l) => l.at)).toEqual([{ x: 5, y: 2 }, { x: 6, y: 2 }]);
    expect(lines.map((l) => l.attackerWon)).toEqual([true, false]);
    expect(lines[0].text).toBe("Computer's Cruiser attacked your Army and won.");
  });

  it('gives each line its fight, so the report can play it again', () => {
    const log: LogEntry[] = [
      started(1, 0), combat(1, 0, true), // my own attack is not a line, and must not shift the fights
      started(1, 1), combat(1, 1, true, 5, 2), combat(1, 1, false, 6, 2),
      started(2, 0),
    ];
    const lines = battlesAgainstMe(log, 0, names, lookup);
    expect(lines.map((l) => l.fight?.at)).toEqual([{ x: 5, y: 2 }, { x: 6, y: 2 }]);
    expect(lines.map((l) => l.fight?.attackerWon)).toEqual([true, false]);
  });

  it('does not repeat fights from before your previous turn started', () => {
    const log: LogEntry[] = [
      started(1, 0), started(1, 1), combat(1, 1, true, 1, 1), // old
      started(2, 0), started(2, 1), combat(2, 1, true, 8, 3), // since my turn 2
      started(3, 0),
    ];
    expect(battlesAgainstMe(log, 0, names, lookup).map((l) => l.at)).toEqual([{ x: 8, y: 3 }]);
  });

  it('is empty when there is nothing (as after a reload)', () => {
    expect(battlesAgainstMe([], 0, names, lookup)).toEqual([]);
    expect(battlesAgainstMe([started(1, 0)], 0, names, lookup)).toEqual([]);
  });
});

describe('recentSightings', () => {
  it('lists enemy units in sight now first, then recent sightings, and leaves out old ones', () => {
    const s = makeGame(['*....*']);
    const near = addUnit(s, 'destroyer', 1, 1, 0);
    const far = addUnit(s, 'transport', 1, 4, 0);
    const old = addUnit(s, 'cruiser', 1, 5, 0);
    s.turn = 10;
    s.fog[0].lastSeen[near.id] = { unitId: near.id, type: 'destroyer', owner: 1, x: 1, y: 0, turnSeen: 10 };
    s.fog[0].lastSeen[far.id] = { unitId: far.id, type: 'transport', owner: 1, x: 4, y: 0, turnSeen: 9 };
    s.fog[0].lastSeen[old.id] = { unitId: old.id, type: 'cruiser', owner: 1, x: 5, y: 0, turnSeen: 4 };
    const list = recentSightings(getPlayerView(s, 0), names);
    expect(list.map((x) => x.type)).toEqual(['destroyer', 'transport']);
    expect(list[0]).toMatchObject({ owner: 'Computer', at: { x: 1, y: 0 }, turnSeen: 10 });
  });
});
