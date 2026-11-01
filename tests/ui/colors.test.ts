import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, colorName } from '../../src/ui/colors';

describe('colorName', () => {
  it('names the six player colours and nothing else', () => {
    expect(PLAYER_COLORS.map(colorName)).toEqual(['Red', 'Blue', 'Orange', 'Green', 'Purple', 'Yellow', 'Teal', 'Pink']);
    expect(colorName('#123456')).toBeNull();
  });
});
