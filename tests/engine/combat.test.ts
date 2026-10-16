import { describe, it, expect } from 'vitest';
import { combatWinChance, resolveCombat } from '../../src/engine/combat';
import { Rng } from '../../src/engine/rng';
import { fixedRng } from '../helpers';

const army = { attack: 2, defense: 2, shot: 1, hits: 1, damage: 0 };

describe('resolveCombat', () => {
  it('army vs army is roughly a coin flip', () => {
    const rng = new Rng(123);
    let wins = 0;
    for (let i = 0; i < 10000; i++) if (resolveCombat(army, army, rng).attackerWon) wins++;
    expect(wins / 10000).toBeGreaterThan(0.47);
    expect(wins / 10000).toBeLessThan(0.53);
  });

  it('is deterministic for a given seed', () => {
    const a = new Rng(9), b = new Rng(9);
    const cruiser = { attack: 2, shot: 2, hits: 8, damage: 0 };
    const transport = { defense: 1, shot: 1, hits: 3, damage: 0 };
    for (let i = 0; i < 50; i++) expect(resolveCombat(cruiser, transport, a)).toEqual(resolveCombat(cruiser, transport, b));
  });

  it('applies shot damage per hit and counts existing damage', () => {
    const cruiser = { attack: 2, shot: 2, hits: 8, damage: 1 };
    const transport = { defense: 1, shot: 1, hits: 3, damage: 0 };
    // attacker hit (2), defender hit (+1 → 2), attacker hit (4 ≥ 3) → transport sunk
    const r = resolveCombat(cruiser, transport, fixedRng(0, 0.99, 0));
    expect(r).toEqual({ attackerWon: true, attackerDamage: 2, defenderDamage: 4 });
  });

  it('a battleship bombarding an army (defense halved to 1) almost always wins', () => {
    const rng = new Rng(4);
    const bs = { attack: 2, shot: 3, hits: 12, damage: 0 };
    let wins = 0;
    for (let i = 0; i < 2000; i++) if (resolveCombat(bs, { ...army, defense: 1 }, rng).attackerWon) wins++;
    expect(wins / 2000).toBeGreaterThan(0.99);
  });
});

describe('combatWinChance', () => {
  const att = { attack: 2, shot: 1, hits: 1, damage: 0 };

  it('is 0.5 for equal strength and one hit each', () => {
    expect(combatWinChance(att, { defense: 2, shot: 1, hits: 1, damage: 0 })).toBe(0.5);
  });

  it('is 2/3 when the attacker is twice as strong', () => {
    expect(combatWinChance(att, { defense: 1, shot: 1, hits: 1, damage: 0 })).toBeCloseTo(2 / 3, 9);
  });

  it('win and lose chances sum to 1', () => {
    const a = { attack: 3, shot: 1, hits: 3, damage: 1 };
    const d = { defense: 2, shot: 2, hits: 3, damage: 0 };
    const win = combatWinChance(a, d);
    const lose = combatWinChance(
      { attack: d.defense, shot: d.shot, hits: d.hits, damage: d.damage },
      { defense: a.attack, shot: a.shot, hits: a.hits, damage: a.damage },
    );
    expect(win + lose).toBeCloseTo(1, 12);
    expect(win).toBeGreaterThan(0);
    expect(win).toBeLessThan(1);
  });
});
