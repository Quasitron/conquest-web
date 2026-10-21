import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine';
import { addUnit, makeGame } from '../helpers';

const MAP = ['*###*'];

describe('players with no city left, in the player view', () => {
  it('lists nobody while every player still holds a city', () => {
    expect(getPlayerView(makeGame(MAP), 0).cityless).toEqual([]);
  });

  it('lists a rival with no city, with just how many units it has left', () => {
    const s = makeGame(MAP);
    s.cities[1].owner = 0; // player 1 loses its last city
    addUnit(s, 'transport', 1, 2, 0);
    addUnit(s, 'army', 1, 2, 0);
    addUnit(s, 'army', 0, 1, 0);
    expect(getPlayerView(s, 0).cityless).toEqual([{ id: 1, name: 'P1', units: 2 }]);
    // The player without a city is not told about itself.
    expect(getPlayerView(s, 1).cityless).toEqual([]);
  });

  it('does not list a player that has been eliminated', () => {
    const s = makeGame(MAP);
    s.cities[1].owner = 0;
    s.players[1].eliminated = true;
    expect(getPlayerView(s, 0).cityless).toEqual([]);
  });
});
