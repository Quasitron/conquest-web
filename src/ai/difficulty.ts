/**
 * The computer player's difficulty. It is chosen per computer player when a game is set up (the seat's `difficulty`;
 * a seat with none, such as one from an older save, plays at Normal). The levels only change how the AI chooses
 * what to do; the rules are the same for everyone, so no game history is affected.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

export interface AiTuning {
  /** Armies that must be massed beside a held city before the assault, and the (smaller) number late in a stalled game. */
  assaultArmies: number;
  lateAssaultArmies: number;
  /** Armies waiting in the port before its transport sails, and the number late in a stalled game. */
  armiesToSail: number;
  lateArmiesToSail: number;
  /** Armies a threatened city keeps at home. */
  garrison: number;
  /** The fleet is not built before this turn, and never grows beyond this many warships. */
  fleetFromTurn: number;
  maxWarships: number;
  /** Cities per extra warship in the fleet (fewer cities per ship means a bigger fleet). */
  citiesPerWarship: number;
  /** A warship attacks an adjacent enemy ship only when its chance to win is at least this. */
  minShipWinChance: number;
  /** Percent of turns on which a unit that needs orders is simply left alone (0 = never). */
  idlePercent: number;
  /** Warships escort loaded transports at sea (Hard only). */
  escorts: boolean;
  /** Transports steer around sea squares near enemy warships seen lately (Hard only). */
  avoidPatrols: boolean;
}

/**
 * Normal is the computer player as it has always been. Easy masses more before it attacks, builds a smaller and later
 * fleet, only fights ships it is sure to beat, and leaves some units idle each turn. Hard strikes with smaller forces,
 * builds its fleet earlier and bigger and misses nothing; its new abilities switch on at Hard first (escorts and patrol-avoidance so far; scouts and submarines/carriers to come).
 */
export const TUNING: Record<Difficulty, AiTuning> = {
  easy: {
    assaultArmies: 5, lateAssaultArmies: 4, armiesToSail: 5, lateArmiesToSail: 4, garrison: 1,
    fleetFromTurn: 24, maxWarships: 4, citiesPerWarship: 3, minShipWinChance: 0.7, idlePercent: 25, escorts: false, avoidPatrols: false,
  },
  normal: {
    assaultArmies: 3, lateAssaultArmies: 2, armiesToSail: 3, lateArmiesToSail: 2, garrison: 2,
    fleetFromTurn: 12, maxWarships: 8, citiesPerWarship: 2, minShipWinChance: 0.45, idlePercent: 0, escorts: false, avoidPatrols: false,
  },
  hard: {
    assaultArmies: 2, lateAssaultArmies: 1, armiesToSail: 2, lateArmiesToSail: 2, garrison: 3,
    fleetFromTurn: 8, maxWarships: 10, citiesPerWarship: 1, minShipWinChance: 0.4, idlePercent: 0, escorts: true, avoidPatrols: true,
  },
};

export const tuningFor = (d: Difficulty | undefined): AiTuning => TUNING[d ?? DEFAULT_DIFFICULTY];

/** Whether a unit is left alone this turn (a fixed pseudo-random choice from its id and the turn, so it never flickers). */
export function leftIdle(unitId: number, turn: number, idlePercent: number): boolean {
  if (idlePercent <= 0) return false;
  const h = Math.imul(unitId + 1, 2654435761) ^ Math.imul(turn + 7, 40503);
  return (h >>> 0) % 100 < idlePercent;
}