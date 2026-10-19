import { describe, it, expect } from 'vitest';
// The project's type check has no Node typings; this file only touches Node to write the save when asked to.
// @ts-ignore
import { mkdirSync, writeFileSync } from 'node:fs';
import { createGame, getPlayerView, RULES_VERSION, type GameState, type UnitType } from '../../src/engine';
import { updateFog } from '../../src/engine/fog';
import { parseAscii } from '../../src/engine/ascii';
import { spawnUnit } from '../../src/engine/query';
import { parseSave, serializeSave, type SaveFile } from '../../src/storage';
import { PLAYER_COLORS } from '../../src/ui/colors';

/**
 * A ready-made game for trying naval combat: a small sea between two islands, with a row of face-offs between ships
 * of both sides (each of Player 1's ships is named for its fight) and armies on the east coast to bombard.
 * The file is written to docs/test-saves/ when WRITE_SAVES=1 (`WRITE_SAVES=1 npx vitest run tests/saves`).
 */
const W = 30;
const H = 16;

function buildNavalTest(): SaveFile {
  const grid: string[][] = Array.from({ length: H }, () => Array(W).fill('.'));
  for (let y = 1; y < H - 1; y++) {
    for (let x = 0; x <= 6; x++) grid[y][x] = '#'; // west island
    for (let x = 23; x < W; x++) grid[y][x] = '#'; // east island
  }
  grid[7][3] = '*'; // Player 1's city
  grid[7][26] = '*'; // Player 2's city
  grid[3][26] = '*'; // a spare city on the east island
  const s: GameState = createGame({
    map: parseAscii(grid.map((r) => r.join(''))),
    players: [{ name: 'Player 1', kind: 'human' }, { name: 'Computer', kind: 'ai' }],
    startCityIndices: [1, 2],
    seed: 2026,
  });

  const add = (type: UnitType, owner: number, x: number, y: number, name: string | null = null, carriedBy: number | null = null) => {
    const u = spawnUnit(s, type, owner, x, y);
    u.name = name;
    u.carriedBy = carriedBy;
    return u;
  };

  // Face-offs in open water, one pair per row (Player 1 on the left, adjacent to the enemy on the right).
  add('destroyer', 0, 10, 2, 'Even: vs destroyer'); add('destroyer', 1, 11, 2);
  add('cruiser', 0, 10, 4, 'Good: vs destroyer'); add('destroyer', 1, 11, 4);
  add('destroyer', 0, 10, 6, 'Bad: vs battleship'); add('battleship', 1, 11, 6);
  add('submarine', 0, 10, 8, 'Sub vs transport'); const et = add('transport', 1, 11, 8);
  add('army', 1, 11, 8, null, et.id); add('army', 1, 11, 8, null, et.id);
  add('battleship', 0, 10, 10, 'Battle: vs cruiser'); add('cruiser', 1, 11, 10);

  // The east coast: ships to bombard armies (cruiser and battleship), and a transport to land armies.
  add('army', 1, 23, 12); add('army', 1, 23, 13);
  add('cruiser', 0, 22, 12, 'Bombard cruiser'); add('battleship', 0, 22, 13, 'Bombard battleship');
  const tr = add('transport', 0, 22, 14, 'Landing transport');
  add('army', 0, 22, 14, null, tr.id); add('army', 0, 22, 14, null, tr.id);
  add('army', 1, 23, 14);

  // A carrier with two fighters, an enemy destroyer just off its bow.
  const cv = add('carrier', 0, 8, 13, 'Carrier');
  add('fighter', 0, 8, 13, 'Fighter 1', cv.id); add('fighter', 0, 8, 13, 'Fighter 2', cv.id);
  add('destroyer', 1, 9, 14);

  for (let p = 0; p < 2; p++) {
    s.fog[p].explored.fill(1);
    updateFog(s, p);
  }
  const snapshot = JSON.parse(JSON.stringify(s)) as GameState;
  return {
    format: 3, rulesVersion: RULES_VERSION, savedAt: '2026-10-18T00:00:00.000Z', name: 'Naval test', gameName: 'Naval test',
    seats: [
      { name: 'Player 1', kind: 'human', color: PLAYER_COLORS[0] },
      { name: 'Computer', kind: 'ai', color: PLAYER_COLORS[1] },
    ],
    initial: s, commands: [], snapshot,
  };
}

describe('naval test save', () => {
  it('is a valid save that loads, with ships of both sides face to face', () => {
    const save = buildNavalTest();
    const parsed = parseSave(serializeSave(save));
    expect(parsed.ok).toBe(true);
    const v = getPlayerView(save.snapshot, 0);
    expect(v.myUnits.filter((u) => u.name !== null).length).toBeGreaterThanOrEqual(8);
    // Every enemy ship placed next to one of ours is in sight from the start.
    expect(v.enemies.filter((e) => e.visibleNow).length).toBeGreaterThanOrEqual(7);
    // @ts-ignore
    if (process.env.WRITE_SAVES) {
      mkdirSync('docs/test-saves', { recursive: true });
      writeFileSync('docs/test-saves/naval-test.json', serializeSave(save));
    }
  });
});
