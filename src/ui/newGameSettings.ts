import { validateMapSize, type HouseRules } from '../engine';
import type { CityDensity, Landmass, WorldOptions } from '../mapgen';
import type { SeatConfig } from '../storage';
import { PLAYER_COLORS } from './colors';
import { DIFFICULTIES, type Difficulty } from '../ai/difficulty';

/** What the New Game form remembers between visits. The seed is deliberately not part of it: it is random each time. */
export interface NewGameSettings {
  world: WorldOptions;
  seats: SeatConfig[];
  rules: HouseRules;
}

export const NEW_GAME_KEY = 'conquest.newGame';

const LANDMASS: readonly Landmass[] = ['islands', 'mixed', 'continents'];
const DENSITY: readonly CityDensity[] = ['low', 'normal', 'high'];
const REGIONS: readonly WorldOptions['nameRegion'][] = [
  'world', 'europe', 'northAmerica', 'latinAmerica', 'asia', 'africaMiddleEast', 'oceania',
];
const STARTS: readonly WorldOptions['starts'][] = ['auto', 'separate', 'together'];
const KINDS: readonly SeatConfig['kind'][] = ['human', 'ai', 'idle'];

/** The seats a fresh form starts with: `n` of them, reusing the ones in `prev`. */
export const defaultSeats = (n: number, prev: SeatConfig[]): SeatConfig[] =>
  Array.from({ length: n }, (_, i) =>
    prev[i] ?? { name: i === 0 ? 'Player 1' : `Player ${i + 1}`, kind: i === 0 ? 'human' : 'ai', color: PLAYER_COLORS[i] },
  );

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function validSeat(v: unknown): v is SeatConfig {
  return isObj(v) && typeof v.name === 'string' && v.name.length <= 40
    && KINDS.includes(v.kind as SeatConfig['kind']) && typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color)
    && (v.difficulty === undefined || DIFFICULTIES.includes(v.difficulty as Difficulty));
}

/**
 * Reads stored settings, keeping each field that is valid and falling back to `fallback` for the rest, so an old,
 * hand-edited or half-written value can never break the form.
 */
export function parseNewGameSettings(raw: unknown, fallback: NewGameSettings): NewGameSettings {
  if (!isObj(raw)) return fallback;
  const w = isObj(raw.world) ? raw.world : {};
  const world: WorldOptions = { ...fallback.world };
  if (isInt(w.width) && isInt(w.height) && validateMapSize(w.width, w.height) === null) {
    world.width = w.width;
    world.height = w.height;
  }
  if (typeof w.wrap === 'boolean') world.wrap = w.wrap;
  if (isInt(w.waterPercent) && w.waterPercent >= 60 && w.waterPercent <= 85) world.waterPercent = w.waterPercent;
  if (LANDMASS.includes(w.landmass as Landmass)) world.landmass = w.landmass as Landmass;
  if (DENSITY.includes(w.cityDensity as CityDensity)) world.cityDensity = w.cityDensity as CityDensity;
  if (isInt(w.players) && w.players >= 2 && w.players <= 6) world.players = w.players;
  if (STARTS.includes(w.starts as WorldOptions['starts'])) world.starts = w.starts as WorldOptions['starts'];
  if (REGIONS.includes(w.nameRegion as WorldOptions['nameRegion'])) world.nameRegion = w.nameRegion as WorldOptions['nameRegion'];

  const stored = Array.isArray(raw.seats) ? raw.seats.filter(validSeat) : [];
  const seats = defaultSeats(world.players, stored.length > 0 ? stored : fallback.seats);
  // A game needs at least one human seat.
  if (!seats.some((s) => s.kind === 'human')) seats[0] = { ...seats[0], kind: 'human' };

  const rules: HouseRules = { ...fallback.rules };
  const r = isObj(raw.rules) ? raw.rules : {};
  for (const key of Object.keys(rules) as (keyof HouseRules)[]) {
    if (typeof r[key] === 'boolean') rules[key] = r[key] as boolean;
  }
  return { world, seats, rules };
}

/** The remembered settings, or `fallback` when there are none (or storage is blocked or unreadable). */
export function loadNewGameSettings(fallback: NewGameSettings): NewGameSettings {
  try {
    const raw = globalThis.localStorage?.getItem(NEW_GAME_KEY);
    if (raw) return parseNewGameSettings(JSON.parse(raw), fallback);
  } catch { /* storage blocked or unreadable: use the defaults */ }
  return fallback;
}

export function saveNewGameSettings(s: NewGameSettings): void {
  try {
    globalThis.localStorage?.setItem(NEW_GAME_KEY, JSON.stringify(s));
  } catch { /* storage blocked: the form simply starts from the defaults next time */ }
}
