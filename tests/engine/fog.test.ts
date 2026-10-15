import { describe, it, expect } from 'vitest';
import { updateFog, canPlayerSeeUnit } from '../../src/engine/fog';
import { getPlayerView } from '../../src/engine/view';
import { index } from '../../src/engine/map';
import { addUnit, makeGame } from '../helpers';

const land = ['*#####', '######', '#####*'];
const sea = ['*.....', '......', '.....*'];

describe('fog of war', () => {
  it('starts with only the area around the start city explored', () => {
    const s = makeGame(land);
    const ex = s.fog[0].explored;
    expect(ex[index(s, 0, 0)]).toBe(1);
    expect(ex[index(s, 1, 1)]).toBe(1);
    expect(ex[index(s, 3, 0)]).toBe(0);
  });

  it('records adjacent enemies, keeps the marker after losing sight, then expires it', () => {
    const s = makeGame(land);
    const mine = addUnit(s, 'army', 0, 2, 1);
    const theirs = addUnit(s, 'army', 1, 3, 1);
    updateFog(s, 0);
    expect(s.fog[0].lastSeen[theirs.id]).toMatchObject({ x: 3, y: 1, turnSeen: 1 });
    expect(getPlayerView(s, 0).enemies[0].visibleNow).toBe(true);

    mine.x = 0; mine.y = 1;
    updateFog(s, 0);
    expect(s.fog[0].lastSeen[theirs.id]).toBeDefined();
    expect(getPlayerView(s, 0).enemies[0].visibleNow).toBe(false);

    s.turn = 4;
    updateFog(s, 0);
    expect(s.fog[0].lastSeen[theirs.id]).toBeUndefined();
  });

  it('clears a marker when its square is seen empty', () => {
    const s = makeGame(land);
    addUnit(s, 'army', 0, 2, 1);
    const theirs = addUnit(s, 'army', 1, 3, 1);
    updateFog(s, 0);
    theirs.x = 5; theirs.y = 0;
    updateFog(s, 0);
    expect(s.fog[0].lastSeen[theirs.id]).toBeUndefined();
  });

  it('submarines are seen only by cities, destroyers, submarines and cruisers', () => {
    const s = makeGame(sea);
    addUnit(s, 'transport', 0, 2, 1);
    const sub = addUnit(s, 'submarine', 1, 3, 1);
    expect(canPlayerSeeUnit(s, 0, sub)).toBe(false);
    addUnit(s, 'destroyer', 0, 2, 0);
    expect(canPlayerSeeUnit(s, 0, sub)).toBe(true);
  });

  it('a submarine marker survives when only non-detecting units look at it', () => {
    const s = makeGame(sea);
    const d = addUnit(s, 'destroyer', 0, 2, 0);
    const sub = addUnit(s, 'submarine', 1, 3, 1);
    updateFog(s, 0);
    d.x = 0; d.y = 2;
    addUnit(s, 'transport', 0, 2, 1);
    updateFog(s, 0);
    expect(s.fog[0].lastSeen[sub.id]).toBeDefined();
  });

  it('submarines cannot spot land units', () => {
    const s = makeGame(land);
    addUnit(s, 'submarine', 0, 2, 1);
    const army = addUnit(s, 'army', 1, 3, 1);
    expect(canPlayerSeeUnit(s, 0, army)).toBe(false);
  });

  it('units inside cities and cargo are not visible; city owners are recorded', () => {
    const s = makeGame(land);
    addUnit(s, 'army', 0, 4, 2);
    const inCity = addUnit(s, 'army', 1, 5, 2);
    updateFog(s, 0);
    expect(s.fog[0].lastSeen[inCity.id]).toBeUndefined();
    expect(s.fog[0].knownCityOwner[1]).toBe(1);

    const s2 = makeGame(sea);
    addUnit(s2, 'destroyer', 0, 2, 1);
    const t = addUnit(s2, 'transport', 1, 3, 1);
    const cargo = addUnit(s2, 'army', 1, 3, 1, { carriedBy: t.id });
    expect(canPlayerSeeUnit(s2, 0, t)).toBe(true);
    expect(canPlayerSeeUnit(s2, 0, cargo)).toBe(false);
  });

  it('sees across the east-west seam on a wrapping map', () => {
    const s = makeGame(land, { wrap: true });
    addUnit(s, 'army', 0, 0, 1);
    const theirs = addUnit(s, 'army', 1, 5, 1);
    expect(canPlayerSeeUnit(s, 0, theirs)).toBe(true);
  });
});

describe('player view', () => {
  it('hides unexplored terrain and returns copies of own units', () => {
    const s = makeGame(land);
    const u = addUnit(s, 'army', 0, 1, 1);
    const v = getPlayerView(s, 0);
    expect(v.terrain[index(s, 0, 0)]).toBe('city');
    expect(v.terrain[index(s, 4, 0)]).toBeNull();
    v.myUnits[0].x = 99;
    expect(u.x).toBe(1);
    expect(v.knownCities).toEqual([{ id: 0, x: 0, y: 0, owner: 0 }]);
  });

  it('lists squares in sight and hides real enemy unit ids', () => {
    const s = makeGame(land);
    addUnit(s, 'army', 0, 2, 1);
    addUnit(s, 'army', 1, 3, 1);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    expect(v.visibleSquares).toContain(index(s, 0, 0));
    expect(v.visibleSquares).toContain(index(s, 3, 2));
    expect(v.visibleSquares).not.toContain(index(s, 5, 0));
    expect(v.enemies).toHaveLength(1);
    expect(v.enemies[0]).toMatchObject({ markerId: 0, type: 'army', owner: 1, x: 3, y: 1, visibleNow: true });
    expect('unitId' in v.enemies[0]).toBe(false);
  });
});
