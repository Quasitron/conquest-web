import type { Dir, GameEvent, GameState, Pos, Unit } from './types';
import type { RandomSource } from './rng';
import { UNIT_STATS, armorBlockedBy, armorSlowedBy, canCarry } from './units';
import { reliefAt, step, terrainAt } from './map';
import { cargoOf, cargoRoom, cityAt, destroyUnit, hasRoomFor, isAtRefuelPoint, topLevelUnitsAt } from './query';
import { areFriendly } from './relations';
import { attackCity, attackUnit, bombCity, bombardCity } from './attack';

export function spendMove(u: Unit): void {
  u.movesLeft -= 1;
  u.movedThisTurn = true;
  if (u.fuel !== null) u.fuel -= 1;
}

/** Armor that has just entered rough, river or forest ground (Advanced rules) has its move cut to one, so it is spent. */
export function slowArmor(s: GameState, u: Unit): void {
  if (u.type === 'armor' && s.rules.advancedUnits && armorSlowedBy(reliefAt(s, u.x, u.y))) u.movesLeft = 0;
}

export function relocate(s: GameState, u: Unit, to: Pos, events: GameEvent[]): void {
  const from = { x: u.x, y: u.y };
  const leaving = cityAt(s, from.x, from.y);
  u.x = to.x;
  u.y = to.y;
  u.unloadNextTurn = false;
  for (const c of cargoOf(s, u)) {
    c.x = to.x;
    c.y = to.y;
  }
  // A transport leaving a city takes the armies there, and a carrier the fighters, up to capacity.
  if (UNIT_STATS[u.type].carries.length > 0 && leaving && areFriendly(s, leaving.owner, u.owner)) {
    let room = cargoRoom(s, u);
    const waiting = s.units.filter(
      (a) =>
        canCarry(u.type, a.type) &&
        a.carriedBy === null &&
        a.owner === u.owner &&
        a.x === from.x &&
        a.y === from.y &&
        !(s.rules.sentriedStayAsGarrison && a.orders !== null),
    );
    for (const a of waiting) {
      const need = UNIT_STATS[a.type].slots;
      if (need > room) continue;
      room -= need;
      a.carriedBy = u.id;
      a.x = to.x;
      a.y = to.y;
      // Armies aboard sleep; fighters aboard a carrier wait for orders until the player sentries them.
      a.orders = UNIT_STATS[a.type].domain === 'air' ? null : { kind: 'sentry' };
    }
  }
  // Aircraft patrols tied to this carrier move with it, as in the original.
  for (const p of s.units) {
    const o = p.orders;
    if (o?.kind === 'patrol' && o.carrier?.id === u.id) o[o.carrier.end] = { x: u.x, y: u.y };
  }
  events.push({ type: 'unitMoved', unitId: u.id, from, to: { x: to.x, y: to.y } });
}

export function settleAircraft(s: GameState, u: Unit, events: GameEvent[]): void {
  const st = UNIT_STATS[u.type];
  if (st.domain !== 'air' || !s.units.includes(u)) return;
  if (isAtRefuelPoint(s, u)) {
    u.fuel = st.range;
    u.movesLeft = 0;
  } else if ((u.fuel ?? 0) <= 0) {
    destroyUnit(s, u, 'crashed', events);
  }
}

export function moveUnit(s: GameState, rng: RandomSource, u: Unit, dir: Dir, events: GameEvent[]): string | null {
  if (u.type === 'airbase') return 'an airbase cannot move';
  if (u.movesLeft <= 0) return 'unit has no moves left';
  const to = step(s, u.x, u.y, dir);
  if (!to) return 'cannot move off the map';
  const st = UNIT_STATS[u.type];

  const city = cityAt(s, to.x, to.y);
  if (city && !areFriendly(s, city.owner, u.owner)) {
    if (st.domain === 'sea' && st.bombard && s.rules.cityStrength && city.owner !== null) return bombardCity(s, rng, u, city, events);
    if (st.domain === 'air' && u.type === 'bomber' && s.rules.advancedUnits) return bombCity(s, rng, u, city, events);
    if (st.domain !== 'land') return 'only land units can attack cities';
    return attackCity(s, rng, u, city, events);
  }

  const occupants = topLevelUnitsAt(s, to.x, to.y);
  const enemy = occupants.find((o) => !areFriendly(s, o.owner, u.owner));
  if (enemy) return attackUnit(s, rng, u, enemy, events);

  if (city) {
    spendMove(u);
    u.carriedBy = null;
    relocate(s, u, to, events);
    settleAircraft(s, u, events);
    return null;
  }

  const host = occupants.find(
    (o) => hasRoomFor(s, o, u.type),
  );
  if (host) {
    spendMove(u);
    u.carriedBy = host.id;
    u.orders = st.domain === 'air' ? null : { kind: 'sentry' };
    relocate(s, u, to, events);
    settleAircraft(s, u, events);
    return null;
  }

  const terrain = terrainAt(s, to.x, to.y);
  if (st.domain === 'land' && terrain !== 'land') return 'land units cannot enter water';
  if (u.type === 'armor' && s.rules.advancedUnits && armorBlockedBy(reliefAt(s, to.x, to.y))) return 'Armor cannot enter mountains';
  if (st.domain === 'sea' && terrain !== 'water') return 'ships can only enter water or friendly cities';
  if (occupants.length > 0) {
    const canPassOver = st.domain === 'air' && u.movesLeft > 1 && (u.fuel ?? 0) > 1;
    if (!canPassOver) return 'square is occupied';
  }

  spendMove(u);
  u.carriedBy = null;
  relocate(s, u, to, events);
  slowArmor(s, u);
  settleAircraft(s, u, events);
  return null;
}
