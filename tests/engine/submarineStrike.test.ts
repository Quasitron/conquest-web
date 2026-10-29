import { describe, expect, it } from 'vitest';
import { STRIKE_CHANCE, isStrikeTarget } from '../../src/engine';
import { attackUnit } from '../../src/engine/attack';
import { hitsOf } from '../../src/engine/units';
import type { GameEvent } from '../../src/engine';
import { addUnit, fixedRng, makeGame } from '../helpers';

const M = ['*.........', '..........', '..........', '.........*'];
const ON = { submarineStrike: true };

function setup(target: 'transport' | 'battleship' | 'carrier' | 'destroyer', rules: object = ON) {
  const s = makeGame(M, { rules });
  const sub = addUnit(s, 'submarine', 0, 4, 2);
  const foe = addUnit(s, target, 1, 5, 2);
  return { s, sub, foe };
}

describe('Submarine strike (house rule)', () => {
  it('only submarines striking transports, carriers and battleships', () => {
    expect(isStrikeTarget('submarine', 'transport')).toBe(true);
    expect(isStrikeTarget('submarine', 'carrier')).toBe(true);
    expect(isStrikeTarget('submarine', 'battleship')).toBe(true);
    expect(isStrikeTarget('submarine', 'destroyer')).toBe(false);
    expect(isStrikeTarget('destroyer', 'transport')).toBe(false);
  });

  it('a salvo that hits sinks a transport outright', () => {
    const { s, sub, foe } = setup('transport');
    const ev: GameEvent[] = [];
    expect(attackUnit(s, fixedRng(0), sub, foe, ev)).toBeNull();
    expect(s.units.some((u) => u.id === foe.id)).toBe(false);
    expect(ev.find((e) => e.type === 'combat')).toMatchObject({ attackerWon: true });
  });

  it('a salvo on a battleship damages it, and the sub slips one square away unharmed', () => {
    const { s, sub, foe } = setup('battleship');
    const ev: GameEvent[] = [];
    attackUnit(s, fixedRng(0), sub, foe, ev);
    expect(foe.damage).toBe(3);
    expect(sub.damage).toBe(0);
    expect(sub.movesLeft).toBe(0);
    expect(Math.max(Math.abs(sub.x - foe.x), Math.abs(sub.y - foe.y))).toBe(2);
    expect(Math.max(Math.abs(sub.x - 4), Math.abs(sub.y - 2))).toBe(1);
    expect(ev.find((e) => e.type === 'combat')).toMatchObject({ strike: true });
    expect(ev.some((e) => e.type === 'unitMoved' && e.unitId === sub.id)).toBe(true);
  });

  it('a salvo on a carrier costs it deck space', () => {
    const { s, sub, foe } = setup('carrier');
    attackUnit(s, fixedRng(0), sub, foe, []);
    expect(foe.damage).toBe(3);
  });

  it('a missed salvo is a normal fight', () => {
    const { s, sub, foe } = setup('transport');
    // First roll misses the salvo (>= chance); then the sub hits every round.
    const rolls = [STRIKE_CHANCE + 0.1, 0];
    attackUnit(s, fixedRng(...rolls), sub, foe, []);
    expect(s.units.some((u) => u.id === foe.id)).toBe(false); // the sub's 3 damage sinks it in one hit
  });

  it('no surprise when a destroyer next to the sub can see it', () => {
    const { s, sub, foe } = setup('battleship');
    addUnit(s, 'destroyer', 1, 3, 2);
    const ev: GameEvent[] = [];
    attackUnit(s, fixedRng(0), sub, foe, ev);
    expect(ev.find((e) => e.type === 'combat')).not.toMatchObject({ strike: true });
    // A normal fight runs to the end (the sub, hitting every round here, wins it); no slipping away.
    expect(s.units.some((u) => u.id === foe.id)).toBe(false);
    expect(hitsOf(foe)).toBe(12);
  });

  it('does nothing without the rule', () => {
    const { s, sub, foe } = setup('battleship', {});
    const ev: GameEvent[] = [];
    attackUnit(s, fixedRng(0.999), sub, foe, ev);
    expect(ev.find((e) => e.type === 'combat')).not.toMatchObject({ strike: true });
    expect(s.units.some((u) => u.id === sub.id)).toBe(false); // lost the fight
  });

  it('a sub with nowhere to slip to stays put', () => {
    const s = makeGame(['*..', '..*'], { rules: ON });
    const sub = addUnit(s, 'submarine', 0, 0, 1);
    const foe = addUnit(s, 'battleship', 1, 1, 1);
    attackUnit(s, fixedRng(0), sub, foe, []);
    expect(foe.damage).toBe(3);
    expect(sub.movesLeft).toBe(0);
  });
});
