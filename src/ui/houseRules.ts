import type { HouseRules } from '../engine';

/** The house rules as the New Game screen lists them, and as the Manual describes them. */
export const HOUSE_RULE_OPTIONS: { key: keyof HouseRules; label: string; hint: string }[] = [
  {
    key: 'easierNeutralCities',
    label: 'Easier neutral cities',
    hint: 'Neutral cities defend at half strength (about 2 in 3 attacks succeed).',
  },
  {
    key: 'fairFirstTurn',
    label: 'Fair first turn',
    hint: 'No city builds on turn 1, so the first player gets no head start.',
  },
  {
    key: 'sentriedStayAsGarrison',
    label: 'Sentried armies stay as garrison',
    hint: "Transports leaving a city don't pick up armies on Sentry.",
  },
  {
    key: 'garrisonsDefend',
    label: 'Garrisons defend',
    hint: 'Each army or armor in a city adds 1 to its defence (at most +2); ships and aircraft add nothing. The garrison still dies if the city falls.',
  },
  {
    key: 'warTornCities',
    label: 'War-torn cities',
    hint: "A city taken from another player builds 25% slower for each such capture (up to 4), recovering one step every 10 turns.",
  },
  {
    key: 'promotions',
    label: 'Promotions',
    hint: 'Ships (and Armor and Spies, with Advanced units) that win fights are promoted: Experienced (1 win), Veteran (3), Elite (5). Each promotion heals one hit, and Elite units take one more; an Elite Spy can incite a revolt. Shown as gold chevrons on the unit.',
  },
  {
    key: 'advancedUnits',
    label: 'Advanced units',
    hint: 'Adds Armor (twice as fast and tough as an army, takes two places on a transport; an undamaged Armor that takes a city leaves an Army in it), Bombers (range 24; they bomb an enemy city to wipe its production or destroy a unit in it, fight poorly against fighters, and cannot land on carriers) and Airbases (an Army or Armor on open land can turn itself into one for good; it holds 8 aircraft and cannot move or attack). and Spies (they slip unseen into enemy cities to read what they build and sabotage it; a spy in your own city uncovers enemy spies near it). Ships other than carriers attack aircraft at 1. The map also gets terrain: mountains (Armor cannot enter), forest, rough ground and rivers (Armor can only move one square there), and land units defend at double in forests and on mountains against everything but Armies, and in rivers against Armor.',
  },
  {
    key: 'submarineStrike',
    label: 'Submarine strike',
    hint: "A submarine the enemy cannot see opens its attack on a Transport, Carrier or Battleship with a torpedo salvo that hits 7 times in 10. It sinks a Transport outright; a Carrier or Battleship is damaged and the sub slips one square away unharmed. A miss is a normal fight. A Destroyer, Cruiser, submarine or city next to the sub sees it, and then there is no surprise.",
  },
  {
    key: 'cityStrength',
    label: 'City strength',
    hint: "A player's city takes 3 hits to fall and keeps its damage between attacks, healing 1 hit a turn, so groups can wear it down. Cruisers and Battleships can also bombard a player's city, down to its last hit, but cannot take it. Neutral cities stay easy.",
  },
];
