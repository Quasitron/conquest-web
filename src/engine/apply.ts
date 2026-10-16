import type { ApplyResult, Command, GameEvent, GameState } from './types';
import { Rng } from './rng';
import { UNIT_STATS, UNIT_TYPES } from './units';
import { cargoOf, cityAt, destroyUnit, topLevelUnitsAt, unitById } from './query';
import { moveUnit } from './movement';
import { setProduction } from './production';
import { endTurn, resign } from './turn';
import { updateFog } from './fog';
import { inOwnCity, loadUnits, unloadCargo } from './cargo';
import { chooseHome, giveOrders } from './orders';
import { cleanName } from './names';

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
      else if (cityAt(s, u.x, u.y)?.owner === actor) error = 'already home';
      else {
        const home = chooseHome(s, u);
        if (!home) error = 'no reachable city';
        else error = giveOrders(s, rng, u, { kind: 'goto', target: { x: home.city.x, y: home.city.y } }, events);
      }
      break;
    }
    case 'setProduction': {
      const c = s.cities.find((x) => x.id === cmd.cityId);
      if (!c) error = 'no such city';
      else if (c.owner !== actor) error = 'not your city';
      else if (cmd.unitType !== null && !UNIT_TYPES.includes(cmd.unitType)) error = 'unknown unit type';
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

  if (error) return { ok: false, error };
  s.rngState = rng.state;
  const fogCommands = ['move', 'setProduction', 'disband', 'load', 'unload', 'setOrders', 'goHome'];
  if (fogCommands.includes(cmd.type)) updateFog(s, actor);
  return { ok: true, state: s, events };
}
