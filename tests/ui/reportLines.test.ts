import { describe, it, expect } from 'vitest';
import { getPlayerView, type GameEvent } from '../../src/engine';
import { soundsForEvents } from '../../src/audio/fromEvents';
import { fightsFromEvents } from '../../src/ui/fights';
import type { LogEntry } from '../../src/app/session';
import { battlesAgainstMe, newEliminations, recentSightings } from '../../src/ui/reportLines';
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

describe('newEliminations', () => {
  const out = (turn: number, player: number): LogEntry => ({ turn, event: { type: 'playerEliminated', player } });

  it('lists the other players knocked out since the start of your previous turn, once each, in order', () => {
    const log: LogEntry[] = [
      started(1, 0), started(1, 1), out(1, 2), // before the span: already announced
      started(2, 0), started(2, 1), out(2, 1), started(2, 2), out(2, 3), out(2, 3), // since my turn 2 began
      started(3, 0),
    ];
    expect(newEliminations(log, 0)).toEqual([1, 3]);
  });

  it('never lists yourself, and is empty when nothing happened or the log is empty (as after a reload)', () => {
    expect(newEliminations([started(1, 0), out(1, 0), started(2, 0)], 0)).toEqual([]);
    expect(newEliminations([started(1, 0), started(1, 1), started(2, 0)], 0)).toEqual([]);
    expect(newEliminations([], 0)).toEqual([]);
  });
});
describe('promotion sound at turn start', () => {
  const promoted = { type: 'unitPromoted', unitId: 5, owner: 0, unitType: 'cruiser', rank: 1 } as const;
  const started = { type: 'turnStarted', player: 0, turn: 9 } as const;

  it('is held back from the turn-start batch when the replay will play it, and plays at once otherwise', () => {
    const batch = [promoted, started];
    expect(soundsForEvents(batch, 0)).toContain('promote'); // no replay: as before
    expect(soundsForEvents(batch, 0, { promoteLater: true })).not.toContain('promote');
    // In the middle of your own turn (no turn start in the batch) the chime is never held back.
    expect(soundsForEvents([promoted], 0, { promoteLater: true })).toContain('promote');
  });

  it('a replayed fight knows when a promotion came out of it', () => {
    const events = [
      { type: 'combat', attackerId: 9, attackerOwner: 1, attackerType: 'cruiser', from: { x: 3, y: 1 }, defender: { kind: 'unit', unitId: 5, owner: 0, unitType: 'cruiser' }, x: 2, y: 1, attackerWon: false, attackerDamage: 8, defenderDamage: 2 },
      { type: 'unitDestroyed', unitId: 9, owner: 1, unitType: 'cruiser', reason: 'combat' },
      promoted,
    ] as GameEvent[];
    const fights = fightsFromEvents(events, () => 'text');
    expect(fights).toHaveLength(1);
    expect(fights[0].promoted).toBe(true);
    expect(fightsFromEvents(events.slice(0, 2), () => 'text')[0].promoted).toBeUndefined();
  });
});