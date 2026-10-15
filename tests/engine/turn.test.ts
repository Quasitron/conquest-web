import { describe, it, expect } from 'vitest';
import { endTurn, resign } from '../../src/engine/turn';
import type { GameEvent } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

const T = ['*.##.*', '..###.'];

describe('turn sequence', () => {
  it('passes play in order and advances the turn counter after the last player', () => {
    const s = makeGame(T);
    const events: GameEvent[] = [];
    endTurn(s, events);
    expect(s).toMatchObject({ currentPlayer: 1, turn: 1 });
    expect(events).toContainEqual({ type: 'turnStarted', player: 1, turn: 1 });
    endTurn(s, []);
    expect(s).toMatchObject({ currentPlayer: 0, turn: 2 });
  });

  it('resets moves at turn start; crippled units get 1', () => {
    const s = makeGame(T);
    const t = addUnit(s, 'transport', 1, 4, 1, { damage: 2, movesLeft: 0 });
    const d = addUnit(s, 'destroyer', 1, 1, 1, { movesLeft: 0, movedThisTurn: true });
    endTurn(s, []);
    expect(t.movesLeft).toBe(1);
    expect(d).toMatchObject({ movesLeft: 3, movedThisTurn: false });
  });

  it('advances production only for the player whose turn starts, from turn 2', () => {
    const s = makeGame(T);
    endTurn(s, []); // P1 starts turn 1: no production on turn 1
    expect(s.cities[1].progress).toBe(0);
    endTurn(s, []); // P0 starts turn 2
    expect(s.cities[0].progress).toBe(1);
    expect(s.cities[1].progress).toBe(0);
    endTurn(s, []); // P1 starts turn 2
    expect(s.cities[1].progress).toBe(1);
  });

  it('in-flight aircraft burn unused moves and crash when out of fuel', () => {
    const s = makeGame(T);
    const low = addUnit(s, 'fighter', 0, 1, 1, { fuel: 3 });
    const ok = addUnit(s, 'fighter', 0, 4, 0, { fuel: 10 });
    const home = addUnit(s, 'fighter', 0, 0, 0, { fuel: 20 });
    const events: GameEvent[] = [];
    endTurn(s, events);
    expect(s.units).not.toContain(low);
    expect(events).toContainEqual(expect.objectContaining({ type: 'unitDestroyed', unitId: low.id, reason: 'crashed' }));
    expect(ok.fuel).toBe(5);
    expect(home.fuel).toBe(20);
  });

  it('repairs units that spent the whole turn in a friendly city', () => {
    const s = makeGame(T);
    const rested = addUnit(s, 'transport', 0, 0, 0, { damage: 2 });
    const arrived = addUnit(s, 'transport', 0, 0, 0, { damage: 2, movedThisTurn: true });
    endTurn(s, []);
    expect(rested.damage).toBe(1);
    expect(arrived.damage).toBe(2);
  });
});

describe('elimination and victory', () => {
  it('a player with no cities and no units is eliminated and the survivor wins', () => {
    const s = makeGame(T);
    s.cities[1].owner = 0;
    const events: GameEvent[] = [];
    endTurn(s, events);
    expect(s.players[1].eliminated).toBe(true);
    expect(s.winner).toBe(0);
    expect(events).toContainEqual({ type: 'playerEliminated', player: 1 });
    expect(events).toContainEqual({ type: 'gameOver', winner: 0 });
  });

  it('a player with units but no cities stays in the game', () => {
    const s = makeGame(T);
    s.cities[1].owner = 0;
    addUnit(s, 'destroyer', 1, 4, 1);
    endTurn(s, []);
    expect(s.players[1].eliminated).toBe(false);
    expect(s.winner).toBeNull();
  });

  it('skips eliminated players', () => {
    const s = makeGame(['*#*#*'], { players: 3 });
    s.players[1].eliminated = true;
    s.cities[1].owner = null;
    endTurn(s, []);
    expect(s.currentPlayer).toBe(2);
  });

  it('resigning removes units, frees cities and passes play', () => {
    const s = makeGame(['*#*#*'], { players: 3 });
    const u = addUnit(s, 'army', 0, 1, 0);
    resign(s, []);
    expect(s.units).not.toContain(u);
    expect(s.cities[0].owner).toBeNull();
    expect(s.players[0].eliminated).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.winner).toBeNull();
  });

  it('ends the game with no winner when every player is eliminated at once', () => {
    const s = makeGame(['*#*#*'], { players: 3 });
    s.players[1].eliminated = true;
    for (const c of s.cities) c.owner = null;
    const events: GameEvent[] = [];
    endTurn(s, events);
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
    expect(events).toContainEqual({ type: 'gameOver', winner: null });
  });

  it('a sole survivor sets winner and over', () => {
    const s = makeGame(T);
    resign(s, []);
    expect(s.over).toBe(true);
  });

  it('resigning in a two-player game hands victory to the opponent', () => {
    const s = makeGame(T);
    resign(s, []);
    expect(s.winner).toBe(1);
  });
});
