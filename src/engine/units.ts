import type { Domain, Relief, Unit, UnitType } from './types';

export interface UnitStats {
  name: string;
  domain: Domain;
  move: number;
  hits: number;
  attack: number;
  defense: number;
  shot: number;
  range: number | null;
  /** The unit types this one carries (empty for most). */
  carries: readonly UnitType[];
  capacity: number;
  capacityLossPerDamage: number;
  build: number;
  buildRepeat: number;
  bombard: boolean;
  seesSubs: boolean;
  /** Cargo space this unit takes aboard a transport (Armor takes two). */
  slots: number;
  /** Only built when the Advanced units house rule is on. */
  advanced: boolean;
  /** Cities can build it (an Airbase is made from a land unit instead). */
  producible: boolean;
  /** Wins promote this unit (the promotions house rule): None, Experienced, Veteran, Elite. */
  promotes: boolean;
}

export const UNIT_TYPES: readonly UnitType[] = [
  'army', 'armor', 'fighter', 'bomber', 'transport', 'destroyer', 'submarine', 'cruiser', 'battleship', 'carrier', 'airbase',
];

const base = { range: null, carries: [] as readonly UnitType[], capacity: 0, slots: 1, advanced: false, producible: true, capacityLossPerDamage: 0, bombard: false, seesSubs: false, promotes: false };

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  army:       { ...base, name: 'Army',       domain: 'land', move: 1, hits: 1,  attack: 2, defense: 2, shot: 1, build: 6,  buildRepeat: 5 },
  armor:      { ...base, advanced: true, promotes: true, slots: 2, name: 'Armor', domain: 'land', move: 2, hits: 2,  attack: 2, defense: 2, shot: 1, build: 12, buildRepeat: 10 },
  fighter:    { ...base, name: 'Fighter',    domain: 'air',  move: 5, hits: 1,  attack: 2, defense: 2, shot: 1, build: 12, buildRepeat: 10, range: 20 },
  bomber:     { ...base, advanced: true, name: 'Bomber', domain: 'air', move: 4, hits: 1, attack: 2, defense: 2, shot: 2, build: 12, buildRepeat: 10, range: 24 },
  transport:  { ...base, promotes: true, name: 'Transport',  domain: 'sea',  move: 2, hits: 3,  attack: 1, defense: 1, shot: 1, build: 30, buildRepeat: 25, carries: ['army', 'armor'], capacity: 6, capacityLossPerDamage: 2 },
  destroyer:  { ...base, promotes: true, name: 'Destroyer',  domain: 'sea',  move: 3, hits: 3,  attack: 2, defense: 2, shot: 1, build: 24, buildRepeat: 20, seesSubs: true },
  submarine:  { ...base, promotes: true, name: 'Submarine',  domain: 'sea',  move: 2, hits: 2,  attack: 2, defense: 1, shot: 3, build: 24, buildRepeat: 20, seesSubs: true },
  cruiser:    { ...base, promotes: true, name: 'Cruiser',    domain: 'sea',  move: 2, hits: 8,  attack: 2, defense: 2, shot: 2, build: 42, buildRepeat: 35, bombard: true, seesSubs: true },
  battleship: { ...base, promotes: true, name: 'Battleship', domain: 'sea',  move: 2, hits: 12, attack: 2, defense: 2, shot: 3, build: 60, buildRepeat: 50, bombard: true },
  carrier:    { ...base, promotes: true, name: 'Carrier',    domain: 'sea',  move: 2, hits: 8,  attack: 1, defense: 2, shot: 1, build: 48, buildRepeat: 40, carries: ['fighter'], capacity: 8, capacityLossPerDamage: 1 },
  /** Made from an Army or Armor on open land; never moves or attacks, and holds up to eight aircraft of either kind. */
  airbase:    { ...base, advanced: true, producible: false, name: 'Airbase', domain: 'land', move: 0, hits: 1, attack: 0, defense: 2, shot: 1, build: 0, buildRepeat: 0, carries: ['fighter', 'bomber'], capacity: 8 },
};

/** Cities defend like an army and never attack. */
export const CITY_COMBAT = { defense: 2, shot: 1, hits: 1 } as const;

/** With the city strength house rule a city takes this many hits to fall, and wins back one hit per turn. */
export const CITY_STRENGTH_HITS = 3;

/** With the garrisons defend house rule each land unit in a city adds 1 defence, up to this much. */
export const GARRISON_MAX_BONUS = 2;

/** The defence a garrison of `landUnits` land units adds to its city. */
export function garrisonBonus(landUnits: number): number {
  return Math.min(GARRISON_MAX_BONUS, landUnits);
}

export function isCrippled(u: Unit): boolean {
  return u.damage > 0 && u.damage * 2 >= UNIT_STATS[u.type].hits;
}

export function effectiveMove(u: Unit): number {
  return isCrippled(u) ? 1 : UNIT_STATS[u.type].move;
}

/** Whether a carrier of type carrier takes units of type cargo. */
export function canCarry(carrier: UnitType, cargo: UnitType): boolean {
  return UNIT_STATS[carrier].carries.includes(cargo);
}

/** The cargo space these units take up (Armor takes two). */
export function cargoUsed(cargo: readonly Pick<Unit, 'type'>[]): number {
  return cargo.reduce((n, c) => n + UNIT_STATS[c.type].slots, 0);
}

/** Whether `host` with `aboard` already on it can take one more unit of type `type`. */
export function hostHasRoom(host: Unit, aboard: readonly Pick<Unit, 'type'>[], type: UnitType): boolean {
  return canCarry(host.type, type) && cargoCapacity(host) - cargoUsed(aboard) >= UNIT_STATS[type].slots;
}

/** The unit types a game builds: the Advanced ones only with the Advanced units house rule. */
export function buildableTypes(rules: { advancedUnits: boolean }): UnitType[] {
  return UNIT_TYPES.filter((t) => UNIT_STATS[t].producible && (rules.advancedUnits || !UNIT_STATS[t].advanced));
}

/** The land units that can turn themselves into an Airbase. */
export function canBecomeAirbase(type: UnitType): boolean {
  return type === 'army' || type === 'armor';
}

/**
 * Terrain's help to a defending land unit (Advanced rules, Appendix III): in a forest or on a mountain its defence is
 * doubled against every attacker but an Army (the original's Infantry), and in a river against Armor.
 */
export function doublesDefense(att: UnitType, def: UnitType, ground: Relief): boolean {
  if (def !== 'army' && def !== 'armor') return false;
  if (ground === 'forest' || ground === 'mountain') return att !== 'army';
  return ground === 'river' && att === 'armor';
}

/** Armor cannot enter mountains, and its move is cut to one in rough, river and forest squares. */
export function armorBlockedBy(ground: Relief): boolean {
  return ground === 'mountain';
}
export function armorSlowedBy(ground: Relief): boolean {
  return ground === 'rough' || ground === 'river' || ground === 'forest';
}

/**
 * The attack and defence ratings in a fight between two unit types. A Bomber fights poorly (1) against a Fighter either
 * way round, and with the Advanced units rule every ship but a Carrier attacks aircraft at 1.
 */
export function fightRatings(
  rules: { advancedUnits: boolean }, att: UnitType, def: UnitType, defGround: Relief = 'clear',
): { attack: number; defense: number } {
  let attack = UNIT_STATS[att].attack;
  let defense = UNIT_STATS[def].defense;
  if (rules.advancedUnits && doublesDefense(att, def, defGround)) defense *= 2;
  if (UNIT_STATS[def].domain === 'air' && UNIT_STATS[att].domain === 'sea' && att !== 'carrier' && rules.advancedUnits) attack = Math.min(attack, 1);
  if (att === 'bomber' && def === 'fighter') attack = 1;
  if (def === 'bomber' && att === 'fighter') defense = 1;
  return { attack, defense };
}

/** Submarine strike rule: the ships a submarine can torpedo from the dark (none of them can see it coming). */
export const STRIKE_TARGETS: readonly UnitType[] = ['transport', 'carrier', 'battleship'];
/** The chance the opening torpedo salvo hits. A hit does the submarine's full shot in damage. */
export const STRIKE_CHANCE = 0.7;
export function isStrikeTarget(att: UnitType, def: UnitType): boolean {
  return att === 'submarine' && STRIKE_TARGETS.includes(def);
}

export function cargoCapacity(u: Unit): number {
  const st = UNIT_STATS[u.type];
  return Math.max(0, st.capacity - st.capacityLossPerDamage * u.damage);
}

/** Wins needed for Experienced, Veteran and Elite (the promotions house rule). */
export const RANK_WINS = [1, 3, 5] as const;
export const RANK_NAMES = ['Green', 'Experienced', 'Veteran', 'Elite'] as const;
/** 0 (none) to 3 (Elite) for a unit's number of wins. */
export function rankOf(wins: number | undefined): number {
  const w = wins ?? 0;
  return RANK_WINS.filter((n) => w >= n).length;
}
/** The hits a unit can take in combat: Elite units take one more. */
export function hitsOf(u: Unit): number {
  return UNIT_STATS[u.type].hits + (rankOf(u.wins) === 3 ? 1 : 0);
}
