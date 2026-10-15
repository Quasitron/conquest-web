import type { ApplyResult, Command, GameEvent, GameState } from './types';
import { Rng } from './rng';
import { UNIT_STATS, UNIT_TYPES } from './units';
import { cityAt, destroyUnit, topLevelUnitsAt, unitById } from './query';
import { moveUnit } from './movement';
import { setProduction } from './production';
import { endTurn, resign } from './turn';
import { updateFog } from './fog';

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
      else error = moveUnit(s, rng, u, cmd.dir, events);
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
      else endTurn(s, events);
      break;
    }
    case 'resign':
      resign(s, events);
      break;
    default:
      error = 'unknown command';
  }

  if (error) return { ok: false, error };
  s.rngState = rng.state;
  if (cmd.type === 'move' || cmd.type === 'setProduction' || cmd.type === 'disband') updateFog(s, actor);
  return { ok: true, state: s, events };
}
