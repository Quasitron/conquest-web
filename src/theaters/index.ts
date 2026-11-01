import type { Relief, Terrain } from '../engine/types';
import { Rng } from '../engine/rng';
import { MAX_PLAYERS } from '../engine/setup';
import type { GeneratedWorld } from '../mapgen';
import index from '../data/theaters/index.json';

/**
 * Historical theaters: real maps of the world's theaters of war, built from public-domain data by
 * tools/theaters/build.mjs. The menu lists the summaries; the map itself is loaded when a game starts.
 */
export interface TheaterSummary {
  id: string;
  name: string;
  /** The wars it is the stage for, e.g. "Napoleonic Wars (1803–15) · World War I ...". */
  wars: string;
  notes: string;
  width: number;
  height: number;
  wrap: boolean;
  cities: number;
  /** The countries a player can start as. */
  nations: string[];
}

export interface TheaterData extends Omit<TheaterSummary, 'cities' | 'nations'> {
  /** One string per row: ~ water, . land, C city. */
  terrain: string[];
  /** One string per row: ~ water, c clear, m mountain, r rough, f forest, v river, d desert. */
  relief: string[];
  cities: { x: number; y: number; name: string; nation: string }[];
  /** `start` is the index of the nation's starting city (its capital, or its biggest city). */
  nations: { name: string; start: number }[];
}

export const THEATERS: readonly TheaterSummary[] = index;

export const theaterById = (id: string): TheaterSummary | undefined => THEATERS.find((t) => t.id === id);

/** Most players a theater takes: one per nation, at most eight. */
export const maxTheaterPlayers = (t: TheaterSummary): number => Math.min(MAX_PLAYERS, t.nations.length);

export async function loadTheater(id: string): Promise<TheaterData> {
  if (!theaterById(id)) throw new Error(`unknown theater "${id}"`);
  const module = await import(`../data/theaters/${id}.json`);
  return module.default as TheaterData;
}

const RELIEF: Record<string, Relief> = { c: 'clear', m: 'mountain', r: 'rough', f: 'forest', v: 'river', d: 'desert' };

/**
 * A theater as a game world: each player is given a different nation, chosen at random from the seed, and starts in that
 * nation's capital. The map's terrain (mountains, rough ground, forest, rivers) belongs to the Advanced rules, so it is
 * left out unless `withRelief`.
 */
export function theaterWorld(
  t: TheaterData, players: number, seed: number, withRelief: boolean, picks: readonly (string | null | undefined)[] = [],
): GeneratedWorld & { nations: string[] } {
  if (players < 2 || players > t.nations.length) throw new Error(`${t.name} takes 2 to ${t.nations.length} players`);
  const wanted = picks.slice(0, players).map((p) => (p ? t.nations.findIndex((n) => n.name === p) : -1));
  const taken = wanted.filter((i) => i >= 0);
  if (new Set(taken).size !== taken.length) throw new Error('Two players cannot be the same country.');
  const terrain: Terrain[] = [];
  const relief: Relief[] = [];
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) {
      const c = t.terrain[y][x];
      terrain.push(c === '~' ? 'water' : c === 'C' ? 'city' : 'land');
      relief.push(RELIEF[t.relief[y][x]] ?? 'clear');
    }
  }
  const rng = new Rng(seed ^ 0x7ea7e7);
  const order = t.nations.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // Seats that picked a country get it; the others take the rest in the shuffled order.
  const rest = order.filter((i) => !taken.includes(i));
  const chosen = Array.from({ length: players }, (_, s) => t.nations[wanted[s] >= 0 ? wanted[s] : rest.shift()!]);
  return {
    map: {
      width: t.width, height: t.height, terrain, ...(withRelief ? { relief } : {}),
      cities: t.cities.map(({ x, y }) => ({ x, y })),
    },
    startCityIndices: chosen.map((n) => n.start),
    seedUsed: seed,
    cityNames: t.cities.map((c) => c.name),
    nations: chosen.map((n) => n.name),
  };
}
