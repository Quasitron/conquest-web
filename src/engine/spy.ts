import type { GameEvent, GameState, PlayerId, Unit, UnitType } from './types';
import type { RandomSource } from './rng';
import { chebyshev } from './map';
import { cityAt, destroyUnit } from './query';
import { areFriendly } from './relations';
import { WAR_TORN_MAX, buildTime } from './production';
import { hitsOf, rankOf } from './units';
import { recordWin } from './attack';

/** The chance a spy is discovered and shot each time it sabotages a city, by promotion rank (a seasoned spy is harder to catch). */
export const SABOTAGE_CATCH_CHANCE = [0.3, 0.25, 0.2, 0.1] as const;
/**
 * A spy hiding in an enemy city may be found at the start of that city's owner's turn: a little chance in an empty city,
 * more for every unit of the owner's standing in it, up to a limit.
 */
export const DISCOVERY = { base: 0.05, perUnit: 0.07, max: 0.6 } as const;
/** The chance an Elite spy's attempt to incite a revolt succeeds; a failed attempt costs the spy its life. */
export const REVOLT_CHANCE = 0.25;

/**
 * A spy at work (Advanced units rule). Inside an enemy city it wrecks the production the city has built up, and uses
 * up its move for the turn; the city's owner may discover and shoot it for that.
 */
export function sabotageCity(s: GameState, rng: RandomSource, spy: Unit, events: GameEvent[]): string | null {
  if (spy.type !== 'spy') return 'only a spy can sabotage';
  if (spy.movesLeft <= 0) return 'unit has no moves left';
  const city = cityAt(s, spy.x, spy.y);
  if (spy.carriedBy !== null || !city || city.owner === null || areFriendly(s, city.owner, spy.owner)) {
    return 'a spy can only sabotage an enemy city it is inside';
  }
  if (city.production === null || city.progress === 0) return 'the city has no production built up to sabotage';
  const production = city.production;
  city.progress = 0;
  spy.movesLeft = 0;
  spy.movedThisTurn = true;
  spy.orders = null;
  const caught = rng.next() < SABOTAGE_CATCH_CHANCE[rankOf(spy.wins)];
  events.push({ type: 'citySabotaged', cityId: city.id, by: spy.owner, owner: city.owner, caught, production });
  if (caught) destroyUnit(s, spy, 'caught', events, city.owner);
  else recordWin(s, spy, events); // a clean job counts towards promotion
  return null;
}

/**
 * A spy inside an enemy city damages one of the units there by a hit (picked at random among those with more than one hit
 * left; it is never destroyed). Like sabotage it uses the spy's move and risks the spy being caught.
 */
export function hurtGarrison(s: GameState, rng: RandomSource, spy: Unit, events: GameEvent[]): string | null {
  if (spy.type !== 'spy') return 'only a spy can do that';
  if (spy.movesLeft <= 0) return 'unit has no moves left';
  const city = cityAt(s, spy.x, spy.y);
  if (spy.carriedBy !== null || !city || city.owner === null || areFriendly(s, city.owner, spy.owner)) {
    return 'a spy can only harm the garrison of an enemy city it is inside';
  }
  const targets = garrisonOf(s, city).filter((u) => hitsOf(u) - u.damage > 1);
  if (targets.length === 0) return 'nothing in the city can be harmed (units with a single hit left are safe)';
  const victim = targets[Math.floor(rng.next() * targets.length)];
  victim.damage += 1;
  spy.movesLeft = 0;
  spy.movedThisTurn = true;
  spy.orders = null;
  const caught = rng.next() < SABOTAGE_CATCH_CHANCE[rankOf(spy.wins)];
  events.push({ type: 'garrisonHurt', cityId: city.id, by: spy.owner, owner: city.owner, unitType: victim.type, caught });
  if (caught) destroyUnit(s, spy, 'caught', events, city.owner);
  else recordWin(s, spy, events);
  return null;
}

/**
 * An Elite spy stirs up the people of the enemy city it is in (Advanced units and promotions rules). With a modest chance
 * the city rises and joins the spy's side, as if captured (the enemy units in it are lost); otherwise the spy is caught.
 */
export function incitePeople(s: GameState, rng: RandomSource, spy: Unit, events: GameEvent[]): string | null {
  if (spy.type !== 'spy') return 'only a spy can incite a revolt';
  if (rankOf(spy.wins) < 3) return 'only an Elite spy can incite a revolt';
  if (spy.movesLeft <= 0) return 'unit has no moves left';
  const city = cityAt(s, spy.x, spy.y);
  if (spy.carriedBy !== null || !city || city.owner === null || areFriendly(s, city.owner, spy.owner)) {
    return 'a spy can only incite a revolt in an enemy city it is inside';
  }
  const from = city.owner;
  const success = rng.next() < REVOLT_CHANCE;
  events.push({ type: 'cityIncited', cityId: city.id, by: spy.owner, owner: from, success });
  if (!success) {
    destroyUnit(s, spy, 'caught', events, from);
    return null;
  }
  for (const u of s.units.filter((x) => x.x === city.x && x.y === city.y && x !== spy)) {
    if (!areFriendly(s, u.owner, spy.owner)) destroyUnit(s, u, 'cityCaptured', events);
  }
  if (s.rules.warTornCities) {
    city.warTorn = Math.min(WAR_TORN_MAX, (city.warTorn ?? 0) + 1);
    city.warTornClock = 0;
  }
  city.owner = spy.owner;
  city.production = null;
  city.progress = 0;
  city.lastBuilt = null;
  delete city.route;
  s.fog[from].knownCityOwner[city.id] = spy.owner;
  spy.movesLeft = 0;
  spy.movedThisTurn = true;
  spy.orders = null;
  events.push({ type: 'cityCaptured', cityId: city.id, by: spy.owner, from });
  return null;
}

/** The units of the city's own side standing in it (spies hiding there do not count). */
export function garrisonOf(s: GameState, city: { x: number; y: number; owner: PlayerId | null }): Unit[] {
  return s.units.filter((u) => u.x === city.x && u.y === city.y && u.carriedBy === null && u.type !== 'spy' && city.owner !== null && areFriendly(s, u.owner, city.owner));
}

/** The chance a spy hiding in this city is discovered at the start of its owner's turn. */
export function discoveryChance(s: GameState, city: { x: number; y: number; owner: PlayerId | null }): number {
  return Math.min(DISCOVERY.max, DISCOVERY.base + DISCOVERY.perUnit * garrisonOf(s, city).length);
}

/** At the start of `pid`'s turn, enemy spies hiding in their cities may be found and shot. */
export function discoverSpies(s: GameState, rng: RandomSource, pid: PlayerId, events: GameEvent[]): void {
  for (const spy of [...s.units]) {
    if (spy.type !== 'spy' || spy.carriedBy !== null) continue;
    const city = cityAt(s, spy.x, spy.y);
    if (!city || city.owner !== pid || areFriendly(s, city.owner, spy.owner)) continue;
    if (rng.next() >= discoveryChance(s, city)) continue;
    events.push({ type: 'spyFound', cityId: city.id, owner: pid, by: spy.owner });
    destroyUnit(s, spy, 'caught', events, pid);
  }
}

/** What `pid`'s spies standing in or beside an enemy city can read of its production (null when none is near). */
export function cityIntel(
  s: GameState, pid: PlayerId, city: { id: number; x: number; y: number; owner: PlayerId | null },
): { production: UnitType | null; turnsLeft: number | null; garrison: { type: UnitType; count: number }[] } | null {
  if (city.owner === null || areFriendly(s, city.owner, pid)) return null;
  const near = s.units.some((u) => u.type === 'spy' && u.carriedBy === null && areFriendly(s, u.owner, pid) && chebyshev(s, u, city) <= 1);
  if (!near) return null;
  const c = s.cities.find((x) => x.id === city.id)!;
  const counts = new Map<UnitType, number>();
  for (const u of garrisonOf(s, c)) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  const garrison = [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  if (c.production === null) return { production: null, turnsLeft: null, garrison };
  return { production: c.production, turnsLeft: Math.max(1, buildTime(c, c.production) - c.progress), garrison };
}
