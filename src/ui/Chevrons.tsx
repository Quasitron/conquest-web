import { RANK_NAMES } from '../engine';

/** Gold promotion chevrons after a unit's name: one to three, nothing for an unpromoted unit. */
export function Chevrons({ rank }: { rank: number }) {
  if (rank <= 0) return null;
  return <span class="chevrons" title={RANK_NAMES[rank]}> {'^'.repeat(rank)}</span>;
}