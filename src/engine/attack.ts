import type { City, GameEvent, GameState, Unit } from './types';
import type { RandomSource } from './rng';
import { CITY_COMBAT, UNIT_STATS, isCrippled } from './units';
import { terrainAt } from './map';
import { destroyUnit, topLevelUnitsAt, trimCargo, unitsAt } from './query';
import { areFriendly } from './relations';
import { resolveCombat } from './combat';
import { relocate, settleAircraft, spendMove } from './movement';
import { reveal } from './fog';

export function attackRestriction(s: GameState, att: Unit, def: Unit): string | null {
  const a = UNIT_STATS[att.type];
  const d = UNIT_STATS[def.type];
  const defTerrain = terrainAt(s, def.x, def.y);
  if ((att.type === 'submarine' && d.domain === 'land') || (a.domain === 'land' && def.type === 'submarine')) {
    return 'submarines and land units cannot attack each other';
  }
  if (d.domain === 'air' && a.domain === 'sea' && defTerrain !== 'water') return 'ships cannot attack aircraft over land';
  if (d.domain === 'air' && a.domain === 'land' && defTerrain === 'water') return 'land units cannot attack aircraft over water';
  if (a.domain === 'sea' && d.domain === 'land' && !a.bombard) return 'only cruisers and battleships can bombard';
  if (att.carriedBy !== null && a.domain === 'land' && defTerrain === 'water') {
    return 'armies on a transport can only attack onto land';
  }
  return null;
}

function canOccupy(att: Unit, terrain: string): boolean {
  const domain = UNIT_STATS[att.type].domain;
  if (domain === 'land') return terrain === 'land';
  if (domain === 'sea') return terrain === 'water';
  return true;
}

export function attackUnit(s: GameState, rng: RandomSource, att: Unit, def: Unit, events: GameEvent[]): string | null {
  const restriction = attackRestriction(s, att, def);
  if (restriction) return restriction;
  const a = UNIT_STATS[att.type];
  const d = UNIT_STATS[def.type];
  const bombard = a.domain === 'sea' && d.domain === 'land';
  const target = { x: def.x, y: def.y };

  spendMove(att);
  reveal(s, att.owner, def);
  reveal(s, def.owner, att);
  const r = resolveCombat(
    { attack: a.attack, shot: a.shot, hits: a.hits, damage: att.damage },
    { defense: bombard ? d.defense / 2 : d.defense, shot: d.shot, hits: d.hits, damage: def.damage },
    rng,
  );
  att.damage = r.attackerDamage;
  def.damage = r.defenderDamage;
  events.push({
    type: 'combat', attackerId: att.id, attackerOwner: att.owner, attackerType: att.type,
    defender: { kind: 'unit', unitId: def.id, owner: def.owner, unitType: def.type },
    x: target.x, y: target.y, attackerWon: r.attackerWon,
    attackerDamage: r.attackerDamage, defenderDamage: r.defenderDamage,
  });

  if (r.attackerWon) {
    destroyUnit(s, def, 'combat', events, att.owner);
    trimCargo(s, att, events);
    const targetClear = topLevelUnitsAt(s, target.x, target.y).every((u) => areFriendly(s, u.owner, att.owner));
    if (targetClear && canOccupy(att, terrainAt(s, target.x, target.y))) {
      att.carriedBy = null;
      relocate(s, att, target, events);
    }
    if (isCrippled(att)) att.movesLeft = 0;
    settleAircraft(s, att, events);
  } else {
    destroyUnit(s, att, 'combat', events, def.owner);
    trimCargo(s, def, events);
  }
  return null;
}

export function attackCity(s: GameState, rng: RandomSource, att: Unit, city: City, events: GameEvent[]): string | null {
  const a = UNIT_STATS[att.type];
  spendMove(att);
  const r = resolveCombat(
    { attack: a.attack, shot: a.shot, hits: a.hits, damage: att.damage },
    {
      defense: s.rules.easierNeutralCities && city.owner === null ? 1 : CITY_COMBAT.defense,
      shot: CITY_COMBAT.shot, hits: CITY_COMBAT.hits, damage: 0,
    },
    rng,
  );
  events.push({
    type: 'combat', attackerId: att.id, attackerOwner: att.owner, attackerType: att.type,
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
  city.owner = att.owner;
  city.production = null;
  city.progress = 0;
  city.lastBuilt = null;
  if (from !== null) s.fog[from].knownCityOwner[city.id] = att.owner;
  destroyUnit(s, att, 'garrison', events);
  events.push({ type: 'cityCaptured', cityId: city.id, by: att.owner, from });
  return null;
}
