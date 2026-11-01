import { describe, it, expect } from 'vitest';
import { apply } from '../../src/engine/apply';
import { areFriendly, teammatesOf } from '../../src/engine/relations';
import { updateFog } from '../../src/engine/fog';
import { getPlayerView } from '../../src/engine/view';
import { cityAt } from '../../src/engine/query';
import { endTurn, resign } from '../../src/engine/turn';
import { pathMapFromView, findPath } from '../../src/engine/path';
import type { Command, GameState } from '../../src/engine/types';
import { addUnit, makeGame } from '../helpers';

// Three players with a city each at x = 0, 4 and 8 on a strip of land. Players 0 and 1 are allies (team 1); player 2 stands alone.
const ROW = ['*###*###*', '#########'];
function game(): GameState {
  const s = makeGame(ROW, { players: 3 });
  s.players[0].team = 1;
  s.players[1].team = 1;
  for (const p of s.players) updateFog(s, p.id);
  return s;
}

function run(s: GameState, cmd: Command) {
  const r = apply(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('teams', () => {
  it('make players on the same team friendly, and nobody else', () => {
    const s = game();
    expect(areFriendly(s, 0, 1)).toBe(true);
    expect(areFriendly(s, 1, 0)).toBe(true);
    expect(areFriendly(s, 0, 2)).toBe(false);
    expect(areFriendly(s, 2, 2)).toBe(true);
    expect(areFriendly(s, null, 0)).toBe(false);
    expect(teammatesOf(s, 0)).toEqual([1]);
    expect(teammatesOf(s, 2)).toEqual([]);
  });

  it('without teams nobody is an ally', () => {
    const s = makeGame(ROW, { players: 3 });
    expect(areFriendly(s, 0, 1)).toBe(false);
  });

  it('let an ally walk into your city without a fight, and an enemy attack it', () => {
    const s = game();
    const mine = addUnit(s, 'army', 0, 3, 0);
    const foe = addUnit(s, 'army', 2, 5, 0);
    s.currentPlayer = 0;
    const r = run(s, { type: 'move', player: 0, unitId: mine.id, dir: 2 }); // east, into player 1's city at x = 4
    expect(r.state.units.find((u) => u.id === mine.id)!.x).toBe(4);
    expect(r.events.some((e) => e.type === 'combat')).toBe(false);
    expect(cityAt(r.state, 4, 0)!.owner).toBe(1);
    r.state.currentPlayer = 2;
    const r2 = run(r.state, { type: 'move', player: 2, unitId: foe.id, dir: 6 }); // west, onto the city: a fight
    expect(r2.events.some((e) => e.type === 'combat')).toBe(true);
  });

  it('share sight: an ally\'s units show up on my map and are never enemies', () => {
    const s = game();
    const scout = addUnit(s, 'army', 1, 6, 1);
    updateFog(s, 1);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    expect(v.allies).toEqual([1]);
    expect(v.allyUnits.map((u) => u.id)).toContain(scout.id);
    expect(v.enemies.some((e) => e.owner === 1)).toBe(false);
    expect(v.terrain[1 * s.width + 7]).not.toBeNull(); // a square only the ally's army sees
    expect(getPlayerView(s, 2).allyUnits).toEqual([]);
  });

  it('show the ally\'s city as the ally\'s, and let paths run into it', () => {
    const s = game();
    const v = getPlayerView(s, 0);
    expect(v.knownCities.find((c) => c.x === 4)?.owner).toBe(1);
    const u = addUnit(s, 'army', 0, 3, 1);
    const view = getPlayerView(s, 0);
    const path = findPath(pathMapFromView(view), view.myUnits.find((x) => x.id === u.id)!, { x: 4, y: 0 });
    expect(path).not.toBeNull();
  });

  it('repair a damaged unit in an ally\'s city', () => {
    const s = game();
    const ship = addUnit(s, 'army', 0, 4, 0, { damage: 1 });
    s.currentPlayer = 0;
    endTurn(s, []);
    expect(ship.damage).toBe(0);
  });

  it('do not let a unit board an ally\'s transport by walking onto it', () => {
    const s = makeGame(['*#.#*#*', '#######'], { players: 3 });
    s.players[0].team = 1;
    s.players[1].team = 1;
    const boat = addUnit(s, 'transport', 1, 2, 0);
    const army = addUnit(s, 'army', 0, 3, 1);
    s.currentPlayer = 0;
    expect(boat.carriedBy).toBeNull();
    const r = apply(s, { type: 'move', player: 0, unitId: army.id, dir: 7 }); // north-west onto the boat's water square
    expect(r.ok).toBe(false); // an ally's boat is not ours to board
    expect(army.carriedBy).toBeNull();
  });

  it('end the game when only one team is left', () => {
    const s = game();
    s.currentPlayer = 2;
    resign(s, []);
    expect(s.over).toBe(true);
    expect(s.players[2].eliminated).toBe(true);
    expect([0, 1]).toContain(s.winner);
  });

  it('keep the game going while enemies of the team are still alive', () => {
    const s = game();
    s.currentPlayer = 1;
    resign(s, []);
    expect(s.over).toBe(false);
  });
});
