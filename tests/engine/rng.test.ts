import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/engine/rng';

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).toEqual(sb);
  });

  it('produces different sequences for different seeds', () => {
    expect(new Rng(1).next()).not.toEqual(new Rng(2).next());
  });

  it('returns values in [0, 1) with a mean near 0.5', () => {
    const r = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
  });

  it('resumes from a saved state', () => {
    const a = new Rng(5);
    a.next();
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toEqual(a.next());
  });
});
