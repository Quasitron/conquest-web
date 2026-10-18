import type { DestroyReason, GameState, PlayerId, PlayerStats, UnitType } from './types';

export const emptyStats = (): PlayerStats => ({ killed: {}, lost: {} });

/** Destruction that counts as a loss for the owner; disbanding, resigning and a capturing army do not. */
const COUNTS_AS_LOSS: readonly DestroyReason[] = ['combat', 'cargoLost', 'crashed'];

/**
 * Notes a destroyed unit in the per-player counters: a loss for its owner, and a kill for `killer` when an enemy
 * destroyed it. Games saved before the counters existed get them from the first event on.
 */
export function recordDestroyed(
  s: GameState, owner: PlayerId, type: UnitType, reason: DestroyReason, killer: PlayerId | null | undefined,
): void {
  if (!COUNTS_AS_LOSS.includes(reason)) return;
  s.stats ??= s.players.map(emptyStats);
  const lost = s.stats[owner].lost;
  lost[type] = (lost[type] ?? 0) + 1;
  if (killer !== null && killer !== undefined && killer !== owner) {
    const killed = s.stats[killer].killed;
    killed[type] = (killed[type] ?? 0) + 1;
  }
}
