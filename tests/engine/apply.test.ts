import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { hashState } from '../../src/engine/hash';
import { index } from '../../src/engine/map';
import type { Command, Dir } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];

describe('apply', () => {
  it('never mutates the input state', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    const before = hashState(s);
    const r = apply(s, { type: 'move', player: 0, unitId: a.id, dir: 2 });
    expect(r.ok).toBe(true);
    expect(hashState(s)).toBe(before);
  });

  it('rejects malformed or unauthorized commands without changing state', () => {
    const s = makeGame(M);
    const mine = addUnit(s, 'army', 0, 1, 1);
    const theirs = addUnit(s, 'army', 1, 5, 1);
    const bad: Command[] = [
      { type: 'move', player: 0, unitId: theirs.id, dir: 2 },
      { type: 'move', player: 0, unitId: 9999, dir: 2 },
      { type: 'move', player: 0, unitId: mine.id, dir: 9 as Dir },
      { type: 'move', player: 0, unitId: mine.id, dir: 1.5 as Dir },
      { type: 'setProduction', player: 0, cityId: 1, unitType: 'army' },
      { type: 'setProduction', player: 0, cityId: 0, unitType: 'tank' as never },
      { type: 'setProduction', player: 0, cityId: 42, unitType: 'army' },
      { type: 'disband', player: 0, unitId: theirs.id },
      { type: 'endTurn', player: 1 },
      { type: 'launch' } as unknown as Command,
      null as unknown as Command,
      'endTurn' as unknown as Command,
    ];
    const before = hashState(s);
    for (const cmd of bad) {
      const r = apply(s, cmd);
      expect(r.ok, JSON.stringify(cmd)).toBe(false);
      expect(hashState(s), JSON.stringify(cmd)).toBe(before);
    }
  });

  it('rejections from inside moveUnit leave state unchanged', () => {
    const s = makeGame(M);
    const tired = addUnit(s, 'army', 0, 1, 1, { movesLeft: 0 });
    const shore = addUnit(s, 'army', 0, 2, 1);
    const before = hashState(s);
    const cmds: Command[] = [
      { type: 'move', player: 0, unitId: tired.id, dir: 2 },
      { type: 'move', player: 0, unitId: shore.id, dir: 2 },
    ];
    for (const cmd of cmds) {
      expect(apply(s, cmd).ok, JSON.stringify(cmd)).toBe(false);
      expect(hashState(s), JSON.stringify(cmd)).toBe(before);
    }
  });

  it('rejects everything once the game is over', () => {
    const s = makeGame(M);
    s.over = true;
    expect(apply(s, { type: 'endTurn', player: 0 }).ok).toBe(false);
  });

  it('a move reveals new squares for the mover', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    expect(s.fog[0].explored[index(s, 3, 1)]).toBe(0);
    const r = apply(s, { type: 'move', player: 0, unitId: a.id, dir: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.fog[0].explored[index(s, 3, 1)]).toBe(1);
  });

  it('end turn and disband work through apply', () => {
    const s = makeGame(M);
    const a = addUnit(s, 'army', 0, 1, 1);
    const r1 = apply(s, { type: 'disband', player: 0, unitId: a.id });
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.state.units).toHaveLength(0);
    const r2 = apply(r1.state, { type: 'endTurn', player: 0 });
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.currentPlayer).toBe(1);
    expect(r2.events).toContainEqual({ type: 'turnStarted', player: 1, turn: 1 });
  });

  it('refuses to end the turn while an aircraft sits on an occupied square', () => {
    const s = makeGame(M);
    addUnit(s, 'destroyer', 0, 4, 1);
    const f = addUnit(s, 'fighter', 0, 3, 1);
    const r1 = apply(s, { type: 'move', player: 0, unitId: f.id, dir: 2 });
    if (!r1.ok) throw new Error(r1.error);
    const r2 = apply(r1.state, { type: 'endTurn', player: 0 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/occupied/);
    const r3 = apply(r1.state, { type: 'move', player: 0, unitId: f.id, dir: 2 });
    if (!r3.ok) throw new Error(r3.error);
    expect(apply(r3.state, { type: 'endTurn', player: 0 }).ok).toBe(true);
  });
});
