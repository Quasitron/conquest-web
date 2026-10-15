import { describe, it, expect } from 'vitest';
import { validateMapSize } from '../../src/engine/limits';

describe('validateMapSize', () => {
  it('accepts sizes within 20x20..150x200', () => {
    expect(validateMapSize(20, 20)).toBeNull();
    expect(validateMapSize(150, 200)).toBeNull();
    expect(validateMapSize(60, 45)).toBeNull();
  });
  it('rejects sizes outside the limits or non-integers', () => {
    expect(validateMapSize(19, 40)).toMatch(/at least/);
    expect(validateMapSize(40, 201)).toMatch(/at most/);
    expect(validateMapSize(40.5, 40)).toMatch(/whole/);
  });
});
