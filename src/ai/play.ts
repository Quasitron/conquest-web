import type { PlayerView } from '../engine';
import type { SessionCommand } from '../app/session';
import { newMemo, nextAction } from './basic';
import type { Difficulty } from './difficulty';

/** What the AI needs from the game: its own view, and a way to issue a command as that player. */
export interface AiHost {
  view(): PlayerView;
  /** Returns an error message when the command was refused, else null. */
  act(cmd: SessionCommand): string | null;
}

const MAX_STEPS = 4000;

/** Plays one turn's worth of commands (everything except the final End Turn, which the caller sends). */
export function playAiTurn(host: AiHost, difficulty?: Difficulty): void {
  const memo = newMemo(difficulty);
  for (let i = 0; i < MAX_STEPS; i++) {
    const cmd = nextAction(host.view(), memo);
    if (cmd === null) return;
    host.act(cmd); // a refusal is fine: the memo caps retries, so a bad idea cannot loop
  }
}
