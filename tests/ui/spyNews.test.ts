import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../../src/engine';
import { spyHeadlines } from '../../src/ui/spyNews';

const name = (id: number) => (id === 7 ? 'Portland' : undefined);
const sabotaged = (caught: boolean): GameEvent => ({ type: 'citySabotaged', cityId: 7, by: 1, owner: 0, caught, production: 'bomber' });

describe('spyHeadlines', () => {
  it('tells the victim about a sabotaged city', () => {
    const [item] = spyHeadlines([sabotaged(false)], 0, name);
    expect(item.headline).toBe('BOMBER FACTORY SABOTAGED IN PORTLAND!');
    expect(item.text).toContain('slipped away');
    expect(spyHeadlines([sabotaged(true)], 0, name)[0].text).toContain('shot');
  });

  it('tells the spy\'s owner how the job went', () => {
    expect(spyHeadlines([sabotaged(false)], 1, name)[0].headline).toBe('BOMBER FACTORY SABOTAGED IN PORTLAND!');
    expect(spyHeadlines([sabotaged(true)], 1, name)[0].headline).toBe('BOMBER FACTORY SABOTAGED IN PORTLAND!');
    expect(spyHeadlines([sabotaged(true)], 1, name)[0].subhead).toBe('Suspect killed');
  });

  it('reports damage to the garrison to both sides', () => {
    const hurt: GameEvent = { type: 'garrisonHurt', cityId: 7, by: 1, owner: 0, unitType: 'armor', caught: false };
    expect(spyHeadlines([hurt], 0, name)[0].headline).toBe('GARRISON SABOTAGED IN PORTLAND!');
    expect(spyHeadlines([hurt], 1, name)[0].headline).toBe('GARRISON HIT IN PORTLAND!');
  });

  it('reports an operative found hiding, to both sides', () => {
    const found: GameEvent = { type: 'spyFound', cityId: 7, owner: 0, by: 1 };
    expect(spyHeadlines([found], 0, name)[0].headline).toBe('ENEMY OPERATIVE FOUND IN PORTLAND!');
    expect(spyHeadlines([found], 1, name)[0].headline).toBe('OUR AGENT EXPOSED IN PORTLAND!');
  });

  it('reports a revolt, won or lost, and says nothing to a third player', () => {
    const won: GameEvent = { type: 'cityIncited', cityId: 7, by: 1, owner: 0, success: true };
    const lost: GameEvent = { ...(won as object), success: false } as GameEvent;
    expect(spyHeadlines([won], 1, name)[0].headline).toBe('PORTLAND RISES UP!');
    expect(spyHeadlines([won], 0, name)[0].headline).toBe('REVOLT IN PORTLAND!');
    expect(spyHeadlines([lost], 1, name)[0].headline).toBe('REVOLT FAILS IN PORTLAND!');
    expect(spyHeadlines([lost], 0, name)[0].headline).toBe('REVOLT PUT DOWN IN PORTLAND!');
    expect(spyHeadlines([won], 2, name)).toEqual([]);
  });

  it('ignores other events and copes with an unknown city', () => {
    expect(spyHeadlines([{ type: 'turnStarted', player: 0, turn: 3 }], 0, name)).toEqual([]);
    expect(spyHeadlines([{ ...(sabotaged(false) as object), cityId: 99 } as GameEvent], 0, name)[0].headline).toBe('BOMBER FACTORY SABOTAGED IN THE CITY!');
  });
});
