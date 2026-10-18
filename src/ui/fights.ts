import type { GameEvent, PlayerId, Pos, UnitType } from '../engine';
import type { LogEntry } from '../app/session';
import type { ReplayPace } from './combatMode';
import { describeEvent, type DescribeLookup } from './describe';

/** One fight, folded together from a combat event and the destruction or capture events that follow it. */
export interface Fight {
  /** The square that was attacked. */
  at: Pos;
  attackerId: number;
  /** The square the attacker fought from, or null when the record does not say. */
  from: Pos | null;
  attackerOwner: PlayerId;
  /** Whose unit or city was attacked (null for a neutral city). */
  defenderOwner: PlayerId | null;
  attackerType: UnitType;
  /** The defending unit's type; null when the defender was a city. */
  defenderType: UnitType | null;
  attackerWon: boolean;
  /** The winning attacker moved into the defender's square afterwards. */
  moved: boolean;
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
        at: { x: e.x, y: e.y }, attackerId: e.attackerId, from: e.from ? { ...e.from } : null,
        attackerOwner: e.attackerOwner, defenderOwner: e.defender.owner, attackerType: e.attackerType,
        defenderType: e.defender.kind === 'unit' ? e.defender.unitType : null,
        attackerWon: e.attackerWon, moved: false, destroyed: false, captured: false, text: describe(e) ?? '',
      };
      out.push(cur);
    } else if (cur && e.type === 'unitDestroyed' && e.reason === 'combat') {
      cur.destroyed = true;
    } else if (cur && e.type === 'cityCaptured') {
      cur.captured = true;
    } else if (cur && e.type === 'unitMoved' && e.unitId === cur.attackerId && e.to.x === cur.at.x && e.to.y === cur.at.y) {
      cur.moved = true; // the winner moved into the loser's square
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
export const FIGHT_MS = 1000;
export const REPLAY_STEP_MS = 1500;

export type FightOutcome = 'capture' | 'explosion' | 'hit';

export interface FightFrame {
  /** 0 to 1 through the shot phase (the first part), then held at 1. */
  shots: number;
  /** 0 to 1 through the result burst (the middle part); 0 before it begins, 1 after. */
  burst: number;
  /** 0 to 1 through the last part, when a winner that moves slides into the loser's square; 0 before it begins. */
  slide: number;
  outcome: FightOutcome;
}

/** The share of the duration spent on shots before the result bursts, and where the burst ends (the slide follows). */
export const SHOT_SHARE = 0.4;
export const BURST_END = 0.75;

/** Where a fight's animation is at `ageMs` into a run of `durationMs`; null once it is over (or before it starts). */
export function fightFrame(ageMs: number, f: Fight, durationMs = FIGHT_MS): FightFrame | null {
  if (ageMs < 0 || ageMs >= durationMs) return null;
  const p = ageMs / durationMs;
  return {
    shots: Math.min(1, p / SHOT_SHARE),
    burst: p <= SHOT_SHARE ? 0 : Math.min(1, (p - SHOT_SHARE) / (BURST_END - SHOT_SHARE)),
    slide: p <= BURST_END ? 0 : (p - BURST_END) / (1 - BURST_END),
    outcome: f.captured ? 'capture' : f.destroyed ? 'explosion' : 'hit',
  };
}

/** A unit drawn during a fight, at a (possibly fractional) map square. */
export interface FightActor {
  x: number;
  y: number;
  alpha: number;
  owner: PlayerId;
  type: UnitType;
}

/**
 * The two units of a fight as they should be drawn at this moment: both on their own squares for the shots, the
 * loser fading out in the burst, and a winning attacker that moves sliding into the loser's square at the end. The
 * map has already moved on to the result, so these stand in for the real units while the fight plays. A defending
 * city is not an actor (it is part of the map); the attacker's start square may be unknown, in which case it is left out.
 */
export function fightActors(f: Fight, fr: FightFrame): FightActor[] {
  const out: FightActor[] = [];
  const loserAlpha = Math.max(0, 1 - fr.burst);
  if (f.from) {
    let { x, y } = f.from;
    const slides = f.attackerWon && (f.moved || f.captured);
    if (slides) {
      x = f.from.x + (f.at.x - f.from.x) * fr.slide;
      y = f.from.y + (f.at.y - f.from.y) * fr.slide;
    }
    out.push({ x, y, alpha: f.attackerWon ? 1 : loserAlpha, owner: f.attackerOwner, type: f.attackerType });
  }
  if (f.defenderType !== null && f.defenderOwner !== null) {
    out.push({ x: f.at.x, y: f.at.y, alpha: f.attackerWon ? loserAlpha : 1, owner: f.defenderOwner, type: f.defenderType });
  }
  return out;
}
/** How long (ms) a fight is held at each pace; manual waits for the player. */
export const PACE_MS: Record<ReplayPace, number | null> = { manual: null, slow: 3000, normal: 1500, fast: 800 };
/** Fights that matter to you (one of your units destroyed, a city taken) are held this much longer. */
export const IMPORTANT_FACTOR = 1.6;

/** A fight that destroyed one of `me`'s units or took one of their cities, or that took any city. */
export function fightImportant(f: Fight, me: PlayerId): boolean {
  if (f.captured) return true;
  return f.destroyed && (f.defenderOwner === me || f.attackerOwner === me);
}

/** How long to hold a fight before moving on at this pace; null in manual (the player decides). */
export function stepDuration(pace: ReplayPace, f: Fight, me: PlayerId): number | null {
  const base = PACE_MS[pace];
  if (base === null) return null;
  return Math.round(base * (fightImportant(f, me) ? IMPORTANT_FACTOR : 1));
}

/** "near Norfolk Island": the closest known city, if one is within `range` squares; null otherwise. */
export function placeNote(
  at: Pos, cities: readonly { name: string; x: number; y: number }[],
  distance: (a: Pos, b: Pos) => number, range = 12,
): string | null {
  let best: { name: string; d: number } | null = null;
  for (const c of cities) {
    const d = distance(at, c);
    if (d <= range && (best === null || d < best.d)) best = { name: c.name, d };
  }
  return best ? `near ${best.name}` : null;
}
