import type { City, GameEvent, GameState, PlayerId, UnitType } from './types';
import { UNIT_STATS } from './units';
import { isCoastal } from './map';
import { spawnUnit } from './query';
import { applyRoute, dropStaleRoute } from './routes';

export function buildTime(city: City, type: UnitType): number {
  const st = UNIT_STATS[type];
  const base = city.lastBuilt === type ? st.buildRepeat : st.build;
  // War-torn cities (house rule; the count is only ever set when it is on) build slower.
  return Math.ceil(base * (1 + WAR_TORN_SLOWDOWN * (city.warTorn ?? 0)));
}

/** A war-torn city takes this much longer to build per capture it has suffered (so +25% each, up to 4 captures). */
export const WAR_TORN_SLOWDOWN = 0.25;
export const WAR_TORN_MAX = 4;
/** A war-torn city recovers one step after this many of its owner's turns. */
export const WAR_TORN_RECOVERY_TURNS = 10;

export function setProduction(s: GameState, city: City, type: UnitType | null): string | null {
  if (type !== null && UNIT_STATS[type].domain === 'sea' && !isCoastal(s, city.x, city.y)) {
    return 'inland cities cannot build ships';
  }
  if (city.production === type) return null;
  city.production = type;
  city.progress = 0;
  return null;
}

export function advanceProduction(s: GameState, pid: PlayerId, events: GameEvent[]): void {
  for (const city of s.cities) {
    if (city.owner !== pid) continue;
    dropStaleRoute(s, city);
    if (city.damage) city.damage -= 1;
    if (city.warTorn) {
      city.warTornClock = (city.warTornClock ?? 0) + 1;
      if (city.warTornClock >= WAR_TORN_RECOVERY_TURNS) {
        city.warTorn -= 1;
        city.warTornClock = 0;
      }
    }
    if (city.production === null) continue;
    city.progress += 1;
    if (city.progress >= buildTime(city, city.production)) {
      const u = spawnUnit(s, city.production, pid, city.x, city.y);
      city.progress = 0;
      city.lastBuilt = city.production;
      applyRoute(s, city, u);
      events.push({ type: 'unitProduced', unitId: u.id, cityId: city.id, unitType: u.type });
    }
  }
}
