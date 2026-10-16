import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { CLASSIC_RULES, RULES_VERSION } from '../../src/engine';
import { attackCity } from '../../src/engine/attack';
import { getPlayerView } from '../../src/engine/view';
import { resign } from '../../src/engine/turn';
import type { GameEvent } from '../../src/engine/types';
import { addUnit, fixedRng, makeGame } from '../helpers';

const M = ['*##...*', '###...#', '##*....'];
// Cities at (0,0) and (2,0) start for players 0 and 1; neutral city at (3,0).
const N = ['*#**', '####'];
const T = ['*.##.*', '..###.'];

describe('house rules and state version', () => {
  it('createGame defaults to classic rules', () => {
    const s = makeGame(M);
    expect(s.rules).toEqual(CLASSIC_RULES);
    expect(s.version).toBe(2);
    expect(RULES_VERSION).toBe(2);
  });

  it('exposes the rules in the player view', () => {
    const s = makeGame(M, { rules: { fairFirstTurn: true } });
    expect(getPlayerView(s, 0).rules).toEqual({ ...CLASSIC_RULES, fairFirstTurn: true });
  });
});

describe('classic turn-1 production', () => {
  it("classic: player 0's start city ticks at creation", () => {
    expect(makeGame(M).cities[0].progress).toBe(1);
  });

  it("classic: player 1's start city ticks on its turn-1 start", () => {
    const r = apply(makeGame(M), { type: 'endTurn', player: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cities[1].progress).toBe(1);
  });

  it('fair first turn: no city ticks on turn 1', () => {
    const s = makeGame(M, { rules: { fairFirstTurn: true } });
    expect(s.cities[0].progress).toBe(0);
    const r = apply(s, { type: 'endTurn', player: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cities[0].progress).toBe(0);
    expect(r.state.cities[1].progress).toBe(0);
  });
});

describe('easier neutral cities', () => {
  it('easier neutral cities: neutral city defends at 1', () => {
    const s = makeGame(N, { rules: { easierNeutralCities: true } });
    const a = addUnit(s, 'army', 0, 3, 1);
    attackCity(s, fixedRng(0.6), a, s.cities[2], []);
    expect(s.cities[2].owner).toBe(0);
  });

  it('easier neutral cities off: the same roll destroys the attacker', () => {
    const s = makeGame(N);
    const a = addUnit(s, 'army', 0, 3, 1);
    attackCity(s, fixedRng(0.6), a, s.cities[2], []);
    expect(s.cities[2].owner).toBeNull();
    expect(s.units).not.toContain(a);
  });

  it('easier neutral cities never applies to enemy-owned cities', () => {
    const s = makeGame(N, { rules: { easierNeutralCities: true } });
    s.cities[2].owner = 1;
    const a = addUnit(s, 'army', 0, 3, 1);
    attackCity(s, fixedRng(0.6), a, s.cities[2], []);
    expect(s.cities[2].owner).toBe(1);
    expect(s.units).not.toContain(a);
  });
});

describe('elimination timing', () => {
  it("elimination is checked only at the end of the player's own turn", () => {
    const s = makeGame(T);
    s.cities[1].owner = 0;
    const r = apply(s, { type: 'endTurn', player: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.players[1].eliminated).toBe(false);
    expect(r.state.currentPlayer).toBe(1);
    expect(r.events).not.toContainEqual({ type: 'playerEliminated', player: 1 });
    const end = apply(r.state, { type: 'endTurn', player: 1 });
    expect(end.ok).toBe(true);
    if (!end.ok) return;
    expect(end.state.players[1].eliminated).toBe(true);
    expect(end.events).toContainEqual({ type: 'playerEliminated', player: 1 });
    expect(end.events).toContainEqual({ type: 'gameOver', winner: 0 });
  });

  it('resign still eliminates immediately', () => {
    const s = makeGame(T);
    const events: GameEvent[] = [];
    resign(s, events);
    expect(s.players[0].eliminated).toBe(true);
    expect(events).toContainEqual({ type: 'playerEliminated', player: 0 });
  });
});
