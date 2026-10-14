import { describe, it, expect } from 'vitest';
import { parseAscii } from '../../src/engine/ascii';
import { step, neighbors, chebyshev, isCoastal, terrainAt } from '../../src/engine/map';

const rows = ['.....', '.###.', '.###.', '.###.', '.....'];
const m = (wrap: boolean) => ({ ...parseAscii(rows), wrap });

describe('parseAscii', () => {
  it('parses terrain and lists cities in row-major order', () => {
    const p = parseAscii(['*.#', '#.*']);
    expect(p.width).toBe(3);
    expect(p.height).toBe(2);
    expect(p.terrain).toEqual(['city', 'water', 'land', 'land', 'water', 'city']);
    expect(p.cities).toEqual([{ x: 0, y: 0 }, { x: 2, y: 1 }]);
  });

  it('rejects ragged rows and unknown characters', () => {
    expect(() => parseAscii(['..', '...'])).toThrow();
    expect(() => parseAscii(['.x.'])).toThrow();
  });
});

describe('map geometry', () => {
  it('step returns null off the edge of a non-wrapping map', () => {
    expect(step(m(false), 0, 1, 6)).toBeNull();
    expect(step(m(false), 1, 0, 0)).toBeNull();
    expect(step(m(false), 1, 1, 3)).toEqual({ x: 2, y: 2 });
  });

  it('step wraps east-west but not north-south on a wrapping map', () => {
    expect(step(m(true), 0, 1, 6)).toEqual({ x: 4, y: 1 });
    expect(step(m(true), 4, 1, 2)).toEqual({ x: 0, y: 1 });
    expect(step(m(true), 1, 0, 0)).toBeNull();
  });

  it('counts neighbors at corners', () => {
    expect(neighbors(m(false), 0, 0)).toHaveLength(3);
    expect(neighbors(m(true), 0, 0)).toHaveLength(5);
  });

  it('chebyshev distance wraps across the seam', () => {
    expect(chebyshev(m(true), { x: 0, y: 0 }, { x: 4, y: 1 })).toBe(1);
    expect(chebyshev(m(false), { x: 0, y: 0 }, { x: 4, y: 1 })).toBe(4);
  });

  it('detects coastal squares', () => {
    expect(isCoastal(m(false), 1, 1)).toBe(true);
    expect(isCoastal(m(false), 2, 2)).toBe(false);
    expect(terrainAt(m(false), 2, 2)).toBe('land');
  });
});
