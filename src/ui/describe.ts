import { UNIT_STATS, unitDisplayName, type DestroyReason, type GameEvent, type OrdersEndReason, type PlayerId, type UnitType } from '../engine';
import { cargoSummary } from './labels';

const REASON: Record<DestroyReason, string | null> = {
  combat: 'was destroyed in combat',
  cargoLost: 'was lost with its carrier',
  crashed: 'ran out of fuel and crashed',
  cityCaptured: 'was lost when its city fell',
  garrison: null,
  disbanded: 'was disbanded',
  resigned: null,
};

const ORDERS_END: Record<Exclude<OrdersEndReason, 'arrived' | 'returning' | 'baseLost' | 'baseOutOfRange' | 'repaired' | 'cityLost'>, string> = {
  cityFound: 'found a city',
  blocked: 'path blocked',
  enemySighted: 'enemy sighted',
  lowFuel: 'low on fuel',
  nothingToExplore: 'nothing left to explore',
  destinationLost: 'destination city lost',
};

/** Own units and city names for events that only carry ids. Own units only: names are private to their owner. */
export interface DescribeLookup {
  unit(id: number): { type: UnitType; name: string } | undefined;
  city(id: number): string | undefined;
}

export function describeEvent(
  e: GameEvent, me: PlayerId, names: string[], lookup?: DescribeLookup,
): string | null {
  const whose = (owner: PlayerId | null, capital: boolean) =>
    owner === me ? (capital ? 'Your' : 'your') : owner === null ? 'a neutral' : `${names[owner]}'s`;
  const unitName = (id: number) => lookup?.unit(id)?.name ?? `Unit ${id}`;
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
    case 'cityCaptured': {
      const city = lookup?.city(e.cityId) ?? 'a city';
      if (e.by === me) return `You captured ${city}.`;
      if (e.from === me) return `${names[e.by]} captured ${city}, one of your cities!`;
      return `${names[e.by]} captured ${city}.`;
    }
    case 'unitProduced': {
      const unit = lookup?.unit(e.unitId)?.name ?? unitDisplayName({ id: e.unitId, type: e.unitType, name: null });
      const city = lookup?.city(e.cityId);
      return `${city ?? 'A city'} produced ${unit}.`;
    }
    case 'cargoUnloaded': {
      const cargo = e.unitIds.flatMap((id) => {
        const info = lookup?.unit(id);
        return info ? [{ type: info.type }] : [];
      });
      return `${unitName(e.transportId)} unloaded ${cargoSummary(cargo) || 'units'}.`;
    }
    case 'ordersEnded':
      if (e.reason === 'arrived') return `${unitName(e.unitId)} arrived.`;
      if (e.reason === 'returning') return `${unitName(e.unitId)} low on fuel: heading home.`;
      if (e.reason === 'baseOutOfRange') return `${unitName(e.unitId)} base carrier moved out of range: heading home.`;
      if (e.reason === 'baseLost') return `${unitName(e.unitId)} base carrier is gone or full: heading home.`;
      if (e.reason === 'repaired') return `${unitName(e.unitId)} is repaired.`;
      if (e.reason === 'cityLost') return `${unitName(e.unitId)} stopped repairing: its city is lost.`;
      return `${unitName(e.unitId)} stopped: ${ORDERS_END[e.reason]}.`;    case 'turnStarted':
      return null;
    case 'playerEliminated':
      return e.player === me ? 'You have been eliminated.' : `${names[e.player]} has been eliminated.`;
    case 'gameOver':
      return e.winner === null ? 'Game over: no survivors.' : `${names[e.winner]} wins!`;
  }
}
