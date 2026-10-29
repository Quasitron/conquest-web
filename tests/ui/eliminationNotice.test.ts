import { describe, expect, it } from 'vitest';
import { eliminationHeadline } from '../../src/ui/EliminationNotice';

describe('eliminationHeadline', () => {
  it('names the fallen empire by colour, with an exclamation mark', () => {
    expect(eliminationHeadline(['Blue'], 1)).toBe('BLUE EMPIRE FALLS!');
    expect(eliminationHeadline([null], 1)).toBe('EMPIRE FALLS!');
  });

  it('counts several empires that fall at once', () => {
    expect(eliminationHeadline(['Red', 'Blue'], 2)).toBe('TWO EMPIRES FALL!');
    expect(eliminationHeadline(['Red', 'Blue', 'Green'], 3)).toBe('THREE EMPIRES FALL!');
  });
});
