import { describe, expect, it } from 'vitest';
import { computeRiverNet, riverNetOf, NONE, SEA } from '../../src/engine';
import { parseAscii } from '../../src/engine/ascii';
import { getPlayerView } from '../../src/engine/view';
import { DEFAULT_WORLD, generateWorld } from '../../src/mapgen';
import { makeGame } from '../helpers';

// A river along row 1 into the sea on the left, with a tributary joining from the north.
const M = ['*##v###', '.vvvv##', '.#####*'];

describe('river network', () => {
  const m = parseAscii(M);
  const net = computeRiverNet(m.terrain, m.relief!, m.width, m.height, false);
  const at = (x: number, y: number) => y * m.width + x;

  it('finds the mouth and which square every river square flows into', () => {
    expect(net.down[at(1, 1)]).toBe(SEA);
    expect(net.down[at(2, 1)]).toBe(at(1, 1));
    expect(net.down[at(4, 1)]).toBe(at(3, 1));
    expect(net.down[at(3, 0)]).toBe(at(3, 1));
    expect(net.down[at(0, 1)]).toBe(NONE); // water is no river
  });

  it('adds up what drains through each square, so a river grows toward the sea and a tributary adds to it', () => {
    expect(net.flow[at(4, 1)]).toBe(1);
    expect(net.flow[at(3, 0)]).toBe(1);
    expect(net.flow[at(3, 1)]).toBe(3); // itself, the source upstream and the tributary
    expect(net.flow[at(2, 1)]).toBe(4);
    expect(net.flow[at(1, 1)]).toBe(5);
    expect(net.flow[at(5, 1)]).toBe(0);
  });

  it('leaves a river that cannot reach water with no outlet', () => {
    const lone = parseAscii(['...####', '.######', '.##vv##']);
    const n = computeRiverNet(lone.terrain, lone.relief!, lone.width, lone.height, false);
    expect(n.down[2 * lone.width + 3]).toBe(NONE);
    expect(n.down[2 * lone.width + 4]).toBe(NONE);
  });

  it('is remembered per map, absent on a map without rivers, and passed to the player view for explored squares only', () => {
    const s = makeGame(M);
    expect(riverNetOf(s)).toBe(riverNetOf(s));
    expect(riverNetOf(makeGame(['*..', '..*']))).toBeNull();
    const v = getPlayerView(s, 0);
    expect(v.riverNet).toBeDefined();
    expect(v.riverNet!.flow.some((f) => f === null)).toBe(true); // most of the map is not explored yet
  });
});

describe('generated rivers', () => {
  const maps = [
    { ...DEFAULT_WORLD, width: 40, height: 30, waterPercent: 70, landmass: 'mixed' as const, players: 3 },
    { ...DEFAULT_WORLD, width: 40, height: 30, waterPercent: 75, landmass: 'islands' as const, players: 3 },
    { ...DEFAULT_WORLD },
  ];

  it('give every kind of map a few rivers, each running down to the sea, none a stub, and none through a city', () => {
    for (const o of maps) {
      for (let seed = 100; seed < 106; seed++) {
        const w = generateWorld(o, seed * 7919, true);
        const { terrain, relief, width, height } = w.map;
        const net = computeRiverNet(terrain, relief!, width, height, o.wrap);
        const rivers = relief!.filter((r) => r === 'river').length;
        expect(rivers).toBeGreaterThanOrEqual(3);
        net.flow.forEach((f, i) => {
          if (f > 0) {
            expect(terrain[i]).toBe('land'); // not a city, not water
            expect(net.down[i]).not.toBe(NONE); // every river square drains to the sea
          }
        });
        const mouths = net.down.filter((d) => d === SEA).length;
        expect(mouths).toBeGreaterThanOrEqual(1);
        expect(rivers / mouths).toBeGreaterThanOrEqual(3); // each river is at least three squares long
      }
    }
  });

  it('are the same for the same seed', () => {
    const a = generateWorld(maps[0], 4242, true).map.relief;
    const b = generateWorld(maps[0], 4242, true).map.relief;
    expect(a).toEqual(b);
  });
});
