import type { Command, GameState } from '../engine';
import { hashState, replay } from '../engine';

export interface SeatConfig {
  name: string;
  kind: 'human' | 'idle';
  color: string;
}

export interface SaveFile {
  format: 1;
  savedAt: string;
  name: string;
  seats: SeatConfig[];
  initial: GameState;
  commands: Command[];
  snapshot: GameState;
}

export function serializeSave(save: SaveFile): string {
  return JSON.stringify(save);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function isSeat(v: unknown): v is SeatConfig {
  return isObj(v) && typeof v.name === 'string' && (v.kind === 'human' || v.kind === 'idle') && typeof v.color === 'string';
}

export function parseSave(text: string): { ok: true; save: SaveFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not a valid save file (unreadable JSON)' };
  }
  if (!isObj(raw) || raw.format !== 1) return { ok: false, error: 'unsupported save format' };
  const { name, savedAt, seats, initial, commands, snapshot } = raw;
  if (typeof name !== 'string' || typeof savedAt !== 'string') return { ok: false, error: 'save file is missing its name or date' };
  if (!Array.isArray(seats) || !seats.every(isSeat)) return { ok: false, error: 'save file has invalid player seats' };
  if (!isObj(initial) || !isObj(snapshot) || !Array.isArray(commands)) return { ok: false, error: 'save file is incomplete' };
  if (initial.version !== 1 || !Array.isArray(initial.players)) return { ok: false, error: 'unsupported game version' };
  if (seats.length !== initial.players.length) return { ok: false, error: 'save file seats do not match its players' };
  try {
    const replayed = replay(initial as unknown as GameState, commands as Command[]);
    if (hashState(replayed) !== hashState(snapshot as unknown as GameState)) {
      return { ok: false, error: 'save file is damaged (history does not match)' };
    }
  } catch {
    return { ok: false, error: 'save file is damaged (history could not be replayed)' };
  }
  return { ok: true, save: raw as unknown as SaveFile };
}
