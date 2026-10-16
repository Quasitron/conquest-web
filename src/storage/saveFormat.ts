import type { Command, GameState } from '../engine';
import { getPlayerView, hashState, replay, RULES_VERSION } from '../engine';
import { migrateSave } from './migrations';

export interface SeatConfig {
  name: string;
  kind: 'human' | 'idle';
  color: string;
}

export interface SaveFile {
  format: 3;
  rulesVersion: number;
  savedAt: string;
  name: string;
  seats: SeatConfig[];
  initial: GameState;
  commands: Command[];
  snapshot: GameState;
}

export const OLDER_VERSION_NOTE = 'Loaded from an older version; its history could not be verified.';

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isSeat(v: unknown): v is SeatConfig {
  return isObj(v) && typeof v.name === 'string' && (v.kind === 'human' || v.kind === 'idle') && typeof v.color === 'string';
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const TERRAINS = ['water', 'land', 'city'];

/** Structural check of a GameState. Returns a problem description, or null when the shape is usable. */
function gameStateProblem(v: unknown): string | null {
  if (!isObj(v)) return 'game state is not an object';
  if (v.version !== 3) return 'unsupported game version';
  const r = v.rules;
  if (!isObj(r) || typeof r.easierNeutralCities !== 'boolean' || typeof r.fairFirstTurn !== 'boolean' || typeof r.sentriedStayAsGarrison !== 'boolean') return 'invalid house rules';
  const { width, height, wrap, terrain, cities, units, players, fog, currentPlayer, turn, nextUnitId, rngState, winner, over } = v;
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1) return 'invalid map size';
  if (typeof wrap !== 'boolean') return 'invalid wrap flag';
  const area = width * height;
  if (!Array.isArray(terrain) || terrain.length !== area || !terrain.every((t) => TERRAINS.includes(t as string))) return 'invalid terrain';
  if (!Array.isArray(cities) || !cities.every((c) => isObj(c) && typeof c.name === 'string' && c.name !== '')) return 'invalid cities';
  if (!Array.isArray(units) || !units.every((u) => isObj(u) && (u.name === null || typeof u.name === 'string') && isInt(u.blockedTurns) && u.blockedTurns >= 0)) return 'invalid units';
  if (!Array.isArray(players) || players.length < 1 || !players.every(isObj)) return 'invalid players';
  const fogOk = (f: unknown) =>
    isObj(f) && Array.isArray(f.explored) && f.explored.length === area && isObj(f.lastSeen) && isObj(f.knownCityOwner);
  if (!Array.isArray(fog) || fog.length !== players.length || !fog.every(fogOk)) return 'invalid fog of war';
  if (!isInt(currentPlayer) || currentPlayer < 0 || currentPlayer >= players.length) return 'invalid current player';
  if (!isInt(turn) || !isInt(nextUnitId) || typeof rngState !== 'number') return 'invalid turn or counters';
  if (winner !== null && !isInt(winner)) return 'invalid winner';
  if (typeof over !== 'boolean') return 'invalid game-over flag';
  return null;
}

export function parseSave(text: string): { ok: true; save: SaveFile; note?: string } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not a valid save file (unreadable JSON)' };
  }
  if (!isObj(parsed)) return { ok: false, error: 'unsupported save format' };
  const migrated = migrateSave(parsed);
  if (!migrated.ok) return migrated;
  const raw = migrated.save;
  const { name, savedAt, seats, initial, commands, snapshot, rulesVersion } = raw;
  if (typeof name !== 'string' || typeof savedAt !== 'string') return { ok: false, error: 'save file is missing its name or date' };
  if (!isInt(rulesVersion)) return { ok: false, error: 'save file is missing its rules version' };
  if (!Array.isArray(seats) || !seats.every(isSeat)) return { ok: false, error: 'save file has invalid player seats' };
  if (!isObj(initial) || !isObj(snapshot) || !Array.isArray(commands)) return { ok: false, error: 'save file is incomplete' };
  const problem = gameStateProblem(initial) ?? gameStateProblem(snapshot);
  if (problem !== null) return { ok: false, error: `save file has an invalid game state (${problem})` };
  if (seats.length !== (initial.players as unknown[]).length) return { ok: false, error: 'save file seats do not match its players' };
  if (rulesVersion > RULES_VERSION) return { ok: false, error: 'save file is from a newer version of the game' };
  if (rulesVersion !== RULES_VERSION) {
    // Older rules: the history cannot be replayed faithfully, so the snapshot becomes the new starting point.
    try {
      const snap = snapshot as unknown as GameState;
      for (let p = 0; p < snap.players.length; p++) getPlayerView(snap, p);
      const save: SaveFile = { ...(raw as unknown as SaveFile), initial: snap, commands: [], rulesVersion: RULES_VERSION };
      return { ok: true, save, note: OLDER_VERSION_NOTE };
    } catch {
      return { ok: false, error: 'save file is damaged (its game state could not be read)' };
    }
  }
  try {
    const replayed = replay(initial as unknown as GameState, commands as Command[]);
    if (hashState(replayed) !== hashState(snapshot as unknown as GameState)) {
      return { ok: false, error: 'save file is damaged (history does not match)' };
    }
    // Smoke test: every player's view must build, so a malformed state is rejected here rather than at render time.
    for (let p = 0; p < replayed.players.length; p++) getPlayerView(replayed, p);
    return { ok: true, save: { ...(raw as unknown as SaveFile), snapshot: replayed } };
  } catch {
    return { ok: false, error: 'save file is damaged (history could not be replayed)' };
  }
}
