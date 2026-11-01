import type { GameState, PlayerId } from './types';

/** The single place that decides whether two owners are friendly: a player is friendly to itself and to its teammates (same `team`). */
export function areFriendly(s: GameState, a: PlayerId | null, b: PlayerId | null): boolean {
  if (a === null || b === null) return false;
  if (a === b) return true;
  const ta = s.players[a]?.team;
  return ta !== undefined && ta === s.players[b]?.team;
}

/** The other players on this player's team (not including itself). */
export function teammatesOf(s: GameState, pid: PlayerId): PlayerId[] {
  return s.players.filter((p) => p.id !== pid && areFriendly(s, p.id, pid)).map((p) => p.id);
}
