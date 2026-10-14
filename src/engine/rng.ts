/** A source of uniform random numbers in [0, 1). */
export interface RandomSource {
  next(): number;
}

/** One step of mulberry32: returns [value in [0, 1), next state]. */
export function nextRandom(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Seeded PRNG whose entire state is one 32-bit integer, so it can live in GameState. */
export class Rng implements RandomSource {
  constructor(public state: number) {}

  next(): number {
    const [value, next] = nextRandom(this.state);
    this.state = next;
    return value;
  }
}
