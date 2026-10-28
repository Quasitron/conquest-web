import { describe, expect, it } from 'vitest';
import { reliefAt } from '../../src/engine';
import { GameSession } from '../../src/app/session';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen/options';

describe('computer opponent on a map with terrain', () => {
  it('plays on without errors or stalls, and its Armor never stands on a mountain', () => {
    const seats = [
      { name: 'You', kind: 'human' as const, color: '#d7263d' },
      { name: 'Computer', kind: 'ai' as const, color: '#1b98e0', difficulty: 'hard' as const },
    ];
    const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.small, landmass: 'continents' as const };
    const s = GameSession.create({ world, seed: 11, seats, rules: { advancedUnits: true } }, null);
    expect(s.state.relief).toBeDefined();
    let armorSeen = 0;
    for (let i = 0; i < 140 && s.phase === 'playing'; i++) {
      expect(s.act({ type: 'endTurn' })).toBeNull();
      for (const u of s.state.units) {
        if (u.type !== 'armor') continue;
        armorSeen++;
        expect(reliefAt(s.state, u.x, u.y)).not.toBe('mountain');
      }
    }
    expect(s.state.turn).toBeGreaterThan(60);
    expect(armorSeen).toBeGreaterThan(0);
  }, 120_000);
});
