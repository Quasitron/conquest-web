import { RANK_NAMES, UNIT_STATS, unitDisplayName, type DestroyReason, type GameEvent, type OrdersEndReason, type PlayerId, type UnitType } from '../engine';
import { cargoSummary, withArticle } from './labels';

const REASON: Record<DestroyReason, string | null> = {
  combat: 'was destroyed in combat',
  cargoLost: 'was lost with its carrier',
  crashed: 'ran out of fuel and crashed',
  cityCaptured: 'was lost when its city fell',
  garrison: null,
  disbanded: 'was disbanded',
  resigned: null,
  caught: 'was caught and shot',
};

const ORDERS_END: Record<Exclude<OrdersEndReason, 'arrived' | 'returning' | 'baseLost' | 'baseOutOfRange' | 'repaired' | 'cityLost'>, string> = {
  cityFound: 'found a city',
  blocked: 'path blocked',
  enemySighted: 'enemy sighted',
  lowFuel: 'low on fuel',
  nothingToExplore: 'nothing left to explore',
  destinationLost: 'destination city lost',
  escortLost: 'its transport is gone',
  crippled: 'badly damaged',
};

/** Own units and city names for events that only carry ids. Own units only: names are private to their owner. */
export interface DescribeLookup {
  unit(id: number): { type: UnitType; name: string } | undefined;
  city(id: number): string | undefined;
}

/** "Veteran " before a promoted unit's name (a rank above 0), nothing otherwise. */
function rankPrefix(rank: number | undefined): string {
  return rank ? `${RANK_NAMES[rank]} ` : '';
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
          : `${whose(e.defender.owner, false)} ${rankPrefix(e.defenderRank)}${UNIT_STATS[e.defender.unitType].name}`;
      if (e.strike) return `${whose(e.attackerOwner, true)} ${rankPrefix(e.attackerRank)}${UNIT_STATS[e.attackerType].name} torpedoed ${target} and slipped away.`;
      return `${whose(e.attackerOwner, true)} ${rankPrefix(e.attackerRank)}${UNIT_STATS[e.attackerType].name} attacked ${target} and ${e.attackerWon ? 'won' : 'lost'}.`;
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
    case 'airbaseBuilt':
      return `${whose(e.owner, true)} airbase is ready.`;
    case 'citySabotaged': {
      const city = lookup?.city(e.cityId) ?? 'a city';
      if (e.by === me) return `Your spy wrecked production in ${city}${e.caught ? ', but was caught and shot' : ''}.`;
      return `Sabotage! ${city} lost its production${e.caught ? ', but the spy was caught' : ''}.`;
    }
    case 'cityIncited': {
      if (e.success) return null; // the city's capture is reported on its own
      const city = lookup?.city(e.cityId) ?? 'a city';
      return e.by === me ? `Your spy failed to turn ${city} and was caught.` : `A spy tried to stir up a revolt in ${city} and was caught.`;
    }
    case 'cityBombed': {
      const city = lookup?.city(e.cityId) ?? 'a city';
      const effect = e.effect === 'unit' ? `lost ${withArticle(UNIT_STATS[e.unitType ?? 'army'].name)}` : 'lost its production';
      return e.owner === me ? `An enemy bomber hit ${city}: it ${effect}.` : `Your bomber hit ${city}: it ${effect}.`;
    }
    case 'unitPromoted':
      return `${unitName(e.unitId)} was promoted to ${RANK_NAMES[e.rank]}.`;
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
