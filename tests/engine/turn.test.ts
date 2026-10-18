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

  it('advances production only for the player whose turn starts; classic cities tick on turn 1', () => {
    const s = makeGame(T);
    expect(s.cities[0].progress).toBe(1); // classic: P0's start city ticks at creation
    endTurn(s, []); // P1 starts turn 1: classic start city ticks
    expect(s.cities[1].progress).toBe(1);
    expect(s.cities[0].progress).toBe(1);
    endTurn(s, []); // P0 starts turn 2
    expect(s.cities[0].progress).toBe(2);
    expect(s.cities[1].progress).toBe(1);
    endTurn(s, []); // P1 starts turn 2
    expect(s.cities[1].progress).toBe(2);
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
  it('a player with no cities and no units is eliminated at the end of their own turn and the survivor wins', () => {
    const s = makeGame(T);
    s.cities[1].owner = 0;
    const events: GameEvent[] = [];
    endTurn(s, events);
    expect(s.players[1].eliminated).toBe(false);
    expect(s.winner).toBeNull();
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

  it('a player with nothing left is eliminated when their own turn ends, leaving the other as winner', () => {
    const s = makeGame(['*#*#*'], { players: 3 });
    s.players[1].eliminated = true;
    for (const c of s.cities) c.owner = null;
    const events: GameEvent[] = [];
    endTurn(s, events);
    expect(s.players[0].eliminated).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(2);
    expect(events).toContainEqual({ type: 'playerEliminated', player: 0 });
    expect(events).toContainEqual({ type: 'gameOver', winner: 2 });
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

  describe('knock-out needs a unit that could take a city', () => {
    /** Player 0 has lost every city; player 1 holds the others. */
    function lost() {
      const s = makeGame(['*###*..']);
      s.cities[0].owner = 1;
      s.cities[1].owner = 1;
      return s;
    }

    it('a player left with only ships and fighters is knocked out when their turn ends, and those units go', () => {
      const s = lost();
      const ship = addUnit(s, 'cruiser', 0, 5, 0);
      const plane = addUnit(s, 'fighter', 0, 2, 0);
      const events: GameEvent[] = [];
      endTurn(s, events);
      expect(s.players[0].eliminated).toBe(true);
      expect(s.units).not.toContain(ship);
      expect(s.units).not.toContain(plane);
      expect(s.over).toBe(true);
      expect(s.winner).toBe(1);
    });

    it('an empty transport cannot take a city, so its owner is out', () => {
      const s = lost();
      addUnit(s, 'transport', 0, 5, 0);
      endTurn(s, []);
      expect(s.players[0].eliminated).toBe(true);
    });

    it('a player with an army, on land or aboard a transport, is still in', () => {
      const a = lost();
      addUnit(a, 'army', 0, 2, 0);
      endTurn(a, []);
      expect(a.players[0].eliminated).toBe(false);

      const b = lost();
      const t = addUnit(b, 'transport', 0, 5, 0);
      addUnit(b, 'army', 0, 5, 0, { carriedBy: t.id });
      endTurn(b, []);
      expect(b.players[0].eliminated).toBe(false);
    });

    it('a player with a city is in even with no units', () => {
      const s = makeGame(['*###*..']);
      endTurn(s, []);
      expect(s.players[0].eliminated).toBe(false);
    });
  });});
