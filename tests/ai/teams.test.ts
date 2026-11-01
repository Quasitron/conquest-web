import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/app/session';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen/options';

describe('computer players on teams', () => {
  it('play on together without errors or stalls, and keep fighting the other side', () => {
    const colors = ['#d7263d', '#1b98e0', '#f4a259', '#2e933c', '#8e44ad', '#e8c547', '#14b8a6', '#ff7eb6'];
    const teams = [1, 1, 2, 2, 1, 2, 1, 2];
    const seats = teams.map((team, i) => ({
      name: `P${i + 1}`, kind: i === 0 ? ('human' as const) : ('ai' as const), color: colors[i], team,
      ...(i > 0 ? { difficulty: i % 2 ? ('hard' as const) : ('normal' as const) } : {}),
    }));
    const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.large, players: 8, landmass: 'continents' as const };
    const s = GameSession.create({ world, seed: 21, seats, rules: { advancedUnits: true } }, null);
    expect(s.state.players.map((p) => p.team)).toEqual(teams);
    for (let i = 0; i < 70 && s.phase === 'playing'; i++) {
      expect(s.act({ type: 'endTurn' })).toBeNull();
    }
    expect(s.state.turn).toBeGreaterThan(30);
    // The sides did fight each other.
    const kills = (s.state.stats ?? []).reduce((n, p) => n + Object.values(p.killed).reduce((a, b) => a + (b ?? 0), 0), 0);
    expect(kills).toBeGreaterThan(0);
  }, 240_000);
});
