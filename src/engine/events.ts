import type { GameEvent, GameState, PlayerId } from './types';
import { index } from './map';
import { canPlayerSeeUnit, visibleSquares } from './fog';
import { areFriendly } from './relations';

/**
 * Filters one command's events down to what player `pid` may know.
 * `s` must be the state after the command was applied.
 */
export function eventsFor(s: GameState, events: readonly GameEvent[], pid: PlayerId): GameEvent[] {
  const vis = visibleSquares(s, pid);
  const seen = (x: number, y: number) => vis.has(index(s, x, y));
  const owners = new Map<number, PlayerId>();
  for (const u of s.units) owners.set(u.id, u.owner);
  for (const e of events) if (e.type === 'unitDestroyed') owners.set(e.unitId, e.owner);
  const mine = (owner: PlayerId | null | undefined) => owner !== undefined && owner !== null && areFriendly(s, owner, pid);
  const combatUnits = new Set<number>();
  const out: GameEvent[] = [];

  for (const e of events) {
    switch (e.type) {
      case 'unitMoved': {
        if (mine(owners.get(e.unitId))) {
          out.push(e);
          break;
        }
        const u = s.units.find((x) => x.id === e.unitId);
        if (u && seen(e.to.x, e.to.y) && canPlayerSeeUnit(s, pid, u)) out.push(e);
        break;
      }
      case 'combat':
        if (mine(e.attackerOwner) || mine(e.defender.owner) || seen(e.x, e.y)) {
          out.push(e);
          combatUnits.add(e.attackerId);
          if (e.defender.kind === 'unit') combatUnits.add(e.defender.unitId);
        }
        break;
      case 'unitDestroyed':
        if (mine(e.owner) || (e.reason !== 'cargoLost' && combatUnits.has(e.unitId))) out.push(e);
        break;
      case 'cityCaptured': {
        const c = s.cities.find((x) => x.id === e.cityId);
        if (mine(e.by) || mine(e.from) || (c !== undefined && seen(c.x, c.y))) out.push(e);
        break;
      }
      case 'cargoUnloaded':
        if (mine(e.owner)) out.push(e);
        break;
      case 'unitProduced':
        if (mine(owners.get(e.unitId))) out.push(e);
        break;
      default:
        out.push(e);
    }
  }
  return out;
}
