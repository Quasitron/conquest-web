import type { City, GameEvent, GameState, PlayerId, UnitType } from './types';
import { UNIT_STATS } from './units';
import { isCoastal } from './map';
import { spawnUnit } from './query';
import { applyRoute, dropStaleRoute } from './routes';

export function buildTime(city: City, type: UnitType): number {
  const st = UNIT_STATS[type];
  return city.lastBuilt === type ? st.buildRepeat : st.build;
}

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
