import { describe, it, expect, afterEach, vi } from 'vitest';
import { CLASSIC_RULES } from '../../src/engine';
import { DEFAULT_WORLD } from '../../src/mapgen';
import {
  NEW_GAME_KEY, defaultSeats, loadNewGameSettings, parseNewGameSettings, saveNewGameSettings, type NewGameSettings,
} from '../../src/ui/newGameSettings';

const fallback = (): NewGameSettings => ({ world: { ...DEFAULT_WORLD }, seats: defaultSeats(2, []), rules: { ...CLASSIC_RULES } });

const custom = (): NewGameSettings => ({
  world: { ...DEFAULT_WORLD, width: 100, height: 70, wrap: true, waterPercent: 70, landmass: 'continents', cityDensity: 'high', players: 3, nameRegion: 'asia' },
  seats: [
    { name: 'Rob', kind: 'human', color: '#d7263d' },
    { name: 'Bot', kind: 'ai', color: '#1b98e0' },
    { name: 'Idle', kind: 'idle', color: '#2ca58d' },
  ],
  rules: { ...CLASSIC_RULES, fairFirstTurn: true },
});

afterEach(() => vi.unstubAllGlobals());

describe('parseNewGameSettings', () => {
  it('keeps valid stored settings exactly', () => {
    const s = custom();
    expect(parseNewGameSettings(JSON.parse(JSON.stringify(s)), fallback())).toEqual(s);
  });

  it('falls back to the defaults for anything that is not an object', () => {
    for (const junk of [null, 5, 'x', [], undefined]) expect(parseNewGameSettings(junk, fallback())).toEqual(fallback());
  });

  it('keeps the valid fields and defaults the invalid ones, one by one', () => {
    const raw = {
      world: { width: 100, height: 70, wrap: 'yes', waterPercent: 99, landmass: 'lava', cityDensity: 'high', players: 9, nameRegion: 'mars' },
      rules: { fairFirstTurn: 'true', easierNeutralCities: true },
    };
    const r = parseNewGameSettings(raw, fallback());
    expect(r.world).toMatchObject({
      width: 100, height: 70, wrap: DEFAULT_WORLD.wrap, waterPercent: DEFAULT_WORLD.waterPercent,
      landmass: DEFAULT_WORLD.landmass, cityDensity: 'high', players: DEFAULT_WORLD.players, nameRegion: DEFAULT_WORLD.nameRegion,
    });
    expect(r.rules).toEqual({ ...CLASSIC_RULES, easierNeutralCities: true });
  });

  it('rejects a map size the game would refuse', () => {
    const r = parseNewGameSettings({ world: { width: 3, height: 3 } }, fallback());
    expect([r.world.width, r.world.height]).toEqual([DEFAULT_WORLD.width, DEFAULT_WORLD.height]);
  });

  it('makes the seats match the number of players and always keeps a human', () => {
    const raw = { world: { players: 4 }, seats: [{ name: 'A', kind: 'ai', color: '#112233' }, { name: 'B', kind: 'idle', color: '#445566' }, { nope: 1 }] };
    const r = parseNewGameSettings(raw, fallback());
    expect(r.seats).toHaveLength(4);
    expect(r.seats.some((s) => s.kind === 'human')).toBe(true);
    expect(r.seats[1]).toMatchObject({ name: 'B', kind: 'idle' });
  });
});

describe('load and save', () => {
  function stubStorage() {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } });
    return m;
  }

  it('round-trips through storage, and the seed is not stored', () => {
    const m = stubStorage();
    saveNewGameSettings(custom());
    expect(m.get(NEW_GAME_KEY)).not.toMatch(/seed/);
    expect(loadNewGameSettings(fallback())).toEqual(custom());
  });

  it('uses the defaults when nothing is stored, the value is garbage, or storage throws', () => {
    stubStorage();
    expect(loadNewGameSettings(fallback())).toEqual(fallback());
    globalThis.localStorage.setItem(NEW_GAME_KEY, '{not json');
    expect(loadNewGameSettings(fallback())).toEqual(fallback());
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadNewGameSettings(fallback())).toEqual(fallback());
    expect(() => saveNewGameSettings(custom())).not.toThrow();
  });
});
