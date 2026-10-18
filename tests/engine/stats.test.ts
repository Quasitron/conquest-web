import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine';
import { moveUnit } from '../../src/engine/movement';
import { destroyUnit } from '../../src/engine/query';
import { addUnit, attackerAlwaysHits, defenderAlwaysHits, makeGame } from '../helpers';

const MAP = ['*###*'];

describe('kill and loss counters', () => {
  it('start empty for every player and show in the player view', () => {
    const s = makeGame(MAP);
    expect(s.stats).toEqual([{ killed: {}, lost: {} }, { killed: {}, lost: {} }]);
    expect(getPlayerView(s, 0).stats).toEqual({ killed: {}, lost: {} });
  });

  it('a won attack is a kill for the attacker and a loss for the defender', () => {
    const s = makeGame(MAP);
    const a = addUnit(s, 'army', 0, 1, 0);
    addUnit(s, 'army', 1, 2, 0);
    expect(moveUnit(s, attackerAlwaysHits(), a, 2, [])).toBeNull();
    expect(s.stats![0].killed).toEqual({ army: 1 });
    expect(s.stats![1].lost).toEqual({ army: 1 });
    expect(s.stats![0].lost).toEqual({});
  });

  it('a lost attack is a loss for the attacker and a kill for the defender', () => {
    const s = makeGame(MAP);
    const a = addUnit(s, 'army', 0, 1, 0);
    addUnit(s, 'army', 1, 2, 0);
    expect(moveUnit(s, defenderAlwaysHits(), a, 2, [])).toBeNull();
    expect(s.stats![0].lost).toEqual({ army: 1 });
    expect(s.stats![1].killed).toEqual({ army: 1 });
  });

  it('a sunk transport counts its cargo too, as losses for its owner and kills for the sinker', () => {
    const s = makeGame(MAP);
    const t = addUnit(s, 'transport', 0, 2, 0);
    addUnit(s, 'army', 0, 2, 0, { carriedBy: t.id });
    addUnit(s, 'army', 0, 2, 0, { carriedBy: t.id });
    destroyUnit(s, t, 'combat', [], 1);
    expect(s.stats![0].lost).toEqual({ transport: 1, army: 2 });
    expect(s.stats![1].killed).toEqual({ transport: 1, army: 2 });
  });

  it('a crash is a loss with no kill; disbanding, resigning and a capturing army are not counted', () => {
    const s = makeGame(MAP);
    destroyUnit(s, addUnit(s, 'fighter', 0, 1, 0), 'crashed', []);
    destroyUnit(s, addUnit(s, 'army', 0, 1, 0), 'disbanded', []);
    destroyUnit(s, addUnit(s, 'army', 0, 1, 0), 'resigned', []);
    destroyUnit(s, addUnit(s, 'army', 0, 1, 0), 'garrison', []);
    expect(s.stats![0].lost).toEqual({ fighter: 1 });
    expect(s.stats![0].killed).toEqual({});
    expect(s.stats![1].killed).toEqual({});
  });

  it('a game saved before the counters existed starts counting from the first event', () => {
    const s = makeGame(MAP);
    delete s.stats;
    expect(getPlayerView(s, 0).stats).toEqual({ killed: {}, lost: {} });
    destroyUnit(s, addUnit(s, 'army', 0, 1, 0), 'combat', [], 1);
    expect(s.stats![0].lost).toEqual({ army: 1 });
    expect(s.stats![1].killed).toEqual({ army: 1 });
  });
});
