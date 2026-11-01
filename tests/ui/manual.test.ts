import { describe, expect, it } from 'vitest';
import { UNIT_TYPES } from '../../src/engine';
import { buildManual, searchManual } from '../../src/ui/manualContent';

describe('the manual', () => {
  const manual = buildManual();

  it('has unique pages, each with something on it', () => {
    expect(new Set(manual.map((s) => s.id)).size).toBe(manual.length);
    for (const s of manual) expect(s.paragraphs.length + (s.items?.length ?? 0)).toBeGreaterThan(0);
  });

  it('describes every unit and every house rule from the game\'s own tables', () => {
    expect(manual.find((s) => s.id === 'units')!.items).toHaveLength(UNIT_TYPES.length);
    expect(manual.find((s) => s.id === 'houserules')!.items!.length).toBeGreaterThan(0);
  });

  it('searches by every word, ignoring case, and returns everything for an empty box', () => {
    expect(searchManual(manual, '')).toHaveLength(manual.length);
    expect(searchManual(manual, '  ')).toHaveLength(manual.length);
    expect(searchManual(manual, 'CRIPPLED').map((s) => s.id)).toContain('combat');
    expect(searchManual(manual, 'crippled half').map((s) => s.id)).toContain('combat');
    expect(searchManual(manual, 'zzzqqq')).toEqual([]);
  });
});
