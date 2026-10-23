import { describe, it, expect } from 'vitest';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, TUNING, leftIdle, tuningFor } from '../../src/ai/difficulty';

describe('difficulty levels', () => {
  it('a seat with no difficulty plays at Normal', () => {
    expect(DEFAULT_DIFFICULTY).toBe('normal');
    expect(tuningFor(undefined)).toBe(TUNING.normal);
    for (const d of DIFFICULTIES) expect(tuningFor(d)).toBe(TUNING[d]);
  });

  it('Easy asks for more before it acts and Hard for less, with Normal in between', () => {
    const { easy, normal, hard } = TUNING;
    expect(easy.assaultArmies).toBeGreaterThan(normal.assaultArmies);
    expect(normal.assaultArmies).toBeGreaterThan(hard.assaultArmies);
    expect(easy.armiesToSail).toBeGreaterThan(normal.armiesToSail);
    expect(easy.fleetFromTurn).toBeGreaterThan(normal.fleetFromTurn);
    expect(normal.fleetFromTurn).toBeGreaterThan(hard.fleetFromTurn);
    expect(easy.maxWarships).toBeLessThan(normal.maxWarships);
    expect(normal.maxWarships).toBeLessThan(hard.maxWarships);
    expect(easy.minShipWinChance).toBeGreaterThan(normal.minShipWinChance);
    expect(easy.idlePercent).toBeGreaterThan(0);
    expect(normal.idlePercent).toBe(0);
    expect(hard.idlePercent).toBe(0);
  });

  it('leaves units idle at about the chosen rate, the same way every time, and never at 0', () => {
    let idle = 0;
    for (let id = 1; id <= 50; id++) for (let turn = 1; turn <= 40; turn++) if (leftIdle(id, turn, 25)) idle++;
    expect(idle / 2000).toBeGreaterThan(0.18);
    expect(idle / 2000).toBeLessThan(0.32);
    expect(leftIdle(7, 12, 25)).toBe(leftIdle(7, 12, 25));
    for (let id = 1; id <= 50; id++) expect(leftIdle(id, 3, 0)).toBe(false);
  });
});