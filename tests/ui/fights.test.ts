import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GameEvent } from '../../src/engine';
import type { LogEntry } from '../../src/app/session';
import {
  COMBAT_MODE_KEY, DEFAULT_COMBAT_MODE, getCombatMode, resetCombatMode, setCombatMode,
} from '../../src/ui/combatMode';
import {
  FIGHT_MS, REPLAY_CAP, SHOT_SHARE, fightFrame, fightsFromEvents, replayFights, type Fight,
} from '../../src/ui/fights';

const names = ['You', 'Computer'];
const lookup = { unit: () => undefined, city: () => undefined };

const combat = (attackerOwner: number, won: boolean, x = 3, y = 1): GameEvent => ({
  type: 'combat', attackerId: 9, attackerOwner, attackerType: 'cruiser',
  defender: { kind: 'unit', unitId: 4, owner: attackerOwner === 0 ? 1 : 0, unitType: 'army' },
  x, y, attackerWon: won, attackerDamage: 0, defenderDamage: 1,
});
const destroyed: GameEvent = { type: 'unitDestroyed', unitId: 4, owner: 0, unitType: 'army', reason: 'combat' };
const captured: GameEvent = { type: 'cityCaptured', cityId: 2, by: 1, from: 0 };
const started = (player: number, turn: number): LogEntry => ({ turn, event: { type: 'turnStarted', player, turn } });
const entry = (event: GameEvent, turn = 1): LogEntry => ({ turn, event });
const describe1 = () => 'fight';

describe('combat setting', () => {
  afterEach(() => { resetCombatMode(); vi.unstubAllGlobals(); });
  beforeEach(() => { resetCombatMode(); });

  it('defaults to animated and remembers a choice', () => {
    vi.stubGlobal('localStorage', (() => {
      const m = new Map<string, string>();
      return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
    })());
    expect(getCombatMode()).toBe(DEFAULT_COMBAT_MODE);
    expect(DEFAULT_COMBAT_MODE).toBe('animated');
    setCombatMode('reports');
    expect(globalThis.localStorage.getItem(COMBAT_MODE_KEY)).toBe('reports');
    resetCombatMode();
    expect(getCombatMode()).toBe('reports');
  });

  it('ignores junk in storage and survives storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'sideways', setItem: () => { throw new Error('blocked'); } });
    expect(getCombatMode()).toBe('animated');
    expect(() => setCombatMode('off')).not.toThrow();
    expect(getCombatMode()).toBe('off');
  });
});

describe('fightsFromEvents', () => {
  it('folds the destruction and capture that follow a combat into that fight', () => {
    const fights = fightsFromEvents([combat(1, true, 5, 2), destroyed, combat(1, false, 6, 2), combat(1, true, 7, 2), captured], describe1);
    expect(fights.map((f) => [f.at.x, f.attackerWon, f.destroyed, f.captured])).toEqual([
      [5, true, true, false], [6, false, false, false], [7, true, false, true],
    ]);
  });

  it('leaves out fights with no caption and ignores events before the first combat', () => {
    expect(fightsFromEvents([destroyed, combat(1, true)], () => null)).toEqual([]);
    expect(fightsFromEvents([destroyed, captured], describe1)).toEqual([]);
  });
});

describe('replayFights', () => {
  it('replays only fights others started since the start of the previous turn, in order', () => {
    const log: LogEntry[] = [
      started(0, 1), entry(combat(0, true, 1, 1)), // my own attack
      started(1, 1), entry(combat(1, true, 5, 2)), entry(destroyed), entry(combat(1, false, 6, 2)),
      started(0, 2),
    ];
    const r = replayFights(log, 0, names, lookup);
    expect(r.more).toBe(0);
    expect(r.steps.map((s) => [s.at.x, s.destroyed])).toEqual([[5, true], [6, false]]);
    expect(r.steps[0].text).toBe("Computer's Cruiser attacked your Army and won.");
  });

  it('does not repeat fights from before the previous turn started', () => {
    const log: LogEntry[] = [
      started(0, 1), started(1, 1), entry(combat(1, true, 1, 1)),
      started(0, 2), started(1, 2), entry(combat(1, true, 8, 3), 2),
      started(0, 3),
    ];
    expect(replayFights(log, 0, names, lookup).steps.map((s) => s.at.x)).toEqual([8]);
  });

  it('caps a long replay and counts the rest', () => {
    const log: LogEntry[] = [started(0, 1), started(1, 1)];
    for (let i = 0; i < REPLAY_CAP + 5; i++) log.push(entry(combat(1, true, i, 0)));
    log.push(started(0, 2));
    const r = replayFights(log, 0, names, lookup);
    expect(r.steps).toHaveLength(REPLAY_CAP);
    expect(r.more).toBe(5);
  });

  it('is empty when there is nothing, as after a reload', () => {
    expect(replayFights([], 0, names, lookup)).toEqual({ steps: [], more: 0 });
  });
});

describe('fightFrame', () => {
  const base: Fight = { at: { x: 0, y: 0 }, attackerOwner: 1, attackerType: 'cruiser', attackerWon: true, destroyed: false, captured: false, text: 't' };

  it('runs shots first, then the result burst, then ends', () => {
    expect(fightFrame(-1, base)).toBeNull();
    expect(fightFrame(FIGHT_MS, base)).toBeNull();
    const early = fightFrame(FIGHT_MS * SHOT_SHARE * 0.5, base)!;
    expect(early.burst).toBe(0);
    expect(early.shots).toBeCloseTo(0.5, 5);
    const late = fightFrame(FIGHT_MS * 0.9, base)!;
    expect(late.shots).toBe(1);
    expect(late.burst).toBeGreaterThan(0);
    expect(late.burst).toBeLessThan(1);
  });

  it('picks the outcome look from what happened', () => {
    const at = FIGHT_MS * 0.7;
    expect(fightFrame(at, base)!.outcome).toBe('hit');
    expect(fightFrame(at, { ...base, destroyed: true })!.outcome).toBe('explosion');
    expect(fightFrame(at, { ...base, destroyed: true, captured: true })!.outcome).toBe('capture');
  });

  it('scales to a different duration (the replay steps run longer than your own fights)', () => {
    expect(fightFrame(1000, base, 1500)!.burst).toBeGreaterThan(0);
    expect(fightFrame(1000, base)).toBeNull();
  });
});
