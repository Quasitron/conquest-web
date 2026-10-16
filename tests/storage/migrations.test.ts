import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/app/session';
import { RULES_VERSION, apply, type Command, type GameState } from '../../src/engine';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen';
import {
  MemorySaveStore, OLDER_VERSION_NOTE, migrateSave, migrateState1to2, parseSave, serializeSave, type SaveFile,
} from '../../src/storage';
import { addUnit, makeGame } from '../helpers';

const seats = [
  { name: 'Ann', kind: 'human' as const, color: '#d7263d' },
  { name: 'Bot', kind: 'idle' as const, color: '#1b98e0' },
];

function downgrade(st: GameState): Record<string, unknown> {
  const o = structuredClone(st) as unknown as Record<string, unknown>;
  delete o.rules;
  o.version = 1;
  for (const u of o.units as Record<string, unknown>[]) {
    delete u.orders;
    delete u.unloadNextTurn;
  }
  return o;
}

function format1Save(): Record<string, unknown> {
  const initial = makeGame(['*##...*', '###...#', '##*....']);
  addUnit(initial, 'army', 0, 1, 1);
  const cmds: Command[] = [{ type: 'endTurn', player: 0 }];
  let s: GameState = initial;
  for (const c of cmds) {
    const r = apply(s, c);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return { format: 1, savedAt: '2026-10-14T12:00:00.000Z', name: 'old', seats, initial: downgrade(initial), commands: cmds, snapshot: downgrade(s) };
}

function format2Save(): SaveFile {
  const initial = makeGame(['*##...*', '###...#', '##*....']);
  const u = addUnit(initial, 'army', 0, 1, 1);
  const commands: Command[] = [{ type: 'move', player: 0, unitId: u.id, dir: 2 }, { type: 'endTurn', player: 0 }];
  let s: GameState = initial;
  for (const c of commands) {
    const r = apply(s, c);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return { format: 2, rulesVersion: RULES_VERSION, savedAt: '2026-10-16T12:00:00.000Z', name: 'new', seats, initial, commands, snapshot: s };
}

describe('migrations', () => {
  it('migrateState1to2 adds rules (fairFirstTurn true) and unit fields', () => {
    const g = makeGame(['*##...*', '###...#', '##*....']);
    addUnit(g, 'army', 0, 1, 1);
    const old = downgrade(g);
    const m = migrateState1to2(old);
    expect(m.version).toBe(2);
    expect(m.rules).toEqual({ easierNeutralCities: false, fairFirstTurn: true, sentriedStayAsGarrison: false });
    const units = m.units as Record<string, unknown>[];
    expect(units.length).toBeGreaterThan(0);
    for (const u of units) {
      expect(u.orders).toBeNull();
      expect(u.unloadNextTurn).toBe(false);
    }
  });

  it('migrateSave upgrades format 1, passes format 2 through and rejects others', () => {
    const up = migrateSave(format1Save());
    expect(up.ok && up.save.format).toBe(2);
    expect(up.ok && up.save.rulesVersion).toBe(1);
    const same = migrateSave({ ...format2Save() });
    expect(same.ok && same.save.rulesVersion).toBe(RULES_VERSION);
    expect(migrateSave({ format: 3 })).toEqual({ ok: false, error: 'unsupported save format' });
  });

  it('a format-1 save loads from its snapshot with the note and an empty history', () => {
    const old = format1Save();
    const r = parseSave(JSON.stringify(old));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.note).toBe(OLDER_VERSION_NOTE);
    expect(r.save.format).toBe(2);
    expect(r.save.rulesVersion).toBe(RULES_VERSION);
    expect(r.save.commands).toEqual([]);
    expect(r.save.initial).toEqual(r.save.snapshot);
    expect(r.save.snapshot.turn).toBe((old.snapshot as { turn: number }).turn);
    expect(r.save.snapshot.rules.fairFirstTurn).toBe(true);
  });

  it('a format-1 save object from the store loads via parseSave(serializeSave(...))', async () => {
    const store = new MemorySaveStore();
    await store.put(format1Save() as unknown as SaveFile);
    const stored = await store.get('old');
    expect(stored).toBeDefined();
    const r = parseSave(serializeSave(stored as SaveFile));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.note).toBe(OLDER_VERSION_NOTE);
  });

  it('a format-2 save round-trips with replay verification and no note', () => {
    const r = parseSave(serializeSave(format2Save()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.note).toBeUndefined();
    expect(r.save.commands).toHaveLength(2);
  });

  it('a corrupted format-2 history is rejected', () => {
    const bad = format2Save();
    bad.snapshot.turn = 99;
    expect(parseSave(serializeSave(bad)).ok).toBe(false);
  });

  it('format 3 is rejected as unsupported', () => {
    const r = parseSave(JSON.stringify({ ...format2Save(), format: 3 }));
    expect(r).toEqual({ ok: false, error: 'unsupported save format' });
  });

  it('a format-2 save with missing or malformed rules is rejected', () => {
    const noRules = JSON.parse(serializeSave(format2Save())) as Record<string, Record<string, unknown>>;
    delete noRules.snapshot.rules;
    expect(parseSave(JSON.stringify(noRules)).ok).toBe(false);
    const badRules = JSON.parse(serializeSave(format2Save())) as Record<string, Record<string, unknown>>;
    badRules.initial.rules = { easierNeutralCities: 1, fairFirstTurn: true, sentriedStayAsGarrison: false };
    expect(parseSave(JSON.stringify(badRules)).ok).toBe(false);
  });
});

describe('GameSession and house rules', () => {
  const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.small };

  it('GameSession.create passes house rules into the game', () => {
    const s = GameSession.create({ world, seed: 5, seats, rules: { easierNeutralCities: true } }, null);
    expect(s.state.rules).toEqual({ easierNeutralCities: true, fairFirstTurn: false, sentriedStayAsGarrison: false });
    expect(s.toSave().rulesVersion).toBe(RULES_VERSION);
    expect(s.toSave().format).toBe(2);
  });

  it('fromSave exposes the note as session.notice', () => {
    const r = parseSave(JSON.stringify(format1Save()));
    if (!r.ok) throw new Error(r.error);
    expect(GameSession.fromSave(r.save, null, r.note).notice).toBe(OLDER_VERSION_NOTE);
    expect(GameSession.fromSave(r.save, null).notice).toBeNull();
  });
});