import type { GameEvent, PlayerId } from '../engine';
import type { SoundName } from './sounds';

/** At most this many sounds per batch, so a computer turn is not a wall of noise. */
export const MAX_SOUNDS = 4;
/** Gap between the sounds of one batch, in milliseconds. */
export const SOUND_GAP_MS = 120;
/** The gap after these sounds is longer, so the next one does not smear into them. */
export const LONG_GAP_MS: Partial<Record<SoundName, number>> = { explosion: 500 };

/** When a batch is over the cap, the least important sounds are dropped first (higher = more important). */
const PRIORITY: Record<SoundName, number> = {
  win: 10, lose: 10, lost: 9, capture: 8, alert: 7, explosion: 6, crash: 6, shot: 5, unload: 4, chime: 3, turn: 2, click: 1,
  'produce-army': 3, 'produce-armor': 3, 'produce-fighter': 3, 'produce-transport': 3, 'produce-destroyer': 3,
  'produce-submarine': 3, 'produce-cruiser': 3, 'produce-battleship': 3, 'produce-carrier': 3,
};

/** The sound for a newly built unit of this type; 'chime' for an unknown type. */
export function produceSound(unitType: string): SoundName {
  const s = `produce-${unitType}` as SoundName;
  return s in PRIORITY ? s : 'chime';
}

function soundFor(e: GameEvent, me: PlayerId): SoundName[] {
  switch (e.type) {
    // The log only holds events the player could see, so every combat in it counts.
    case 'combat': return ['shot'];
    case 'unitDestroyed':
      if (e.reason === 'combat') return ['explosion'];
      if (e.reason === 'crashed') return ['crash'];
      return [];
    case 'cityCaptured':
      if (e.by === me) return ['capture'];
      if (e.from === me) return ['lost'];
      return [];
    // Production sounds play as each unit's report opens (see produceSound), not in the turn-start batch.
    case 'cargoUnloaded': return e.owner === me ? ['unload'] : [];
    case 'ordersEnded': return e.owner === me && e.reason === 'enemySighted' ? ['alert'] : [];
    case 'turnStarted': return e.player === me ? ['turn'] : [];
    case 'gameOver': return [e.winner === me ? 'win' : 'lose'];
    default: return [];
  }
}

/** The sounds to play for a batch of new events, from player `me`'s point of view: in order, no repeats, capped. */
export function soundsForEvents(events: readonly GameEvent[], me: PlayerId): SoundName[] {
  const out: SoundName[] = [];
  // A batch that ends in your own turn starting is what happened during the other player's turn. Its battles are
  // in the Combat report that opens by itself, so they are not also played as sounds.
  const newTurn = events.some((e) => e.type === 'turnStarted' && e.player === me);
  for (const e of events) {
    if (newTurn && (e.type === 'combat' || (e.type === 'unitDestroyed' && e.reason === 'combat'))) continue;
    // A city that falls to an assault goes up with a boom before the fanfare (the replay at turn start adds its own).
    if (e.type === 'cityCaptured' && !newTurn && (e.by === me || e.from === me) && !out.includes('explosion')) out.push('explosion');
    for (const s of soundFor(e, me)) if (!out.includes(s)) out.push(s);
  }
  while (out.length > MAX_SOUNDS) {
    let weakest = 0;
    for (let i = 1; i < out.length; i++) if (PRIORITY[out[i]] <= PRIORITY[out[weakest]]) weakest = i;
    out.splice(weakest, 1);
  }
  return out;
}




