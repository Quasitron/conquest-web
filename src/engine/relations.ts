import type { GameState, PlayerId } from './types';

/**
 * The single place that decides whether two owners are friendly.
 * v1: a player is friendly only to itself. Alliances later change only this.
 */
export function areFriendly(_s: GameState, a: PlayerId | null, b: PlayerId | null): boolean {
  return a !== null && a === b;
}
