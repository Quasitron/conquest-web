import { describe, it, expect } from 'vitest';
import { badgeMode, cityStackTop, healthText, pathLabel } from '../../src/ui/labels';
import { addUnit, makeGame } from '../helpers';

describe('pathLabel', () => {
  it('reports a missing path', () => {
    expect(pathLabel(5, null, null)).toBe('no known path');
    expect(pathLabel(5, null, 2)).toBe('no known path');
  });

  it('says this turn when the unit arrives now, otherwise the arrival turn', () => {
    expect(pathLabel(5, 5, null)).toBe('this turn');
    expect(pathLabel(5, 8, null)).toBe('arrives turn 8');
  });

  it('appends fuel left, or out of range when fuel is negative', () => {
    expect(pathLabel(5, 6, 3)).toBe('arrives turn 6 · fuel 3');
    expect(pathLabel(5, 5, 0)).toBe('this turn · fuel 0');
    expect(pathLabel(5, 7, -1)).toBe('arrives turn 7 · out of range');
  });
});

describe('healthText', () => {
  it('shows remaining hits over max hits', () => {
    const s = makeGame(['*##', '###', '##*']);
    const t = addUnit(s, 'transport', 0, 0, 1, { damage: 1 });
    expect(healthText(t)).toBe('Health 2/3');
    expect(healthText(addUnit(s, 'army', 0, 1, 1))).toBe('Health 1/1');
  });
});

describe('badgeMode', () => {
  it('uses dots on small tiles and numbers from 16px up', () => {
    expect(badgeMode(15)).toBe('dot');
    expect(badgeMode(16)).toBe('number');
    expect(badgeMode(28)).toBe('number');
  });
});

describe('cityStackTop', () => {
  it('returns the unit with the highest id, or null for an empty city', () => {
    const s = makeGame(['*##', '###', '##*']);
    const a = addUnit(s, 'army', 0, 0, 0);
    const b = addUnit(s, 'fighter', 0, 0, 0);
    expect(cityStackTop([a, b])?.id).toBe(b.id);
    expect(cityStackTop([])).toBeNull();
  });
});
