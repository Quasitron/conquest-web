import type { GameEvent, GameState, PlayerId, Unit, UnitType } from './types';
import { UNIT_STATS, rankOf } from './units';
import { chebyshev, index, normalize } from './map';
import { cityAt, destroyUnit } from './query';
import { areFriendly } from './relations';

const SIGHT = 1;
const MARKER_LIFETIME = 3;

interface Observer {
  x: number;
  y: number;
  kind: UnitType | 'city';
}

function observersOf(s: GameState, pid: PlayerId): Observer[] {
  const obs: Observer[] = [];
  for (const u of s.units) if (areFriendly(s, u.owner, pid)) obs.push({ x: u.x, y: u.y, kind: u.type });
  for (const c of s.cities) if (areFriendly(s, c.owner, pid)) obs.push({ x: c.x, y: c.y, kind: 'city' });
  return obs;
}

function observerSees(s: GameState, o: Observer, target: { type: UnitType; x: number; y: number }): boolean {
  if (chebyshev(s, o, target) > SIGHT) return false;
  if (target.type === 'submarine' && o.kind !== 'city' && !UNIT_STATS[o.kind].seesSubs) return false;
  if (o.kind === 'submarine' && UNIT_STATS[target.type].domain !== 'sea') return false;
  return true;
}

export function visibleSquares(s: GameState, pid: PlayerId): Set<number> {
  const vis = new Set<number>();
  for (const o of observersOf(s, pid)) {
    for (let dy = -SIGHT; dy <= SIGHT; dy++) {
      for (let dx = -SIGHT; dx <= SIGHT; dx++) {
        const p = normalize(s, o.x + dx, o.y + dy);
        if (p) vis.add(index(s, p.x, p.y));
      }
    }
  }
  return vis;
}

/** A spy standing in a city of pid's side: it uncovers enemy spies in and beside that city. */
function spyWatchers(s: GameState, pid: PlayerId): Unit[] {
  return s.units.filter((u) => {
    if (u.type !== 'spy' || u.carriedBy !== null || !areFriendly(s, u.owner, pid)) return false;
    const c = cityAt(s, u.x, u.y);
    return !!c && areFriendly(s, c.owner, pid);
  });
}

/** Spies are unseen by ordinary sight; one is seen only while it stands beside a city of the other side that holds a spy of its own. */
export function canPlayerSeeUnit(s: GameState, pid: PlayerId, target: Unit): boolean {
  if (target.type === 'spy') {
    if (target.carriedBy !== null || cityAt(s, target.x, target.y)) return false;
    return spyWatchers(s, pid).some((w) => chebyshev(s, w, target) <= 1);
  }
  if (target.carriedBy !== null) return false;
  if (cityAt(s, target.x, target.y)) return false;
  return observersOf(s, pid).some((o) => observerSees(s, o, target));
}

export function reveal(s: GameState, pid: PlayerId, u: Unit): void {
  if (areFriendly(s, pid, u.owner)) return;
  s.fog[pid].lastSeen[u.id] = { unitId: u.id, type: u.type, owner: u.owner, x: u.x, y: u.y, turnSeen: s.turn, ...(rankOf(u.wins) > 0 ? { rank: rankOf(u.wins) } : {}) };
}

export function updateFog(s: GameState, pid: PlayerId): void {
  const fog = s.fog[pid];
  const vis = visibleSquares(s, pid);
  for (const i of vis) fog.explored[i] = 1;
  for (const c of s.cities) if (vis.has(index(s, c.x, c.y))) fog.knownCityOwner[c.id] = c.owner;

  const seenNow = new Set<number>();
  for (const u of s.units) {
    if (!areFriendly(s, u.owner, pid) && canPlayerSeeUnit(s, pid, u)) {
      reveal(s, pid, u);
      seenNow.add(u.id);
    }
  }

  const observers = observersOf(s, pid);
  for (const key of Object.keys(fog.lastSeen)) {
    const e = fog.lastSeen[Number(key)];
    if (seenNow.has(e.unitId)) continue;
    const couldSeeIt = observers.some((o) => observerSees(s, o, e));
    if (couldSeeIt || s.turn - e.turnSeen >= MARKER_LIFETIME) delete fog.lastSeen[Number(key)];
  }
}

/** An enemy spy inside a city that holds a spy of the city's owner is discovered and shot. */
export function catchSpies(s: GameState, events: GameEvent[]): void {
  for (const spy of [...s.units]) {
    if (spy.type !== 'spy' || spy.carriedBy !== null || !cityAt(s, spy.x, spy.y)) continue;
    const watcher = spyWatchers(s, cityAt(s, spy.x, spy.y)!.owner ?? -1).find((w) => w.x === spy.x && w.y === spy.y && !areFriendly(s, w.owner, spy.owner));
    if (watcher) destroyUnit(s, spy, 'caught', events, watcher.owner);
  }
}
