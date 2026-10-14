import type { GameEvent, GameState, PlayerId } from './types';
import { UNIT_STATS, effectiveMove } from './units';
import { cityAt, destroyUnit, isAtRefuelPoint } from './query';
import { areFriendly } from './relations';
import { advanceProduction } from './production';
import { updateFog } from './fog';

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

export function checkEliminations(s: GameState, events: GameEvent[]): void {
  for (const p of s.players) {
    if (p.eliminated) continue;
    const hasCity = s.cities.some((c) => c.owner === p.id);
    const hasUnit = s.units.some((u) => u.owner === p.id);
    if (!hasCity && !hasUnit) {
      p.eliminated = true;
      events.push({ type: 'playerEliminated', player: p.id });
    }
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

export function startTurn(s: GameState, events: GameEvent[]): void {
  const pid = s.currentPlayer;
  advanceProduction(s, pid, events);
  for (const u of s.units) {
    if (u.owner !== pid) continue;
    u.movesLeft = effectiveMove(u);
    u.movedThisTurn = false;
  }
  updateFog(s, pid);
  events.push({ type: 'turnStarted', player: pid, turn: s.turn });
}

function passPlay(s: GameState, events: GameEvent[]): void {
  checkEliminations(s, events);
  if (checkWinner(s, events)) return;
  advanceToNextPlayer(s);
  startTurn(s, events);
}

export function endTurn(s: GameState, events: GameEvent[]): void {
  finishPlayerTurn(s, s.currentPlayer, events);
  passPlay(s, events);
}

export function resign(s: GameState, events: GameEvent[]): void {
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
  passPlay(s, events);
}
