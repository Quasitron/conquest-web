import type { Command, GameState } from './types';
import { apply } from './apply';

export function replay(initial: GameState, commands: readonly Command[]): GameState {
  let s = initial;
  commands.forEach((cmd, i) => {
    const r = apply(s, cmd);
    if (!r.ok) throw new Error(`command ${i} (${cmd.type}) rejected: ${r.error}`);
    s = r.state;
  });
  return s;
}
