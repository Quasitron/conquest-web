import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import type { Command, GameState } from '../../src/engine/types';
import { MemorySaveStore, parseSave, serializeSave, type SaveFile } from '../../src/storage';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];
const seats = [
  { name: 'Ann', kind: 'human' as const, color: '#d7263d' },
  { name: 'Bot', kind: 'idle' as const, color: '#1b98e0' },
];

function sampleSave(name = 'slot'): SaveFile {
  const initial = makeGame(M);
  const u = addUnit(initial, 'army', 0, 1, 1);
  const commands: Command[] = [{ type: 'move', player: 0, unitId: u.id, dir: 2 }, { type: 'endTurn', player: 0 }];
  let s: GameState = initial;
  for (const c of commands) {
    const r = apply(s, c);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return { format: 1, savedAt: '2026-10-14T12:00:00.000Z', name, seats, initial, commands, snapshot: s };
}

describe('parseSave', () => {
  it('accepts a valid save', () => {
    const r = parseSave(serializeSave(sampleSave()));
    expect(r.ok).toBe(true);
  });

  it('rejects bad JSON, wrong format, tampering and seat mismatch', () => {
    const good = sampleSave();
    expect(parseSave('{nope').ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...good, format: 2 })).ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...good, commands: 'x' })).ok).toBe(false);
    const tampered = structuredClone(good);
    tampered.snapshot.turn = 99;
    const t = parseSave(serializeSave(tampered));
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toMatch(/damaged/);
    expect(parseSave(JSON.stringify({ ...good, seats: [seats[0]] })).ok).toBe(false);
    expect(parseSave(JSON.stringify({ ...good, commands: [{ type: 'move', player: 0, unitId: 999, dir: 0 }] })).ok).toBe(false);
  });
});

describe('MemorySaveStore', () => {
  it('puts, lists newest first, gets and deletes', async () => {
    const store = new MemorySaveStore();
    await store.put({ ...sampleSave('a'), savedAt: '2026-10-14T10:00:00.000Z' });
    await store.put({ ...sampleSave('b'), savedAt: '2026-10-14T11:00:00.000Z' });
    expect((await store.list()).map((x) => x.name)).toEqual(['b', 'a']);
    expect((await store.list())[0].turn).toBe(1);
    expect((await store.get('a'))?.name).toBe('a');
    await store.delete('a');
    expect(await store.get('a')).toBeUndefined();
  });

  it('returns copies so callers cannot mutate stored saves', async () => {
    const store = new MemorySaveStore();
    await store.put(sampleSave('a'));
    const got = await store.get('a');
    got!.snapshot.turn = 50;
    expect((await store.get('a'))!.snapshot.turn).toBe(1);
  });
});
