import { describe, it, expect } from 'vitest';
import { buildTime } from '../../src/engine';
import {
  badgeMode, cargoLoad, cargoSummary, cityLabelVisible, cityStackTop, healthText, inProductionCount, pathLabel, pluralUnit,
  statusLine, turnsToComplete, withArticle,
} from '../../src/ui/labels';
import { cargoAndPatrols, patrolsFrom } from '../../src/ui/labels';
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

describe('unit and city label helpers', () => {
  it('pluralizes unit types', () => {
    expect(pluralUnit('army', 3)).toBe('Armies');
    expect(pluralUnit('army', 1)).toBe('Army');
    expect(pluralUnit('fighter', 1)).toBe('Fighter');
    expect(pluralUnit('fighter', 2)).toBe('Fighters');
  });

  it('summarizes cargo in unit type order', () => {
    expect(cargoSummary([{ type: 'fighter' }, { type: 'army' }, { type: 'army' }])).toBe('2 Armies, 1 Fighter');
    expect(cargoSummary([{ type: 'army' }, { type: 'army' }, { type: 'army' }])).toBe('3 Armies');
    expect(cargoLoad(5, 6)).toBe('Carrying: 5/6 Units');
    expect(cargoLoad(0, 4)).toBe('Carrying: 0/4 Units');
  });

  it('adds an article', () => {
    expect(withArticle('Army')).toBe('an Army');
    expect(withArticle('Fighter')).toBe('a Fighter');
  });

  it('shows city labels from 20px tiles', () => {
    expect(cityLabelVisible(19)).toBe(false);
    expect(cityLabelVisible(20)).toBe(true);
  });

  it('counts turns to complete and units in production', () => {
    const s = makeGame(['*#*', '###']);
    const c = { ...s.cities[0], production: 'army' as const, progress: 2, lastBuilt: 'army' as const };
    expect(turnsToComplete(c, 'army')).toBe(3);
    expect(turnsToComplete(c, 'fighter')).toBe(buildTime(c, 'fighter'));
    expect(inProductionCount([c, { ...c, id: 9 }, { ...c, id: 10, production: 'fighter' }], 'army')).toBe(2);
  });

  it('writes the status line', () => {
    const s = makeGame(['*#*', '###']);
    const a = addUnit(s, 'army', 0, 1, 1, { id: 142 });
    expect(statusLine(a)).toBe('142nd Army \u00b7 Moves 1/1 \u00b7 Orders: None');
    const f = addUnit(s, 'fighter', 0, 1, 1, { id: 7, movesLeft: 3, fuel: 14, orders: { kind: 'sentry' } });
    expect(statusLine(f)).toBe('7th Fighter \u00b7 Moves 3/5 \u00b7 Orders: Sentry \u00b7 Fuel 14/20');
  });
});

describe('carrier patrol group', () => {
  it('lists fighters on a patrol tied to the carrier, but not ones aboard or tied elsewhere', () => {
    const s = makeGame(['*....*']);
    const c = addUnit(s, 'carrier', 0, 3, 0);
    const other = addUnit(s, 'carrier', 0, 4, 0);
    const patrol = (id: number) => ({ kind: 'patrol' as const, a: { x: 3, y: 0 }, b: { x: 5, y: 0 }, toB: true, carrier: { id, end: 'a' as const } });
    const away = addUnit(s, 'fighter', 0, 5, 0, { orders: patrol(c.id) });
    addUnit(s, 'fighter', 0, 3, 0, { orders: patrol(c.id), carriedBy: c.id });
    addUnit(s, 'fighter', 0, 5, 0, { orders: patrol(other.id) });
    addUnit(s, 'fighter', 0, 5, 0, { orders: { kind: 'sentry' } });
    expect(patrolsFrom(s.units, c).map((u) => u.id)).toEqual([away.id]);
  });

  it('adds the patrols to the load text only when there are some', () => {
    expect(cargoAndPatrols(2, 8, 0)).toBe('Carrying: 2/8 Units');
    expect(cargoAndPatrols(0, 8, 5)).toBe('Carrying: 0/8 Units · 5 on patrol');
  });
});
