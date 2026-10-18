import { UNIT_STATS, type PlayerId, type PlayerView, type Pos, type UnitType } from '../engine';
import type { LogEntry } from '../app/session';
import { describeEvent, type DescribeLookup } from './describe';

export interface BattleLine {
  turn: number;
  /** "Computer's Cruiser attacked your Army and won." */
  text: string;
  /** The square that was attacked. */
  at: Pos;
  /** True when the attacker won. */
  attackerWon: boolean;
}

/**
 * Battles that others started and that you could see, since the start of your previous turn (so everything the
 * other players did between your last turn and this one). Empty when the log does not reach back that far, as
 * after a reload.
 */
export function battlesAgainstMe(
  entries: readonly LogEntry[], me: PlayerId, names: string[], lookup: DescribeLookup,
): BattleLine[] {
  const starts: number[] = [];
  entries.forEach((e, i) => {
    if (e.event.type === 'turnStarted' && e.event.player === me) starts.push(i);
  });
  // The latest start is the turn now under way; the one before it opens the span we want.
  const from = starts.length >= 2 ? starts[starts.length - 2] : 0;
  const out: BattleLine[] = [];
  for (const entry of entries.slice(from)) {
    const e = entry.event;
    if (e.type !== 'combat' || e.attackerOwner === me) continue;
    const text = describeEvent(e, me, names, lookup);
    if (text !== null) out.push({ turn: entry.turn, text, at: { x: e.x, y: e.y }, attackerWon: e.attackerWon });
  }
  return out;
}

export interface Sighting {
  type: UnitType;
  /** Name of the player it belongs to. */
  owner: string;
  at: Pos;
  /** The turn it was last seen. */
  turnSeen: number;
  /** In sight right now, as opposed to last seen. */
  visibleNow: boolean;
}

/** Enemy units seen since your last turn: those in sight now first, then the most recently seen. */
export function recentSightings(view: PlayerView, names: string[]): Sighting[] {
  return view.enemies
    .filter((e) => e.visibleNow || e.turnSeen >= view.turn - 1)
    .map((e): Sighting => ({
      type: e.type, owner: names[e.owner] ?? `Player ${e.owner + 1}`, at: { x: e.x, y: e.y },
      turnSeen: e.turnSeen, visibleNow: e.visibleNow,
    }))
    .sort((a, b) => Number(b.visibleNow) - Number(a.visibleNow) || b.turnSeen - a.turnSeen
      || UNIT_STATS[a.type].name.localeCompare(UNIT_STATS[b.type].name));
}
