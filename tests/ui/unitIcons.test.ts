import { describe, it, expect } from 'vitest';
import type { LogEntry } from '../../src/app/session';
import { ICON_MIN_TILE, UNIT_ICONS, iconFlipped, iconSize, unitsHeadingLeft } from '../../src/ui/unitIcons';

const moved = (unitId: number, fromX: number, toX: number): LogEntry => ({
  turn: 1, event: { type: 'unitMoved', unitId, from: { x: fromX, y: 0 }, to: { x: toX, y: 0 } },
});

describe('unit icons', () => {
  it('knows which way each picture faces, and mirrors it only when the unit heads the other way', () => {
    expect(UNIT_ICONS.destroyer?.faces).toBe('right');
    expect(UNIT_ICONS.fighter?.faces).toBe('left');
    expect(UNIT_ICONS.army?.faces).toBeNull();
    expect(UNIT_ICONS.transport?.faces).toBe('right');
    expect([iconFlipped('destroyer', false), iconFlipped('destroyer', true)]).toEqual([false, true]);
    expect([iconFlipped('fighter', false), iconFlipped('fighter', true)]).toEqual([true, false]);
    expect([iconFlipped('army', false), iconFlipped('army', true)]).toEqual([false, false]);
    expect(iconFlipped('submarine', true)).toBe(false); // no picture yet
    expect([iconFlipped('carrier', false), iconFlipped('carrier', true)]).toEqual([false, true]);
    expect([iconFlipped('cruiser', false), iconFlipped('cruiser', true)]).toEqual([false, true]);
  });

  it('draws the bigger ships bigger, so a destroyer, cruiser and battleship differ at a glance', () => {
    expect(iconSize('destroyer')).toBeLessThan(iconSize('cruiser'));
    expect(iconSize('cruiser')).toBeLessThan(iconSize('battleship'));
    expect(iconSize('battleship')).toBeLessThanOrEqual(1);
    expect(iconSize('submarine')).toBe(1); // no picture yet
    for (const icon of Object.values(UNIT_ICONS)) expect(icon.size).toBeGreaterThan(0.5);
  });

  it('shows pictures only on squares of a reasonable size', () => {
    expect(ICON_MIN_TILE).toBeGreaterThan(20);
    expect(ICON_MIN_TILE).toBeLessThanOrEqual(36); // the fight replay zooms to 36 px
  });
});

describe('unitsHeadingLeft', () => {
  it('remembers the last horizontal move of each unit; straight up or down keeps the heading', () => {
    const log = [moved(1, 5, 4), moved(2, 5, 6), moved(3, 5, 4), moved(3, 4, 5), moved(4, 5, 4)];
    log.push({ turn: 1, event: { type: 'unitMoved', unitId: 4, from: { x: 4, y: 0 }, to: { x: 4, y: 1 } } });
    expect([...unitsHeadingLeft(log, 20, false, 0)].sort()).toEqual([1, 4]);
  });

  it('on a wrapping map, a move across the seam takes the shorter way round', () => {
    // From x=19 to x=0 on a 20-wide map is a step to the right; from 0 to 19 is a step to the left.
    expect([...unitsHeadingLeft([moved(1, 19, 0), moved(2, 0, 19)], 20, true, 0)]).toEqual([2]);
    // Without wrap the same move really is a long way left or right.
    expect([...unitsHeadingLeft([moved(1, 19, 0), moved(2, 0, 19)], 20, false, 0)]).toEqual([1]);
  });
});