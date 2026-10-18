import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GameEvent } from '../../src/engine';
import type { LogEntry } from '../../src/app/session';
import {
  COMBAT_MODE_KEY, DEFAULT_COMBAT_MODE, DEFAULT_REPLAY_PACE, REPLAY_PACE_KEY, REPORT_AFTER_KEY, getCombatMode,
  getReplayPace, getReportAfter, resetCombatMode, setCombatMode, setReplayPace, setReportAfter,
} from '../../src/ui/combatMode';
import {
  FIGHT_MS, IMPORTANT_FACTOR, PACE_MS, REPLAY_CAP, SHOT_SHARE, fightFrame, fightImportant, fightsFromEvents, placeNote,
  replayFights, stepDuration, type Fight,
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
  const base: Fight = { at: { x: 0, y: 0 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser', attackerWon: true, destroyed: false, captured: false, text: 't' };

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

describe('replay pace and the report after the replay', () => {
  beforeEach(() => { resetCombatMode(); });
  afterEach(() => { resetCombatMode(); vi.unstubAllGlobals(); });

  it('default to normal pace with the report opening afterwards, and remember changes', () => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } });
    expect(getReplayPace()).toBe(DEFAULT_REPLAY_PACE);
    expect(DEFAULT_REPLAY_PACE).toBe('normal');
    expect(getReportAfter()).toBe(true);
    setReplayPace('manual');
    setReportAfter(false);
    expect([m.get(REPLAY_PACE_KEY), m.get(REPORT_AFTER_KEY)]).toEqual(['manual', 'false']);
    resetCombatMode();
    expect(getReplayPace()).toBe('manual');
    expect(getReportAfter()).toBe(false);
  });

  it('ignore junk in storage and survive storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'whenever', setItem: () => { throw new Error('blocked'); } });
    expect(getReplayPace()).toBe('normal');
    expect(getReportAfter()).toBe(true);
    expect(() => setReplayPace('fast')).not.toThrow();
    expect(() => setReportAfter(false)).not.toThrow();
    expect(getReplayPace()).toBe('fast');
    expect(getReportAfter()).toBe(false);
  });
});

describe('how long each fight is held', () => {
  const fight = (over: Partial<Fight> = {}): Fight => ({
    at: { x: 0, y: 0 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser', attackerWon: true,
    destroyed: false, captured: false, text: 't', ...over,
  });

  it('holds routine fights for the pace time, and the ones that matter longer', () => {
    expect(stepDuration('normal', fight(), 0)).toBe(PACE_MS.normal);
    expect(stepDuration('fast', fight(), 0)).toBe(PACE_MS.fast);
    expect(stepDuration('slow', fight({ destroyed: true }), 0)).toBe(Math.round(PACE_MS.slow! * IMPORTANT_FACTOR));
    expect(stepDuration('normal', fight({ captured: true }), 0)).toBe(Math.round(PACE_MS.normal! * IMPORTANT_FACTOR));
  });

  it('waits for the player in manual', () => {
    expect(stepDuration('manual', fight({ captured: true }), 0)).toBeNull();
  });

  it('counts a kill as important only when it involves you; any city capture is', () => {
    expect(fightImportant(fight({ destroyed: true, defenderOwner: 0 }), 0)).toBe(true);
    expect(fightImportant(fight({ destroyed: true, attackerOwner: 0, defenderOwner: 1 }), 0)).toBe(true);
    expect(fightImportant(fight({ destroyed: true, attackerOwner: 2, defenderOwner: 1 }), 0)).toBe(false);
    expect(fightImportant(fight({ captured: true, attackerOwner: 2, defenderOwner: null }), 0)).toBe(true);
    expect(fightImportant(fight(), 0)).toBe(false);
  });
});

describe('placeNote', () => {
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const cities = [{ name: 'Far Town', x: 40, y: 0 }, { name: 'Norfolk Island', x: 30, y: 1 }, { name: 'Close Bay', x: 31, y: 2 }];

  it('names the closest city within range', () => {
    expect(placeNote({ x: 29, y: 1 }, cities, dist)).toBe('near Norfolk Island');
    expect(placeNote({ x: 33, y: 3 }, cities, dist)).toBe('near Close Bay');
  });

  it('says nothing when no city is close', () => {
    expect(placeNote({ x: 0, y: 40 }, cities, dist)).toBeNull();
    expect(placeNote({ x: 29, y: 1 }, [], dist)).toBeNull();
  });
});
