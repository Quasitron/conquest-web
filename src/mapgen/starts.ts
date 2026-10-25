import type { Pos } from '../engine/types';
import { chebyshevDist } from './grid';
import type { StartMode } from './options';

/**
 * Picks one start city per player. Candidates are cities whose landmass holds at least `minOthers` other cities.
 * Greedy farthest-point selection, preferring landmasses not yet used. Returns indices into `cities`, or null.
 */
export function chooseStarts(
  cities: Pos[], labels: number[], width: number, wrap: boolean, players: number, minOthers: number, mode: StartMode = 'auto',
): number[] | null {
  const labelOf = (i: number) => labels[cities[i].y * width + cities[i].x];
  const perLandmass = new Map<number, number>();
  cities.forEach((_, i) => perLandmass.set(labelOf(i), (perLandmass.get(labelOf(i)) ?? 0) + 1));
  let candidates = cities.map((_, i) => i).filter((i) => (perLandmass.get(labelOf(i)) ?? 0) >= minOthers + 1);
  if (candidates.length < players) return null;
  if (mode === 'separate' && new Set(candidates.map(labelOf)).size < players) return null;

  // First start: a city on the landmass with the most cities (lowest index on ties).
  let first = candidates[0];
  for (const i of candidates) {
    if ((perLandmass.get(labelOf(i)) ?? 0) > (perLandmass.get(labelOf(first)) ?? 0)) first = i;
  }
  // Together: everyone starts on the first player's landmass, so there must be room for them all there.
  if (mode === 'together') {
    candidates = candidates.filter((i) => labelOf(i) === labelOf(first));
    if (candidates.length < players) return null;
  }
  const chosen = [first];
  const usedLandmasses = new Set([labelOf(first)]);
  while (chosen.length < players) {
    let best = -1;
    let bestScore = -Infinity;
    for (const i of candidates) {
      if (chosen.includes(i)) continue;
      if (mode === 'separate' && usedLandmasses.has(labelOf(i))) continue; // its own landmass, or no start
      const minDist = Math.min(
        ...chosen.map((c) => chebyshevDist(width, wrap, cities[i].x, cities[i].y, cities[c].x, cities[c].y)),
      );
      const score = (usedLandmasses.has(labelOf(i)) ? 0 : 1_000_000) + minDist;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === -1) return null;
    chosen.push(best);
    usedLandmasses.add(labelOf(best));
  }
  return chosen;
}
