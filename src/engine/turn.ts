import type { GameEvent, GameState, PlayerId } from './types';
import type { RandomSource } from './rng';
import { Rng } from './rng';
import { runPlayerOrders } from './orders';
import { UNIT_STATS, effectiveMove } from './units';
import { cityAt, destroyUnit, isAtRefuelPoint } from './query';
import { areFriendly } from './relations';
import { advanceProduction } from './production';
import { updateFog } from './fog';
import { inOwnCity, unloadCargo } from './cargo';

function finishPlayerTurn(s: GameState, pid: PlayerId, events: GameEvent[]): void {
  for (const u of [...s.units]) {
    if (u.owner !== pid || UNIT_STATS[u.type].domain !== 'air' || isAtRefuelPoint(s, u)) continue;
    u.fuel = (u.fuel ?? 0) - u.movesLeft;
    u.movesLeft = 0;
    if (u.fuel <= 0) destroyUnit(s, u, 'crashed', events);
  }
  for (const u of s.units) {
    if (u.owner !== pid || u.movedThisTurn || u.damage === 0) continue;
    const c = cityAt(s, u.x, u.y);
    if (c && areFriendly(s, c.owner, pid)) u.damage -= 1;
  }
}

/**
 * A player is knocked out at the end of their turn when they hold no city and have no unit that could take one
 * (a land unit, aboard a transport or not). The original only knocked a player out with no units at all, which
 * made winners hunt down a last ship that could never retake anything; its leftover units are removed.
 */
export function checkElimination(s: GameState, pid: PlayerId, events: GameEvent[]): void {
  const p = s.players[pid];
  if (p.eliminated) return;
  const hasCity = s.cities.some((c) => c.owner === pid);
  const canTakeCity = s.units.some((u) => u.owner === pid && UNIT_STATS[u.type].domain === 'land' && u.type !== 'airbase');
  if (!hasCity && !canTakeCity) {
    for (const u of s.units.filter((x) => x.owner === pid)) destroyUnit(s, u, 'resigned', events);
    p.eliminated = true;
    events.push({ type: 'playerEliminated', player: pid });
  }
}

function checkWinner(s: GameState, events: GameEvent[]): boolean {
  const alive = s.players.filter((p) => !p.eliminated);
  if (alive.length > 1) return false;
  s.winner = alive.length === 1 ? alive[0].id : null;
  s.over = true;
  events.push({ type: 'gameOver', winner: s.winner });
  return true;
}

function advanceToNextPlayer(s: GameState): void {
  let p = s.currentPlayer;
  do {
    p = (p + 1) % s.players.length;
    if (p === 0) s.turn += 1;
  } while (s.players[p].eliminated);
  s.currentPlayer = p;
}

export function startTurn(s: GameState, events: GameEvent[], rng: RandomSource = new Rng(s.rngState)): void {
  const pid = s.currentPlayer;
  // With fairFirstTurn, nobody's cities progress on turn 1, so every player's first production tick is on turn 2.
  if (s.turn > 1 || !s.rules.fairFirstTurn) advanceProduction(s, pid, events);
  for (const u of s.units) {
    if (u.owner !== pid) continue;
    u.movesLeft = effectiveMove(u);
    u.movedThisTurn = false;
  }
  for (const t of s.units) {
    if (t.owner !== pid || !t.unloadNextTurn) continue;
    if (inOwnCity(s, t) && t.orders === null) unloadCargo(s, t, null, events);
    t.unloadNextTurn = false;
  }
  updateFog(s, pid);
  runPlayerOrders(s, rng, pid, events);
  events.push({ type: 'turnStarted', player: pid, turn: s.turn });
}

function passPlay(s: GameState, endingPid: PlayerId, events: GameEvent[], rng: RandomSource): void {
  checkElimination(s, endingPid, events);
  if (checkWinner(s, events)) return;
  advanceToNextPlayer(s);
  startTurn(s, events, rng);
}

export function endTurn(s: GameState, events: GameEvent[], rng: RandomSource = new Rng(s.rngState)): void {
  const pid = s.currentPlayer;
  finishPlayerTurn(s, pid, events);
  passPlay(s, pid, events, rng);
}

export function resign(s: GameState, events: GameEvent[], rng: RandomSource = new Rng(s.rngState)): void {
  const pid = s.currentPlayer;
  for (const u of s.units.filter((x) => x.owner === pid)) destroyUnit(s, u, 'resigned', events);
  for (const c of s.cities) {
    if (c.owner !== pid) continue;
    c.owner = null;
    c.production = null;
    c.progress = 0;
    c.lastBuilt = null;
  }
  s.players[pid].eliminated = true;
  events.push({ type: 'playerEliminated', player: pid });
  passPlay(s, pid, events, rng);
}
