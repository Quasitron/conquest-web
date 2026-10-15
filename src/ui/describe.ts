import { UNIT_STATS, type DestroyReason, type GameEvent, type PlayerId } from '../engine';

const REASON: Record<DestroyReason, string | null> = {
  combat: 'was destroyed in combat',
  cargoLost: 'was lost with its carrier',
  crashed: 'ran out of fuel and crashed',
  cityCaptured: 'was lost when its city fell',
  garrison: null,
  disbanded: 'was disbanded',
  resigned: null,
};

export function describeEvent(e: GameEvent, me: PlayerId, names: string[]): string | null {
  const whose = (owner: PlayerId | null, capital: boolean) =>
    owner === me ? (capital ? 'Your' : 'your') : owner === null ? 'a neutral' : `${names[owner]}'s`;
  switch (e.type) {
    case 'unitMoved':
      return null;
    case 'combat': {
      const target =
        e.defender.kind === 'city'
          ? `${whose(e.defender.owner, false)} city`
          : `${whose(e.defender.owner, false)} ${UNIT_STATS[e.defender.unitType].name}`;
      return `${whose(e.attackerOwner, true)} ${UNIT_STATS[e.attackerType].name} attacked ${target} and ${e.attackerWon ? 'won' : 'lost'}.`;
    }
    case 'unitDestroyed': {
      const reason = REASON[e.reason];
      return reason === null ? null : `${whose(e.owner, true)} ${UNIT_STATS[e.unitType].name} ${reason}.`;
    }
    case 'cityCaptured':
      if (e.by === me) return 'You captured a city.';
      if (e.from === me) return `${names[e.by]} captured one of your cities!`;
      return `${names[e.by]} captured a city.`;
    case 'unitProduced':
      return `New ${UNIT_STATS[e.unitType].name} ready.`;
    case 'turnStarted':
      return `Turn ${e.turn}: ${names[e.player]}.`;
    case 'playerEliminated':
      return e.player === me ? 'You have been eliminated.' : `${names[e.player]} has been eliminated.`;
    case 'gameOver':
      return e.winner === null ? 'Game over: no survivors.' : `${names[e.winner]} wins!`;
  }
}
