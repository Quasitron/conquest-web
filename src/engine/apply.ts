import type { ApplyResult, Command, GameEvent, GameState } from './types';
import { Rng } from './rng';
import { UNIT_STATS, UNIT_TYPES, buildableTypes, canBecomeAirbase } from './units';
import { cargoOf, cityAt, destroyUnit, topLevelUnitsAt, unitById } from './query';
import { moveUnit } from './movement';
import { terrainAt } from './map';
import { setProduction } from './production';
import { endTurn, resign } from './turn';
import { catchSpies, updateFog } from './fog';
import { hurtGarrison, incitePeople, sabotageCity } from './spy';
import { inOwnCity, loadUnits, unloadCargo } from './cargo';
import { chooseHome, giveOrders, runEscorts } from './orders';
import { cleanName } from './names';
import { teammatesOf } from './relations';
import { pickUpRoute, validateRoute } from './routes';

function validDir(dir: unknown): boolean {
  return typeof dir === 'number' && Number.isInteger(dir) && dir >= 0 && dir <= 7;
}

export function apply(state: GameState, cmd: Command): ApplyResult {
  if (state.over) return { ok: false, error: 'the game is over' };
  if (typeof cmd !== 'object' || cmd === null) return { ok: false, error: 'malformed command' };
  if ((cmd as { player?: unknown }).player !== state.currentPlayer) return { ok: false, error: 'not your turn' };
  const s = structuredClone(state);
  const rng = new Rng(s.rngState);
  const events: GameEvent[] = [];
  const actor = s.currentPlayer;
  let error: string | null = null;

  switch (cmd.type) {
    case 'move': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else if (!validDir(cmd.dir)) error = 'invalid direction';
      else {
        u.orders = null;
        u.blockedTurns = 0;
        error = moveUnit(s, rng, u, cmd.dir, events);
        if (!error && u.type === 'transport' && inOwnCity(s, u) && cargoOf(s, u).length > 0) u.unloadNextTurn = true;
        if (!error) pickUpRoute(s, u);
      }
      break;
    }
    case 'load':
    case 'unload': {
      const t = unitById(s, cmd.transportId);
      if (!t) error = 'no such unit';
      else if (t.owner !== actor) error = 'not your unit';
      else if (cmd.type === 'load') error = loadUnits(s, t, cmd.unitIds);
      else if (cmd.unitIds !== null && cmd.unitIds.length === 0) error = 'nothing to unload';
      else error = unloadCargo(s, t, cmd.unitIds, events);
      break;
    }
    case 'buildAirbase': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else if (!s.rules.advancedUnits) error = 'airbases are part of the Advanced units rule';
      else if (!canBecomeAirbase(u.type)) error = 'only an Army or Armor can build an airbase';
      else if (u.carriedBy !== null || terrainAt(s, u.x, u.y) !== 'land' || cityAt(s, u.x, u.y)) error = 'an airbase needs open land';
      else {
        u.type = 'airbase';
        u.damage = 0;
        u.wins = undefined;
        u.movesLeft = 0;
        u.fuel = null;
        u.orders = { kind: 'sentry' };
        u.blockedTurns = 0;
        events.push({ type: 'airbaseBuilt', unitId: u.id, owner: u.owner, x: u.x, y: u.y });
      }
      break;
    }
    case 'sabotage': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else error = sabotageCity(s, rng, u, events);
      break;
    }
    case 'hurtGarrison': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else error = hurtGarrison(s, rng, u, events);
      break;
    }
    case 'incite': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else error = incitePeople(s, rng, u, events);
      break;
    }
    case 'setOrders': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else if (cmd.orders === null) {
        u.orders = null;
        u.blockedTurns = 0;
        u.unloadNextTurn = false;
      } else error = giveOrders(s, rng, u, cmd.orders, events);
      break;
    }
    case 'goHome': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else if (cmd.repair && u.damage === 0) error = 'nothing to repair';
      else if (cityAt(s, u.x, u.y)?.owner === actor) {
        error = cmd.repair ? giveOrders(s, rng, u, { kind: 'repair' }, events) : 'already home';
      } else {
        const home = chooseHome(s, u);
        if (!home) error = 'no reachable city';
        else {
          const goto = { kind: 'goto' as const, target: { x: home.city.x, y: home.city.y }, ...(cmd.repair ? { arrival: 'repair' as const } : {}) };
          error = giveOrders(s, rng, u, goto, events);
        }
      }
      break;
    }
    case 'setRoute': {
      const c = s.cities.find((x) => x.id === cmd.cityId);
      if (!c) error = 'no such city';
      else if (c.owner !== actor) error = 'not your city';
      else if (cmd.route === null) delete c.route;
      else {
        error = validateRoute(s, actor, c, cmd.route);
        if (!error) {
          const { destId, types, blockWait, arrival } = cmd.route;
          c.route = { destId, types: [...types], blockWait, arrival, by: actor };
        }
      }
      break;
    }
    case 'setProduction': {
      const c = s.cities.find((x) => x.id === cmd.cityId);
      if (!c) error = 'no such city';
      else if (c.owner !== actor) error = 'not your city';
      else if (cmd.unitType !== null && !UNIT_TYPES.includes(cmd.unitType)) error = 'unknown unit type';
      else if (cmd.unitType !== null && !buildableTypes(s.rules).includes(cmd.unitType)) error = 'that unit is not in this game';
      else error = setProduction(s, c, cmd.unitType);
      break;
    }
    case 'disband': {
      const u = unitById(s, cmd.unitId);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else destroyUnit(s, u, 'disbanded', events);
      break;
    }
    case 'renameCity': {
      const c = s.cities.find((x) => x.id === cmd.cityId);
      const name = cleanName(cmd.name);
      if (!c) error = 'no such city';
      else if (c.owner !== actor) error = 'not your city';
      else if (name === null || name === '') error = 'invalid name';
      else if (s.cities.some((x) => x !== c && x.name.toLowerCase() === name.toLowerCase())) error = 'name already in use';
      else c.name = name;
      break;
    }
    case 'renameUnit': {
      const u = unitById(s, cmd.unitId);
      const name = cmd.name === null ? '' : cleanName(cmd.name);
      if (!u) error = 'no such unit';
      else if (u.owner !== actor) error = 'not your unit';
      else if (name === null) error = 'invalid name';
      else u.name = name === '' ? null : name;
      break;
    }
    case 'endTurn': {
      const stuck = s.units.find(
        (u) =>
          u.owner === actor &&
          UNIT_STATS[u.type].domain === 'air' &&
          u.carriedBy === null &&
          !cityAt(s, u.x, u.y) &&
          topLevelUnitsAt(s, u.x, u.y).length > 1,
      );
      if (stuck) error = `${UNIT_STATS[stuck.type].name} ${stuck.id} cannot end its turn on an occupied square`;
      else endTurn(s, events, rng);
      break;
    }
    case 'resign':
      resign(s, events, rng);
      break;
    default:
      error = 'unknown command';
  }

  // Escorts follow their transports (a move, a Go-to or an unload may have moved one).
  if (!error && cmd.type !== 'endTurn' && cmd.type !== 'resign') runEscorts(s, rng, actor, events);
  if (error) return { ok: false, error };
  catchSpies(s, events);
  s.rngState = rng.state;
  const fogCommands = ['buildAirbase', 'sabotage', 'hurtGarrison', 'incite', 'move', 'setProduction', 'disband', 'load', 'unload', 'setOrders', 'goHome'];
  if (fogCommands.includes(cmd.type)) {
    updateFog(s, actor);
    for (const mate of teammatesOf(s, actor)) updateFog(s, mate); // allies share what they see
  }
  return { ok: true, state: s, events };
}
