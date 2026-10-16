import { UNIT_STATS, type DestroyReason, type GameEvent, type OrdersEndReason, type PlayerId, type UnitType } from '../engine';

const REASON: Record<DestroyReason, string | null> = {
  combat: 'was destroyed in combat',
  cargoLost: 'was lost with its carrier',
  crashed: 'ran out of fuel and crashed',
  cityCaptured: 'was lost when its city fell',
  garrison: null,
  disbanded: 'was disbanded',
  resigned: null,
};

const ORDERS_END: Record<OrdersEndReason, string> = {
  arrived: 'arrived',
  blocked: 'path blocked',
  enemySighted: 'enemy sighted',
  lowFuel: 'low fuel',
  nothingToExplore: 'nothing left to explore',
};

/** `unitTypeOf` names units in events that only carry an id; unknown units read as "Unit". */
export function describeEvent(
  e: GameEvent, me: PlayerId, names: string[], unitTypeOf?: (unitId: number) => UnitType | undefined,
): string | null {
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
    case 'cargoUnloaded':
      return `Transport ${e.transportId} unloaded ${e.unitIds.length} unit(s).`;
    case 'ordersEnded': {
      const type = unitTypeOf?.(e.unitId);
      return `${type ? UNIT_STATS[type].name : 'Unit'} ${e.unitId} stopped: ${ORDERS_END[e.reason]}.`;
    }
    case 'turnStarted':
      return null;
    case 'playerEliminated':
      return e.player === me ? 'You have been eliminated.' : `${names[e.player]} has been eliminated.`;
    case 'gameOver':
      return e.winner === null ? 'Game over: no survivors.' : `${names[e.winner]} wins!`;
  }
}
