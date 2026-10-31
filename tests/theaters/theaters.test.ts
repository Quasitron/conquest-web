import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/app/session';
import { validateMapSize } from '../../src/engine';
import { DEFAULT_WORLD } from '../../src/mapgen';
import { THEATERS, loadTheater, maxTheaterPlayers, theaterWorld } from '../../src/theaters';

describe('historical theaters', () => {
  it('lists at least one theater, each with its wars and notes for the menu', () => {
    expect(THEATERS.length).toBeGreaterThan(0);
    for (const t of THEATERS) {
      expect(t.wars.length).toBeGreaterThan(10);
      expect(t.notes.length).toBeGreaterThan(10);
      expect(t.nations.length).toBeGreaterThanOrEqual(2);
    }
  });

  for (const summary of THEATERS) {
    describe(summary.name, () => {
      it('has a well-formed map: right size, every city on a city square, every nation starting in one of its own cities', async () => {
        const t = await loadTheater(summary.id);
        expect(validateMapSize(t.width, t.height)).toBeNull();
        expect(t.terrain).toHaveLength(t.height);
        expect(t.relief).toHaveLength(t.height);
        for (const row of t.terrain) expect(row).toHaveLength(t.width);
        for (const row of t.relief) expect(row).toHaveLength(t.width);
        expect(t.terrain.join('').split('C').length - 1).toBe(t.cities.length);
        for (const c of t.cities) expect(t.terrain[c.y][c.x]).toBe('C');
        for (const n of t.nations) expect(t.cities[n.start].nation).toBe(n.name);
        // Cities are in row-major order, as the game expects, and no two are the same.
        const order = t.cities.map((c) => c.y * t.width + c.x);
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(new Set(t.cities.map((c) => c.name)).size).toBe(t.cities.length);
      });

      it('has rivers that run down to the water, and no river on a mountain or in a city', async () => {
        const t = await loadTheater(summary.id);
        const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < t.width && y < t.height ? t.relief[y][x] : '~');
        for (let y = 0; y < t.height; y++) {
          for (let x = 0; x < t.width; x++) {
            if (t.relief[y][x] === 'v') {
              expect(t.terrain[y][x]).toBe('.');
              // Each river square joins another river square or the water.
              expect([at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)].some((c) => c === 'v' || c === '~')).toBe(true);
            }
          }
        }
      });

      it('gives every player a different nation and a start in its own city', async () => {
        const t = await loadTheater(summary.id);
        for (let players = 2; players <= maxTheaterPlayers(summary); players++) {
          const w = theaterWorld(t, players, 1234 + players, true);
          expect(w.startCityIndices).toHaveLength(players);
          expect(new Set(w.nations).size).toBe(players);
          expect(new Set(w.startCityIndices).size).toBe(players);
          expect(w.map.relief).toBeDefined();
        }
        expect(theaterWorld(t, 2, 5, false).map.relief).toBeUndefined();
        expect(() => theaterWorld(t, t.nations.length + 1, 1, true)).toThrow();
      });

      it('starts a real game, with the real city names and each player holding its nation\'s start city', async () => {
        const t = await loadTheater(summary.id);
        const preset = theaterWorld(t, 2, 99, false);
        const seats = [
          { name: preset.nations[0], kind: 'human' as const, color: '#d7263d' },
          { name: preset.nations[1], kind: 'ai' as const, color: '#1b98e0' },
        ];
        const s = GameSession.create({ world: { ...DEFAULT_WORLD, width: t.width, height: t.height, wrap: t.wrap }, seed: 99, seats, preset }, null);
        const mine = s.state.cities.filter((c) => c.owner === 0);
        expect(mine.length).toBeGreaterThan(0);
        expect(s.state.cities.map((c) => c.name)).toContain(t.cities[preset.startCityIndices[0]].name);
      });
    });
  }
});
