import { describe, expect, it } from 'vitest';
import { apply, getPlayerView, UNIT_STATS, type GameEvent } from '../../src/engine';
import { canPlayerSeeUnit, catchSpies, updateFog } from '../../src/engine/fog';
import { moveUnit } from '../../src/engine/movement';
import { incitePeople, sabotageCity } from '../../src/engine/spy';
import { addUnit, fixedRng, makeGame } from '../helpers';

const M = ['*.........', '..........', '..........', '.........*'];
const RULES = { advancedUnits: true, promotions: true };

function setup() {
  const s = makeGame(M, { rules: RULES });
  const enemyCity = s.cities.find((c) => c.owner === 1)!;
  return { s, enemyCity };
}

describe('Spy (Advanced units)', () => {
  it('is an Advanced unit with no defence, and a transport carries it', () => {
    expect(UNIT_STATS.spy).toMatchObject({ advanced: true, defense: 0, attack: 0, domain: 'land' });
    expect(UNIT_STATS.transport.carries).toContain('spy');
  });

  it('slips into an enemy city without taking it', () => {
    const { s, enemyCity } = setup();
    const spy = addUnit(s, 'spy', 0, enemyCity.x - 1, enemyCity.y);
    expect(moveUnit(s, fixedRng(0), spy, 2, [])).toBeNull();
    expect(spy.x).toBe(enemyCity.x);
    expect(enemyCity.owner).toBe(1);
  });

  it('has no business in a neutral city, and cannot attack', () => {
    const s = makeGame(['*.........', '.........*', '....*.....'], { rules: RULES, starts: [0, 1] });
    const neutral = s.cities.find((c) => c.owner === null)!;
    const spy = addUnit(s, 'spy', 0, neutral.x - 1, neutral.y);
    expect(moveUnit(s, fixedRng(0), spy, 2, [])).toMatch(/neutral/);
    const foe = addUnit(s, 'army', 1, 5, 1);
    const other = addUnit(s, 'spy', 0, 4, 1);
    expect(moveUnit(s, fixedRng(0), other, 2, [])).toMatch(/cannot attack/);
    expect(foe.owner).toBe(1);
  });

  it('is not seen by ordinary sight, but a spy in a city of the other side uncovers it beside the city', () => {
    const s = makeGame(M, { rules: RULES });
    const mine = s.cities.find((c) => c.owner === 0)!;
    const spy = addUnit(s, 'spy', 1, mine.x + 1, mine.y + 1);
    addUnit(s, 'army', 0, mine.x + 1, mine.y);
    expect(canPlayerSeeUnit(s, 0, spy)).toBe(false);
    addUnit(s, 'spy', 0, mine.x, mine.y); // a spy of ours in our city
    expect(canPlayerSeeUnit(s, 0, spy)).toBe(true);
    expect(canPlayerSeeUnit(s, 0, addUnit(s, 'spy', 1, mine.x + 3, mine.y + 3))).toBe(false);
  });

  it('is found out when an enemy unit moves onto its square', () => {
    const s = makeGame(M, { rules: RULES });
    const spy = addUnit(s, 'spy', 1, 5, 1);
    const army = addUnit(s, 'army', 0, 4, 1);
    const ev: GameEvent[] = [];
    expect(moveUnit(s, fixedRng(0), army, 2, ev)).toBeNull();
    expect(s.units.some((u) => u.id === spy.id)).toBe(false);
  });

  it('is caught when an enemy unit moves into the city it hides in', () => {
    const { s, enemyCity } = setup();
    const spy = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y);
    const guard = addUnit(s, 'army', 1, enemyCity.x - 1, enemyCity.y);
    const ev: GameEvent[] = [];
    expect(moveUnit(s, fixedRng(0), guard, 2, ev)).toBeNull();
    expect(s.units.some((u) => u.id === spy.id)).toBe(false);
    expect(ev.some((e) => e.type === 'unitDestroyed' && e.reason === 'caught')).toBe(true);
  });

  it('an enemy spy in a city is caught when the city holds a spy of its owner', () => {
    const { s, enemyCity } = setup();
    const intruder = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y);
    addUnit(s, 'spy', 1, enemyCity.x, enemyCity.y);
    const ev: GameEvent[] = [];
    catchSpies(s, ev);
    expect(s.units.some((u) => u.id === intruder.id)).toBe(false);
  });

  it('sabotage wrecks production; a clean job earns a win, a discovered spy is shot', () => {
    const { s, enemyCity } = setup();
    enemyCity.production = 'army';
    enemyCity.progress = 4;
    const spy = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y);
    expect(sabotageCity(s, fixedRng(0.99), spy, [])).toBeNull();
    expect(enemyCity.progress).toBe(0);
    expect(spy.wins).toBe(1);
    expect(spy.movesLeft).toBe(0);

    enemyCity.progress = 4;
    const second = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y);
    const ev: GameEvent[] = [];
    sabotageCity(s, fixedRng(0), second, ev);
    expect(ev.find((e) => e.type === 'citySabotaged')).toMatchObject({ caught: true });
    expect(s.units.some((u) => u.id === second.id)).toBe(false);
  });

  it('refuses to sabotage with nothing to wreck, or outside an enemy city', () => {
    const { s, enemyCity } = setup();
    const spy = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y);
    expect(sabotageCity(s, fixedRng(0.99), spy, [])).toMatch(/no production/);
    const out = addUnit(s, 'spy', 0, 4, 1);
    expect(sabotageCity(s, fixedRng(0.99), out, [])).toMatch(/enemy city/);
  });

  it('only an Elite spy can incite a revolt, with a modest chance; failing costs the spy', () => {
    const { s, enemyCity } = setup();
    const green = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y);
    expect(incitePeople(s, fixedRng(0), green, [])).toMatch(/Elite/);

    const elite = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y, { wins: 5 });
    const ev: GameEvent[] = [];
    expect(incitePeople(s, fixedRng(0.9), elite, ev)).toBeNull();
    expect(enemyCity.owner).toBe(1);
    expect(s.units.some((u) => u.id === elite.id)).toBe(false);

    const again = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y, { wins: 5 });
    const win: GameEvent[] = [];
    expect(incitePeople(s, fixedRng(0), again, win)).toBeNull();
    expect(enemyCity.owner).toBe(0);
    expect(win.some((e) => e.type === 'cityCaptured')).toBe(true);
    expect(s.units.some((u) => u.id === again.id)).toBe(true);
  });

  it('shows the production of an enemy city to a spy in or beside it', () => {
    const { s, enemyCity } = setup();
    enemyCity.production = 'cruiser';
    enemyCity.progress = 10;
    expect(getPlayerView(s, 0).knownCities.find((c) => c.id === enemyCity.id)?.intel).toBeUndefined();
    addUnit(s, 'spy', 0, enemyCity.x - 1, enemyCity.y);
    updateFog(s, 0);
    const intel = getPlayerView(s, 0).knownCities.find((c) => c.id === enemyCity.id)?.intel;
    expect(intel).toMatchObject({ production: 'cruiser', turnsLeft: 32 });
  });

  it('is accepted as a command and does not count as an army that could take a city', () => {
    const { s, enemyCity } = setup();
    enemyCity.production = 'army';
    enemyCity.progress = 4;
    const spy = addUnit(s, 'spy', 0, enemyCity.x, enemyCity.y);
    const r = apply(s, { type: 'sabotage', player: 0, unitId: spy.id });
    expect(r.ok).toBe(true);
  });
});
