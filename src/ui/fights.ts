import type { GameEvent, PlayerId, Pos, UnitType } from '../engine';
import type { LogEntry } from '../app/session';
import { describeEvent, type DescribeLookup } from './describe';

/** One fight, folded together from a combat event and the destruction or capture events that follow it. */
export interface Fight {
  /** The square that was attacked. */
  at: Pos;
  attackerOwner: PlayerId;
  attackerType: UnitType;
  attackerWon: boolean;
  /** A unit was destroyed in the fight (on either side). */
  destroyed: boolean;
  /** The attacker took a city. */
  captured: boolean;
  /** The caption, e.g. "Computer's Cruiser attacked your Army and won." */
  text: string;
}

/**
 * Folds an event list into fights: each 'combat' starts one, and the 'unitDestroyed' (in combat) and 'cityCaptured'
 * events up to the next combat belong to it. Fights with no caption are left out.
 */
export function fightsFromEvents(events: readonly GameEvent[], describe: (e: GameEvent) => string | null): Fight[] {
  const out: Fight[] = [];
  let cur: Fight | null = null;
  for (const e of events) {
    if (e.type === 'combat') {
      cur = {
        at: { x: e.x, y: e.y }, attackerOwner: e.attackerOwner, attackerType: e.attackerType,
        attackerWon: e.attackerWon, destroyed: false, captured: false, text: describe(e) ?? '',
      };
      out.push(cur);
    } else if (cur && e.type === 'unitDestroyed' && e.reason === 'combat') {
      cur.destroyed = true;
    } else if (cur && e.type === 'cityCaptured') {
      cur.captured = true;
    }
  }
  return out.filter((f) => f.text !== '');
}

/** At most this many fights are replayed at the start of a turn; the rest are left to the Combat report. */
export const REPLAY_CAP = 12;

export interface Replay {
  steps: Fight[];
  /** Fights beyond the cap, left to the Combat report. */
  more: number;
}

/**
 * The fights to replay at the start of the player's turn: those other players started since the start of the previous
 * turn (the same span the Combat report covers), in the order they happened.
 */
export function replayFights(
  entries: readonly LogEntry[], me: PlayerId, names: string[], lookup: DescribeLookup, cap = REPLAY_CAP,
): Replay {
  const starts: number[] = [];
  entries.forEach((e, i) => {
    if (e.event.type === 'turnStarted' && e.event.player === me) starts.push(i);
  });
  const from = starts.length >= 2 ? starts[starts.length - 2] : 0;
  const all = fightsFromEvents(
    entries.slice(from).map((e) => e.event), (e) => describeEvent(e, me, names, lookup),
  ).filter((f) => f.attackerOwner !== me);
  return { steps: all.slice(0, cap), more: Math.max(0, all.length - cap) };
}

/** How long a fight takes to play: your own attack, and one step of the turn-start replay. */
export const FIGHT_MS = 800;
export const REPLAY_STEP_MS = 1500;

export type FightOutcome = 'capture' | 'explosion' | 'hit';

export interface FightFrame {
  /** 0 to 1 through the shot phase (the first part), then held at 1. */
  shots: number;
  /** 0 to 1 through the result burst (the second part), 0 before it begins. */
  burst: number;
  outcome: FightOutcome;
}

/** The share of the duration spent on shots before the result bursts. */
export const SHOT_SHARE = 0.45;

/** Where a fight's animation is at `ageMs` into a run of `durationMs`; null once it is over (or before it starts). */
export function fightFrame(ageMs: number, f: Fight, durationMs = FIGHT_MS): FightFrame | null {
  if (ageMs < 0 || ageMs >= durationMs) return null;
  const p = ageMs / durationMs;
  return {
    shots: Math.min(1, p / SHOT_SHARE),
    burst: p <= SHOT_SHARE ? 0 : (p - SHOT_SHARE) / (1 - SHOT_SHARE),
    outcome: f.captured ? 'capture' : f.destroyed ? 'explosion' : 'hit',
  };
}
