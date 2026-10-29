import type { City, GameEvent, GameState, Unit } from './types';
import type { RandomSource } from './rng';
import { CITY_COMBAT, CITY_STRENGTH_HITS, STRIKE_CHANCE, UNIT_STATS, armorBlockedBy, attackBlockedReason, fightRatings, garrisonBonus, hitsOf, isCrippled, isStrikeTarget, rankOf } from './units';
import { chebyshev, normalize, reliefAt, terrainAt } from './map';
import { cityAt, destroyUnit, spawnUnit, topLevelUnitsAt, trimCargo, unitsAt } from './query';
import { areFriendly } from './relations';
import { resolveCombat } from './combat';
import { relocate, settleAircraft, slowArmor, spendMove } from './movement';
import { canPlayerSeeUnit, reveal } from './fog';
import { WAR_TORN_MAX } from './production';

/** Promotions rule: a sea unit that wins a fight gains a win; a new rank heals one hit and is announced. */
function recordWin(s: GameState, u: Unit, events: GameEvent[]): void {
  if (!s.rules.promotions || !UNIT_STATS[u.type].promotes) return;
  const before = rankOf(u.wins);
  u.wins = (u.wins ?? 0) + 1;
  const after = rankOf(u.wins);
  if (after > before) {
    u.damage = Math.max(0, u.damage - 1);
    events.push({ type: 'unitPromoted', unitId: u.id, owner: u.owner, unitType: u.type, rank: after });
  }
}

export function attackRestriction(s: GameState, att: Unit, def: Unit): string | null {
  return attackBlockedReason(att.type, def.type, terrainAt(s, def.x, def.y), att.carriedBy !== null);
}

function canOccupy(s: GameState, att: Unit, target: { x: number; y: number }): boolean {
  const domain = UNIT_STATS[att.type].domain;
  const terrain = terrainAt(s, target.x, target.y);
  if (att.type === 'armor' && s.rules.advancedUnits && armorBlockedBy(reliefAt(s, target.x, target.y))) return false;
  if (domain === 'land') return terrain === 'land';
  if (domain === 'sea') return terrain === 'water';
  return true;
}

/**
 * Where a submarine slips to after its salvo: an open sea square next to it that is two squares from the target
 * (directly away, or alongside), preferring one with the fewest enemy units around it; null if there is none.
 */
function withdrawSquare(s: GameState, sub: Unit, foe: Unit): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const p = normalize(s, sub.x + dx, sub.y + dy);
      if (!p || terrainAt(s, p.x, p.y) !== 'water' || chebyshev(s, p, foe) < 2) continue;
      if (topLevelUnitsAt(s, p.x, p.y).length > 0 || cityAt(s, p.x, p.y)) continue;
      const near = s.units.filter((u) => u.carriedBy === null && !areFriendly(s, u.owner, sub.owner) && chebyshev(s, u, p) <= 1).length;
      const score = near * 10 + (chebyshev(s, p, foe) === 2 && (p.x - foe.x) * (sub.x - foe.x) + (p.y - foe.y) * (sub.y - foe.y) > 0 ? 0 : 1);
      if (score < bestScore) { bestScore = score; best = p; }
    }
  }
  return best;
}

export function attackUnit(s: GameState, rng: RandomSource, att: Unit, def: Unit, events: GameEvent[]): string | null {
  const restriction = attackRestriction(s, att, def);
  if (restriction) return restriction;
  const a = UNIT_STATS[att.type];
  const d = UNIT_STATS[def.type];
  const bombard = a.domain === 'sea' && d.domain === 'land';
  const rating = fightRatings(s.rules, att.type, def.type, reliefAt(s, def.x, def.y));
  const target = { x: def.x, y: def.y };

  // Submarine strike rule: a sub the defender cannot see opens with a torpedo salvo (decided before the sub is revealed).
  const strike = s.rules.submarineStrike && isStrikeTarget(att.type, def.type) && !canPlayerSeeUnit(s, def.owner, att);
  spendMove(att);
  reveal(s, att.owner, def);
  reveal(s, def.owner, att);
  let struck = false;
  let r;
  if (strike && rng.next() < STRIKE_CHANCE) {
    const damage = Math.min(hitsOf(def), def.damage + a.shot);
    r = { attackerWon: damage >= hitsOf(def), attackerDamage: att.damage, defenderDamage: damage };
    struck = !r.attackerWon;
  } else {
    r = resolveCombat(
      { attack: rating.attack, shot: a.shot, hits: hitsOf(att), damage: att.damage },
      { defense: bombard ? rating.defense / 2 : rating.defense, shot: d.shot, hits: hitsOf(def), damage: def.damage },
      rng,
    );
  }
  att.damage = r.attackerDamage;
  def.damage = r.defenderDamage;
  events.push({
    type: 'combat', attackerId: att.id, attackerOwner: att.owner, attackerType: att.type, from: { x: att.x, y: att.y },
    defender: { kind: 'unit', unitId: def.id, owner: def.owner, unitType: def.type },
    x: target.x, y: target.y, attackerWon: r.attackerWon || struck, ...(struck ? { strike: true as const } : {}),
    ...(rankOf(att.wins) > 0 ? { attackerRank: rankOf(att.wins) } : {}), ...(rankOf(def.wins) > 0 ? { defenderRank: rankOf(def.wins) } : {}),
    attackerDamage: r.attackerDamage, defenderDamage: r.defenderDamage,
  });

  if (struck) {
    // The salvo hurt the target but did not sink it: the sub slips one square away and is done for the turn.
    trimCargo(s, def, events);
    att.movesLeft = 0;
    const away = withdrawSquare(s, att, def);
    if (away) relocate(s, att, away, events);
    return null;
  }

  if (r.attackerWon) {
    destroyUnit(s, def, 'combat', events, att.owner);
    recordWin(s, att, events);
    trimCargo(s, att, events);
    const targetClear = topLevelUnitsAt(s, target.x, target.y).every((u) => areFriendly(s, u.owner, att.owner));
    if (targetClear && canOccupy(s, att, target)) {
      att.carriedBy = null;
      relocate(s, att, target, events);
      slowArmor(s, att);
    }
    if (isCrippled(att)) att.movesLeft = 0;
    settleAircraft(s, att, events);
  } else {
    destroyUnit(s, att, 'combat', events, def.owner);
    recordWin(s, def, events);
    trimCargo(s, def, events);
  }
  return null;
}

/**
 * Shore bombardment of a player's city (city strength rule): a Cruiser or Battleship fights it with the city at half
 * defence, as a land unit does under bombardment. The ship never takes the city and never moves; the city can be
 * worn down to its last hit but no further, and it fires back (the ship can be damaged or sunk).
 */
export function bombardCity(s: GameState, rng: RandomSource, att: Unit, city: City, events: GameEvent[]): string | null {
  const a = UNIT_STATS[att.type];
  const floor = CITY_STRENGTH_HITS - 1;
  if ((city.damage ?? 0) >= floor) return 'the city is as weak as bombardment can make it';
  const garrison = s.rules.garrisonsDefend
    ? garrisonBonus(unitsAt(s, city.x, city.y).filter((u) => u.owner === city.owner && UNIT_STATS[u.type].domain === 'land').length)
    : 0;
  spendMove(att);
  const r = resolveCombat(
    { attack: a.attack, shot: a.shot, hits: hitsOf(att), damage: att.damage },
    { defense: (CITY_COMBAT.defense + garrison) / 2, shot: CITY_COMBAT.shot, hits: floor, damage: city.damage ?? 0 },
    rng,
  );
  att.damage = r.attackerDamage;
  city.damage = Math.min(floor, r.defenderDamage); // a big shell cannot take the last hit
  events.push({
    type: 'combat', attackerId: att.id, attackerOwner: att.owner, attackerType: att.type, from: { x: att.x, y: att.y },
    defender: { kind: 'city', cityId: city.id, owner: city.owner },
    x: city.x, y: city.y, attackerWon: r.attackerWon,
    attackerDamage: r.attackerDamage, defenderDamage: city.damage,
  });
  if (!r.attackerWon) destroyUnit(s, att, 'combat', events, city.owner);
  else if (isCrippled(att)) att.movesLeft = 0; // wearing a city down is no kill: no win towards a promotion
  return null;
}

/**
 * A Bomber's attack on a city (Advanced units rule). It fights the city like any attacker, but does not take it or
 * move in: a win costs the city either the production it has built up or a random unit standing in it, and the Bomber
 * keeps its place having used one move. A loss destroys the Bomber.
 */
export function bombCity(s: GameState, rng: RandomSource, att: Unit, city: City, events: GameEvent[]): string | null {
  if (city.owner === null) return 'there is nothing to bomb in a neutral city';
  const a = UNIT_STATS[att.type];
  const garrison = s.rules.garrisonsDefend
    ? garrisonBonus(unitsAt(s, city.x, city.y).filter((u) => u.owner === city.owner && UNIT_STATS[u.type].domain === 'land').length)
    : 0;
  const owner = city.owner;
  spendMove(att);
  const r = resolveCombat(
    { attack: a.attack, shot: a.shot, hits: a.hits, damage: att.damage },
    { defense: CITY_COMBAT.defense + garrison, shot: CITY_COMBAT.shot, hits: CITY_COMBAT.hits, damage: 0 },
    rng,
  );
  att.damage = r.attackerDamage;
  events.push({
    type: 'combat', attackerId: att.id, attackerOwner: att.owner, attackerType: att.type, from: { x: att.x, y: att.y },
    defender: { kind: 'city', cityId: city.id, owner },
    x: city.x, y: city.y, attackerWon: r.attackerWon,
    attackerDamage: r.attackerDamage, defenderDamage: r.defenderDamage,
  });
  if (!r.attackerWon) {
    destroyUnit(s, att, 'combat', events, owner);
    return null;
  }
  const inside = topLevelUnitsAt(s, city.x, city.y);
  if (inside.length > 0 && rng.next() < 0.5) {
    const victim = inside[Math.floor(rng.next() * inside.length)];
    events.push({ type: 'cityBombed', cityId: city.id, by: att.owner, owner, effect: 'unit', unitType: victim.type });
    destroyUnit(s, victim, 'combat', events, att.owner);
  } else {
    city.progress = 0;
    events.push({ type: 'cityBombed', cityId: city.id, by: att.owner, owner, effect: 'production' });
  }
  settleAircraft(s, att, events);
  return null;
}

export function attackCity(s: GameState, rng: RandomSource, att: Unit, city: City, events: GameEvent[]): string | null {
  const a = UNIT_STATS[att.type];
  const strong = s.rules.cityStrength && city.owner !== null; // neutral cities stay easy: one hit
  const garrison = s.rules.garrisonsDefend && city.owner !== null
    ? garrisonBonus(unitsAt(s, city.x, city.y).filter((u) => u.owner === city.owner && UNIT_STATS[u.type].domain === 'land').length)
    : 0;
  spendMove(att);
  const r = resolveCombat(
    { attack: a.attack, shot: a.shot, hits: a.hits, damage: att.damage },
    {
      defense: (s.rules.easierNeutralCities && city.owner === null ? 1 : CITY_COMBAT.defense) + garrison,
      shot: CITY_COMBAT.shot,
      hits: strong ? CITY_STRENGTH_HITS : CITY_COMBAT.hits,
      damage: strong ? city.damage ?? 0 : 0,
    },
    rng,
  );
  // The city keeps the damage it took, even from an attacker it beat (so a siege wears it down).
  if (strong) city.damage = r.attackerWon ? 0 : r.defenderDamage;
  events.push({
    type: 'combat', attackerId: att.id, attackerOwner: att.owner, attackerType: att.type, from: { x: att.x, y: att.y },
    defender: { kind: 'city', cityId: city.id, owner: city.owner },
    x: city.x, y: city.y, attackerWon: r.attackerWon,
    attackerDamage: r.attackerDamage, defenderDamage: r.defenderDamage,
  });
  if (!r.attackerWon) {
    destroyUnit(s, att, 'combat', events, city.owner);
    return null;
  }
  const from = city.owner;
  for (const u of unitsAt(s, city.x, city.y)) {
    if (!areFriendly(s, u.owner, att.owner)) destroyUnit(s, u, 'cityCaptured', events);
  }
  if (s.rules.warTornCities && from !== null) {
    city.warTorn = Math.min(WAR_TORN_MAX, (city.warTorn ?? 0) + 1);
    city.warTornClock = 0;
  }
  city.owner = att.owner;
  city.production = null;
  city.progress = 0;
  city.lastBuilt = null;
  if (from !== null) s.fog[from].knownCityOwner[city.id] = att.owner;
  destroyUnit(s, att, 'garrison', events);
  // An undamaged Armor that takes a city leaves an Army there at once (as in the original Advanced rules); it has no moves left.
  if (att.type === 'armor' && att.damage === 0) spawnUnit(s, 'army', att.owner, city.x, city.y).movesLeft = 0;
  events.push({ type: 'cityCaptured', cityId: city.id, by: att.owner, from });
  return null;
}
