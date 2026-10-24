import type { Domain, Unit, UnitType } from './types';

export interface UnitStats {
  name: string;
  domain: Domain;
  move: number;
  hits: number;
  attack: number;
  defense: number;
  shot: number;
  range: number | null;
  carries: UnitType | null;
  capacity: number;
  capacityLossPerDamage: number;
  build: number;
  buildRepeat: number;
  bombard: boolean;
  seesSubs: boolean;
}

export const UNIT_TYPES: readonly UnitType[] = [
  'army', 'fighter', 'transport', 'destroyer', 'submarine', 'cruiser', 'battleship', 'carrier',
];

const base = { range: null, carries: null, capacity: 0, capacityLossPerDamage: 0, bombard: false, seesSubs: false };

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  army:       { ...base, name: 'Army',       domain: 'land', move: 1, hits: 1,  attack: 2, defense: 2, shot: 1, build: 6,  buildRepeat: 5 },
  fighter:    { ...base, name: 'Fighter',    domain: 'air',  move: 5, hits: 1,  attack: 2, defense: 2, shot: 1, build: 12, buildRepeat: 10, range: 20 },
  transport:  { ...base, name: 'Transport',  domain: 'sea',  move: 2, hits: 3,  attack: 1, defense: 1, shot: 1, build: 30, buildRepeat: 25, carries: 'army', capacity: 6, capacityLossPerDamage: 2 },
  destroyer:  { ...base, name: 'Destroyer',  domain: 'sea',  move: 3, hits: 3,  attack: 2, defense: 2, shot: 1, build: 24, buildRepeat: 20, seesSubs: true },
  submarine:  { ...base, name: 'Submarine',  domain: 'sea',  move: 2, hits: 2,  attack: 2, defense: 1, shot: 3, build: 24, buildRepeat: 20, seesSubs: true },
  cruiser:    { ...base, name: 'Cruiser',    domain: 'sea',  move: 2, hits: 8,  attack: 2, defense: 2, shot: 2, build: 42, buildRepeat: 35, bombard: true, seesSubs: true },
  battleship: { ...base, name: 'Battleship', domain: 'sea',  move: 2, hits: 12, attack: 2, defense: 2, shot: 3, build: 60, buildRepeat: 50, bombard: true },
  carrier:    { ...base, name: 'Carrier',    domain: 'sea',  move: 2, hits: 8,  attack: 1, defense: 2, shot: 1, build: 48, buildRepeat: 40, carries: 'fighter', capacity: 8, capacityLossPerDamage: 1 },
};

/** Cities defend like an army and never attack. */
export const CITY_COMBAT = { defense: 2, shot: 1, hits: 1 } as const;

/** With the city strength house rule a city takes this many hits to fall, and wins back one hit per turn. */
export const CITY_STRENGTH_HITS = 3;

export function isCrippled(u: Unit): boolean {
  return u.damage > 0 && u.damage * 2 >= UNIT_STATS[u.type].hits;
}

export function effectiveMove(u: Unit): number {
  return isCrippled(u) ? 1 : UNIT_STATS[u.type].move;
}

export function cargoCapacity(u: Unit): number {
  const st = UNIT_STATS[u.type];
  return Math.max(0, st.capacity - st.capacityLossPerDamage * u.damage);
}
