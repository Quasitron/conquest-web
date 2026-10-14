import type { Dir, GameEvent, GameState, Pos, Unit } from './types';
import type { RandomSource } from './rng';
import { UNIT_STATS, cargoCapacity } from './units';
import { step, terrainAt } from './map';
import { cargoOf, cityAt, destroyUnit, isAtRefuelPoint, topLevelUnitsAt } from './query';
import { areFriendly } from './relations';

export function spendMove(u: Unit): void {
  u.movesLeft -= 1;
  u.movedThisTurn = true;
  if (u.fuel !== null) u.fuel -= 1;
}

export function relocate(s: GameState, u: Unit, to: Pos, events: GameEvent[]): void {
  const from = { x: u.x, y: u.y };
  const carriesArmies = UNIT_STATS[u.type].carries === 'army';
  const leaving = cityAt(s, from.x, from.y);
  u.x = to.x;
  u.y = to.y;
  for (const c of cargoOf(s, u)) {
    c.x = to.x;
    c.y = to.y;
  }
  if (carriesArmies && leaving && areFriendly(s, leaving.owner, u.owner)) {
    const room = cargoCapacity(u) - cargoOf(s, u).length;
    const waiting = s.units.filter(
      (a) => a.type === 'army' && a.carriedBy === null && a.owner === u.owner && a.x === from.x && a.y === from.y,
    );
    for (const a of waiting.slice(0, Math.max(0, room))) {
      a.carriedBy = u.id;
      a.x = to.x;
      a.y = to.y;
    }
  }
  const entering = cityAt(s, to.x, to.y);
  if (carriesArmies && entering && areFriendly(s, entering.owner, u.owner)) {
    for (const c of cargoOf(s, u)) c.carriedBy = null;
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
  if (u.movesLeft <= 0) return 'unit has no moves left';
  const to = step(s, u.x, u.y, dir);
  if (!to) return 'cannot move off the map';
  const st = UNIT_STATS[u.type];

  const city = cityAt(s, to.x, to.y);
  if (city && !areFriendly(s, city.owner, u.owner)) {
    if (st.domain !== 'land') return 'only land units can attack cities';
    return 'attacking is not implemented yet';
  }

  const occupants = topLevelUnitsAt(s, to.x, to.y);
  const enemy = occupants.find((o) => !areFriendly(s, o.owner, u.owner));
  if (enemy) return 'attacking is not implemented yet';

  if (city) {
    spendMove(u);
    u.carriedBy = null;
    relocate(s, u, to, events);
    settleAircraft(s, u, events);
    return null;
  }

  const host = occupants.find(
    (o) => UNIT_STATS[o.type].carries === u.type && cargoOf(s, o).length < cargoCapacity(o),
  );
  if (host) {
    spendMove(u);
    u.carriedBy = host.id;
    relocate(s, u, to, events);
    settleAircraft(s, u, events);
    return null;
  }

  const terrain = terrainAt(s, to.x, to.y);
  if (st.domain === 'land' && terrain !== 'land') return 'land units cannot enter water';
  if (st.domain === 'sea' && terrain !== 'water') return 'ships can only enter water or friendly cities';
  if (occupants.length > 0) {
    const canPassOver = st.domain === 'air' && u.movesLeft > 1 && (u.fuel ?? 0) > 1;
    if (!canPassOver) return 'square is occupied';
  }

  spendMove(u);
  u.carriedBy = null;
  relocate(s, u, to, events);
  settleAircraft(s, u, events);
  return null;
}
