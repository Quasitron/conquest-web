import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine/view';
import { updateFog } from '../../src/engine/fog';
import { approachSquare, attackLabel, cityAttackChance, landingPlan, strikeIsSurprise, strikeLabel, unitAttackChance } from '../../src/ui/plans';
import { addUnit, makeGame } from '../helpers';

function viewOf(s: ReturnType<typeof makeGame>) {
  updateFog(s, 0);
  s.fog[0].explored.fill(1);
  return getPlayerView(s, 0);
}

/** Transport (id) and the view, with `n` armies aboard. */
function boat(rows: string[], at: { x: number; y: number }, n: number, patch: Parameters<typeof addUnit>[5][] = []) {
  const s = makeGame(rows);
  const t = addUnit(s, 'transport', 0, at.x, at.y);
  const armies = Array.from({ length: n }, (_, i) => addUnit(s, 'army', 0, at.x, at.y, { carriedBy: t.id, ...(patch[i] ?? {}) }));
  return { s, t, armies };
}

const plan = (v: ReturnType<typeof viewOf>, tid: number, ids: number[]) =>
  landingPlan(v, v.myUnits.find((u) => u.id === tid)!, ids);

describe('landingPlan', () => {
  // Own city (0,0), player 1's city (4,0). Transport at (2,1): NE (3,0) and W (1,1) and NW (1,0) are land.
  const COAST = ['*#.#*', '.#...', '#....'];

  it('assigns armies in id order to the first free land square in direction order', () => {
    const { s, t, armies } = boat(COAST, { x: 2, y: 1 }, 2);
    const v = viewOf(s);
    expect(plan(v, t.id, [armies[1].id, armies[0].id])).toEqual([
      { unitId: armies[0].id, dir: 1 },
      { unitId: armies[1].id, dir: 6 },
    ]);
  });

  it('skips squares with an enemy marker', () => {
    const { s, t, armies } = boat(COAST, { x: 2, y: 1 }, 1);
    const v = viewOf(s);
    v.enemies.push({ markerId: 0, type: 'fighter', owner: 1, x: 3, y: 0, turnSeen: v.turn, visibleNow: false });
    expect(plan(v, t.id, [armies[0].id])).toEqual([{ unitId: armies[0].id, dir: 6 }]);
  });

  it('skips squares holding an own top-level unit', () => {
    const { s, t, armies } = boat(COAST, { x: 2, y: 1 }, 1);
    addUnit(s, 'army', 0, 3, 0);
    const v = viewOf(s);
    expect(plan(v, t.id, [armies[0].id])).toEqual([{ unitId: armies[0].id, dir: 6 }]);
  });

  it('never picks a neutral city but does pick an own city', () => {
    // Cities: (0,0) own, (2,0) neutral, (4,0) player 1.
    const s = makeGame(['*.*.*', '.....'], { starts: [0, 2] });
    const t = addUnit(s, 'transport', 0, 1, 1);
    const a = addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    const b = addUnit(s, 'army', 0, 1, 1, { carriedBy: t.id });
    const v = viewOf(s);
    expect(plan(v, t.id, [a.id, b.id])).toEqual([{ unitId: a.id, dir: 7 }, { unitId: b.id, dir: 7 }]);
  });

  it('excludes armies with no moves left', () => {
    const { s, t, armies } = boat(COAST, { x: 2, y: 1 }, 2, [{ movesLeft: 0 }]);
    const v = viewOf(s);
    expect(plan(v, t.id, armies.map((a) => a.id)).map((p) => p.unitId)).toEqual([armies[1].id]);
  });

  it('lands only one of two armies when the coast has one free square', () => {
    // Transport at (3,1): only (2,2) is own-landable land; (4,0) belongs to player 1.
    const s = makeGame(['*...*', '.....', '..#..'], { starts: [0, 1] });
    const t = addUnit(s, 'transport', 0, 3, 1);
    const a = addUnit(s, 'army', 0, 3, 1, { carriedBy: t.id });
    const b = addUnit(s, 'army', 0, 3, 1, { carriedBy: t.id });
    const v = viewOf(s);
    expect(plan(v, t.id, [a.id, b.id])).toEqual([{ unitId: a.id, dir: 5 }]);
  });
});

describe('approachSquare', () => {
  // Player 1's city at (6,0); its in-map neighbors are S (6,1), SW (5,1), W (5,0).
  const M = ['*#####*', '#######', '#######'];
  const from = (x: number, y: number, rows = M, city = { x: 6, y: 0 }) => {
    const s = makeGame(rows);
    const a = addUnit(s, 'army', 0, x, y);
    const v = viewOf(s);
    return approachSquare(v, v.myUnits.find((u) => u.id === a.id)!, city);
  };

  it('picks the nearest neighbor of the city', () => {
    expect(from(4, 2)).toEqual({ x: 5, y: 1 });
  });

  it('breaks a tie by direction order', () => {
    expect(from(6, 2)).toEqual({ x: 6, y: 1 });
  });

  it('returns null when already adjacent', () => {
    expect(from(5, 1)).toBeNull();
  });

  it('returns null when nothing is reachable', () => {
    expect(from(1, 1, ['*#..#*', '##..##'], { x: 5, y: 0 })).toBeNull();
  });
});

describe('attackLabel and cityAttackChance', () => {
  it('formats the label', () => {
    expect(attackLabel(0.5)).toBe('Attack (50%)');
    expect(attackLabel(0.667)).toBe('Attack (67%)');
    expect(attackLabel(null)).toBe('Attack');
  });

  it('marks odds against units as estimates, and works them out from both units\' stats', () => {
    expect(attackLabel(0.5, true)).toBe('Attack (~50%)');
    const s = makeGame(['*#*', '###']);
    const a = addUnit(s, 'army', 0, 1, 1);
    expect(unitAttackChance(a, 'army')).toBeCloseTo(0.5, 6); // equal units
    const wounded = addUnit(s, 'army', 0, 1, 1, { damage: 1 });
    expect(unitAttackChance(wounded, 'army')).toBeLessThan(0.5);
    const cruiser = addUnit(s, 'cruiser', 0, 1, 1);
    expect(unitAttackChance(cruiser, 'army')).toBeGreaterThan(unitAttackChance(cruiser, 'battleship'));
  });

  it('a fresh army has even odds against a neutral city, better with easier neutral cities', () => {
    const s = makeGame(['*#*', '###']);
    const a = addUnit(s, 'army', 0, 1, 1);
    const v = viewOf(s);
    expect(cityAttackChance(v, v.myUnits.find((x) => x.id === a.id)!, null)).toBeCloseTo(0.5, 6);
    const e = makeGame(['*#*', '###'], { rules: { easierNeutralCities: true } });
    const b = addUnit(e, 'army', 0, 1, 1);
    const ve = viewOf(e);
    const ub = ve.myUnits.find((x) => x.id === b.id)!;
    expect(cityAttackChance(ve, ub, null)).toBeCloseTo(2 / 3, 3);
    expect(cityAttackChance(ve, ub, 1)).toBeCloseTo(0.5, 6);
  });
});

describe('submarine strike label', () => {
  const SEA = ['*.........', '..........', '..........', '.........*'];
  const setup = (extra?: (s: ReturnType<typeof makeGame>) => void) => {
    const s = makeGame(SEA, { rules: { submarineStrike: true } });
    const sub = addUnit(s, 'submarine', 0, 4, 2);
    addUnit(s, 'battleship', 1, 5, 2);
    extra?.(s);
    updateFog(s, 0);
    const v = getPlayerView(s, 0);
    return { v, sub: v.myUnits.find((u) => u.id === sub.id)! };
  };

  it('is a surprise when nothing that sees submarines stands next to the sub', () => {
    const { v, sub } = setup();
    expect(strikeIsSurprise(v, sub, { type: 'battleship', owner: 1 })).toBe(true);
    expect(unitAttackChance(sub, 'battleship', 0, v.rules)).toBeGreaterThan(0.7);
    expect(strikeLabel(0.97)).toBe('Strike (~97%)');
  });

  it('is spoiled by an escorting cruiser (or destroyer or submarine) next to the sub, but not by one two squares off', () => {
    const near = setup((s) => { addUnit(s, 'cruiser', 1, 3, 2); });
    expect(strikeIsSurprise(near.v, near.sub, { type: 'battleship', owner: 1 })).toBe(false);
    const far = setup((s) => { addUnit(s, 'cruiser', 1, 6, 3); });
    expect(strikeIsSurprise(far.v, far.sub, { type: 'battleship', owner: 1 })).toBe(true);
  });
  it('applies only to the chosen targets and only with the rule on', () => {
    const { v, sub } = setup();
    expect(strikeIsSurprise(v, sub, { type: 'destroyer', owner: 1 })).toBe(false);
    expect(strikeIsSurprise({ ...v, rules: { ...v.rules, submarineStrike: false } }, sub, { type: 'battleship', owner: 1 })).toBe(false);
  });
});