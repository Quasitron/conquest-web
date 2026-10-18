import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine';
import { buildTime } from '../../src/engine/production';
import { statusSummary } from '../../src/ui/statusNumbers';
import { addUnit, makeGame } from '../helpers';

describe('statusSummary', () => {
  it('counts cities, exploration, production, units, kills and losses from the viewer\'s own information', () => {
    const s = makeGame(['*##.*.', '.....#']);
    s.cities[0].production = 'army';
    s.cities[0].progress = 2;
    s.cities[1].owner = 0;
    s.cities[1].production = 'army';
    s.cities[1].progress = 0;
    addUnit(s, 'army', 0, 1, 0);
    addUnit(s, 'army', 0, 2, 0);
    addUnit(s, 'fighter', 0, 1, 0);
    s.stats![0].killed.destroyer = 3;
    s.stats![0].lost.army = 2;

    const sum = statusSummary(getPlayerView(s, 0));
    expect(sum.citiesCaptured).toBe(2);
    expect(sum.worldExplored).toBeGreaterThan(0);
    expect(sum.worldExplored).toBeLessThanOrEqual(100);

    const army = sum.rows.find((r) => r.type === 'army')!;
    expect(army).toMatchObject({ underConstruction: 2, inService: 2, killed: 0, lost: 2 });
    // The city with progress 2 is two turns closer than the fresh one.
    expect(army.soonest).toBe(buildTime(s.cities[0], 'army') - 2);

    expect(sum.rows.find((r) => r.type === 'fighter')).toMatchObject({ underConstruction: 0, soonest: null, inService: 1 });
    expect(sum.rows.find((r) => r.type === 'destroyer')).toMatchObject({ killed: 3, lost: 0, inService: 0 });
    expect(sum.rows).toHaveLength(8);
  });
});
