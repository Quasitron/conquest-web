import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { GameEvent } from '../../src/engine';
import type { LogEntry } from '../../src/app/session';
import {
  COMBAT_MODE_KEY, DEFAULT_COMBAT_MODE, DEFAULT_REPLAY_PACE, REPLAY_PACE_KEY, REPORT_AFTER_KEY, getCombatMode,
  getReplayPace, getReportAfter, resetCombatMode, setCombatMode, setReplayPace, setReportAfter,
} from '../../src/ui/combatMode';
import {
  BURST_END, FIGHT_MS, IMPORTANT_FACTOR, PACE_MS, REPLAY_CAP, SHOT_SHARE, fightActors, fightFrame, fightImportant, fightsFromEvents, placeNote,
  replayFights, stepDuration, type Fight,
} from '../../src/ui/fights';

const names = ['You', 'Computer'];
const lookup = { unit: () => undefined, city: () => undefined };

const combat = (attackerOwner: number, won: boolean, x = 3, y = 1): GameEvent => ({
  type: 'combat', attackerId: 9, attackerOwner, attackerType: 'cruiser', from: { x: x + 1, y },
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
  const base: Fight = {
    at: { x: 0, y: 0 }, attackerId: 9, from: { x: 1, y: 0 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser', defenderType: 'army',
    attackerWon: true, moved: false, destroyed: false, captured: false, text: 't',
  };

  it('runs shots first, then the result burst, then ends', () => {
    expect(fightFrame(-1, base)).toBeNull();
    expect(fightFrame(FIGHT_MS, base)).toBeNull();
    const early = fightFrame(FIGHT_MS * SHOT_SHARE * 0.5, base)!;
    expect(early.burst).toBe(0);
    expect(early.shots).toBeCloseTo(0.5, 5);
    const mid = fightFrame(FIGHT_MS * 0.6, base)!;
    expect(mid.shots).toBe(1);
    expect(mid.burst).toBeGreaterThan(0);
    expect(mid.burst).toBeLessThan(1);
    expect(mid.slide).toBe(0);
    const late = fightFrame(FIGHT_MS * 0.9, base)!;
    expect(late.burst).toBe(1);
    expect(late.slide).toBeGreaterThan(0);
    expect(late.slide).toBeLessThan(1);
  });

  it('picks the outcome look from what happened', () => {
    const at = FIGHT_MS * 0.7;
    expect(fightFrame(at, base)!.outcome).toBe('hit');
    expect(fightFrame(at, { ...base, destroyed: true })!.outcome).toBe('explosion');
    expect(fightFrame(at, { ...base, struck: true })!.outcome).toBe('explosion'); // a torpedo hit that leaves the target afloat
    expect(fightFrame(at, { ...base, destroyed: true, captured: true })!.outcome).toBe('capture');
  });

  it('scales to a different duration (the replay steps run longer than your own fights)', () => {
    expect(fightFrame(1000, base, 1500)!.burst).toBeGreaterThan(0);
    expect(fightFrame(1000, base, 1500)!.slide).toBe(0);
    expect(fightFrame(1000, base)).toBeNull();
  });
});

describe('replay pace and the report after the replay', () => {
  beforeEach(() => { resetCombatMode(); });
  afterEach(() => { resetCombatMode(); vi.unstubAllGlobals(); });

  it('default to normal pace with the report not opening afterwards, and remember changes', () => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } });
    expect(getReplayPace()).toBe(DEFAULT_REPLAY_PACE);
    expect(DEFAULT_REPLAY_PACE).toBe('normal');
    expect(getReportAfter()).toBe(false);
    setReplayPace('manual');
    setReportAfter(true);
    expect([m.get(REPLAY_PACE_KEY), m.get(REPORT_AFTER_KEY)]).toEqual(['manual', 'true']);
    resetCombatMode();
    expect(getReplayPace()).toBe('manual');
    expect(getReportAfter()).toBe(true);
  });

  it('ignore junk in storage and survive storage that throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'whenever', setItem: () => { throw new Error('blocked'); } });
    expect(getReplayPace()).toBe('normal');
    expect(getReportAfter()).toBe(false);
    expect(() => setReplayPace('fast')).not.toThrow();
    expect(() => setReportAfter(true)).not.toThrow();
    expect(getReplayPace()).toBe('fast');
    expect(getReportAfter()).toBe(true);
  });
});

describe('how long each fight is held', () => {
  const fight = (over: Partial<Fight> = {}): Fight => ({
    at: { x: 0, y: 0 }, attackerId: 9, from: { x: 1, y: 0 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser',
    defenderType: 'army', attackerWon: true, moved: false, destroyed: false, captured: false, text: 't', ...over,
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

describe('both units in a fight', () => {
  const fight = (over: Partial<Fight> = {}): Fight => ({
    at: { x: 10, y: 5 }, attackerId: 9, from: { x: 8, y: 5 }, attackerOwner: 1, defenderOwner: 0, attackerType: 'cruiser',
    defenderType: 'army', attackerWon: true, moved: true, destroyed: true, captured: false, text: 't', ...over,
  });
  const frameAt = (share: number, f: Fight) => fightFrame(FIGHT_MS * share, f)!;
  const who = (f: Fight, share: number) => fightActors(f, frameAt(share, f)).map((a) => [a.type, a.x, a.y, Math.round(a.alpha * 100) / 100]);

  it('shows the attacker on its own square and the defender on theirs for the shots', () => {
    expect(who(fight(), SHOT_SHARE * 0.5)).toEqual([['cruiser', 8, 5, 1], ['army', 10, 5, 1]]);
  });

  it('fades the loser out in the burst while the winner stays put', () => {
    const [att, def] = fightActors(fight(), frameAt((SHOT_SHARE + BURST_END) / 2, fight()));
    expect([att.alpha, att.x]).toEqual([1, 8]);
    expect(def.alpha).toBeGreaterThan(0);
    expect(def.alpha).toBeLessThan(1);
    expect(fightActors(fight(), frameAt(BURST_END + 0.01, fight()))[1].alpha).toBe(0);
  });

  it('slides a winning attacker that moved into the loser\'s square at the end', () => {
    const f = fight();
    const half = fightActors(f, frameAt(BURST_END + (1 - BURST_END) / 2, f))[0];
    expect(half.x).toBeCloseTo(9, 1);
    expect(half.y).toBe(5);
    const nearEnd = fightActors(f, frameAt(0.999, f))[0];
    expect(nearEnd.x).toBeGreaterThan(9.9);
  });

  it('keeps a winner that did not move where it was', () => {
    const f = fight({ moved: false });
    expect(fightActors(f, frameAt(0.95, f))[0]).toMatchObject({ x: 8, y: 5, alpha: 1 });
  });

  it('removes a losing attacker and leaves the defender standing', () => {
    const f = fight({ attackerWon: false, moved: false });
    const late = fightActors(f, frameAt(BURST_END + 0.05, f));
    expect(late[0].alpha).toBe(0);
    expect(late[1]).toMatchObject({ x: 10, y: 5, alpha: 1 });
  });

  it('has only the attacker for a city defender, which slides in when it captures', () => {
    const f = fight({ defenderType: null, captured: true, moved: false });
    const actors = fightActors(f, frameAt(0.999, f));
    expect(actors).toHaveLength(1);
    expect(actors[0].x).toBeGreaterThan(9.9);
  });

  it('leaves out the attacker when its start square is unknown', () => {
    const f = fight({ from: null });
    expect(fightActors(f, frameAt(0.2, f)).map((a) => a.type)).toEqual(['army']);
  });

  it('notes from the events whether the winner moved into the loser\'s square', () => {
    const moved: GameEvent = { type: 'unitMoved', unitId: 9, from: { x: 4, y: 1 }, to: { x: 3, y: 1 } };
    const elsewhere: GameEvent = { type: 'unitMoved', unitId: 9, from: { x: 4, y: 1 }, to: { x: 5, y: 5 } };
    const other: GameEvent = { type: 'unitMoved', unitId: 77, from: { x: 4, y: 1 }, to: { x: 3, y: 1 } };
    expect(fightsFromEvents([combat(1, true), moved], describe1)[0]).toMatchObject({ moved: true, from: { x: 4, y: 1 }, defenderType: 'army' });
    expect(fightsFromEvents([combat(1, true), elsewhere], describe1)[0].moved).toBe(false);
    expect(fightsFromEvents([combat(1, true), other], describe1)[0].moved).toBe(false);
  });
});
