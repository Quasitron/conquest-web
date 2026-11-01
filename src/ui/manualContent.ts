import { CITY_STRENGTH_HITS, UNIT_STATS, UNIT_TYPES, type UnitType } from '../engine';
import { ACTION_LABELS } from './ActionBar';
import { HOUSE_RULE_OPTIONS } from './houseRules';
import { UNIT_BLURB } from './ProductionReport';

/** One page of the Manual: a title, paragraphs, and an optional list of terms with what they mean. */
export interface ManualSection {
  id: string;
  title: string;
  paragraphs: string[];
  items?: { term: string; text: string }[];
}

const DOMAIN_WORDS = { land: 'land', sea: 'sea', air: 'air' } as const;

/** What one unit type is, from its numbers, in a line. */
function unitLine(t: UnitType): string {
  const u = UNIT_STATS[t];
  const bits = [`${DOMAIN_WORDS[u.domain]} unit`, u.move > 0 ? `moves ${u.move}` : 'never moves', `${u.hits} ${u.hits === 1 ? 'hit' : 'hits'}`];
  if (u.attack > 0) bits.push(`attack ${u.attack}`);
  bits.push(`defence ${u.defense}`);
  if (u.shot > 1) bits.push(`${u.shot} shots`);
  if (u.range !== null) bits.push(`range ${u.range}`);
  if (u.carries.length > 0) bits.push(`carries ${u.capacity}`);
  if (u.producible) bits.push(`takes ${u.build} turns to build, then ${u.buildRepeat} for each after`);
  if (u.advanced) bits.push('Advanced units rule');
  return `${UNIT_BLURB[t]} (${bits.join(', ')}.)`;
}

const KEY_ORDER = [
  'next', 'skip', 'hold', 'sentry', 'repair', 'moveTo', 'patrol', 'goHome', 'explore', 'escort', 'load', 'unload',
  'clearOrders', 'disband', 'airbase', 'sabotage', 'hurt', 'incite', 'center', 'fit', 'info', 'endTurn',
] as const;

const KEY_MEANING: Record<(typeof KEY_ORDER)[number], string> = {
  next: 'Select the next unit that is waiting for orders.',
  skip: 'Standby: leave this unit for now and move on to the next one.',
  hold: 'Hold Position: the unit stays where it is.',
  sentry: 'Sentry: the unit sleeps until an enemy comes into sight.',
  repair: 'Repair: the unit stays put to heal (in a friendly city a unit that does not move heals 1 hit a turn).',
  moveTo: 'Move To: then click a square; the unit goes there by the shortest known way, over as many turns as it takes.',
  patrol: 'Patrol back and forth between two squares: click the first, then the second.',
  goHome: 'Go Home: head for the nearest friendly city.',
  explore: 'Explore: the unit wanders out to uncover the nearest unexplored squares by itself.',
  escort: 'Escort: a warship follows a Transport and guards it, fighting what it is likely to beat.',
  load: 'Load the unit onto a ship or aircraft carrier beside it.',
  unload: 'Unload what is aboard onto land or into a city.',
  clearOrders: 'Clear the unit\'s orders so it waits for you again.',
  disband: 'Disband (scrap) the unit. This cannot be undone.',
  airbase: 'Turn an Army or Armor on open land into an Airbase (Advanced units rule). This is permanent.',
  sabotage: 'A Spy in an enemy city wrecks the production that city has built up.',
  hurt: 'A Spy in an enemy city damages one unit of its garrison.',
  incite: 'An Elite Spy tries to turn an enemy city against its owner (needs the Promotions rule).',
  center: 'Center the map on the selected unit.',
  fit: 'Zoom the map to fit the whole world in the window.',
  info: 'Show or hide the unit information card.',
  endTurn: 'End your turn.',
};

export function buildManual(): ManualSection[] {
  const sections: ManualSection[] = [
    {
      id: 'goal',
      title: 'The goal',
      paragraphs: [
        'Theater of Conquest is a turn-based war game in the spirit of Empire Deluxe. You begin with a single city. Your cities build armies, fleets and aircraft, and you use them to explore the map, capture neutral and enemy cities, and defeat your rivals.',
        'A player is knocked out at the end of their turn when they hold no city and have no unit that could take one. The game is won when everyone still alive is on the same side: the last player standing, or the last team.',
      ],
    },
    {
      id: 'turn',
      title: 'Taking a turn',
      paragraphs: [
        'Each of your units has a number of moves each turn. Click a unit to select it, then press a number-pad key (or click a square next to it) to move. Moving into an enemy unit or a city that is not yours attacks it. When no unit is waiting for orders, press Enter or click End Turn.',
        'The map is dark where you have not been. You see only the squares beside your units and cities, so enemies appear and vanish as you move. A marker stays on the map for 3 turns where an enemy unit was last seen.',
        'A fight is decided by the units\' attack and defence strengths over several rounds, and damage carries over between fights. When you hover an enemy the game shows the odds of winning, for example "Attack (62%)".',
      ],
    },
    {
      id: 'cities',
      title: 'Cities and production',
      paragraphs: [
        'Click one of your cities to open it and choose what it builds. A city finishes its first unit of a kind in the number of turns shown, and each further unit of that kind in fewer. When a unit is finished a report appears so you can give it orders at once.',
        'A neutral city defends with strength 2. An Army (or Armor) wins it by attacking from an adjacent square; ships and aircraft cannot take cities. Aircraft refuel in your cities, and a unit that stays in one of your cities without moving for a turn heals 1 hit.',
        'A route sends the units a city builds to a destination city automatically: set it on the city screen.',
      ],
    },
    {
      id: 'units',
      title: 'The units',
      paragraphs: ['Every unit, with its numbers. "Hits" is how much damage it takes before it is lost. Units marked Advanced are built only when the Advanced units rule is on.'],
      items: UNIT_TYPES.map((t) => ({ term: UNIT_STATS[t].name, text: unitLine(t) })),
    },
    {
      id: 'keys',
      title: 'Keys and mouse',
      paragraphs: [
        'Move with the number pad (8 up, 9 up-right, 6 right, 3 down-right, 2 down, 1 down-left, 4 left, 7 up-left) or Home, PageUp, PageDown and End for the diagonals. The arrow keys scroll the map. Esc deselects or closes whatever is open.',
        'Clicking a distant square with a unit selected sends the unit there. The Orders menu at the top lists the orders the selected unit can be given.',
      ],
      items: KEY_ORDER.map((id) => ({ term: `${ACTION_LABELS[id].label} (${ACTION_LABELS[id].key})`, text: KEY_MEANING[id] })),
    },
    {
      id: 'orders',
      title: 'Standing orders',
      paragraphs: [
        'Orders carry on over the following turns until they finish or something interrupts them. A unit with orders is not asked about again until it arrives, is blocked, sights an enemy, runs low on fuel or is crippled.',
        'Aircraft must end each turn in a city, on a Carrier or on an Airbase before their fuel (their range) runs out, or they crash. The path preview tells you when a flight is out of range.',
      ],
    },
    {
      id: 'combat',
      title: 'Combat and damage',
      paragraphs: [
        'In each round the attacker or the defender scores a hit, in proportion to their strengths; a unit that has taken all its hits is destroyed. Units that were hurt stay hurt: you can retreat a damaged ship and repair it in port.',
        'A unit that has lost half its hits or more is crippled: it can move only 1 square a turn, and with the Advanced units rule it also attacks at half strength.',
        'Cruisers and Battleships can shell land units on the shore at half the defence. Submarines cannot attack land units and land units cannot attack submarines.',
      ],
    },
    {
      id: 'sight',
      title: 'Sight and the fog of war',
      paragraphs: [
        'Units and cities see the squares next to them. With the Advanced units rule, all air units, cities and Airbases see 2 squares, and anything that can see aircraft sees them from 2 squares away.',
        'Submarines are seen only by Destroyers, Cruisers, other Submarines and cities. Spies are never seen by ordinary sight; they show only beside a city that holds a spy of its own.',
        'Allies and teammates share what they see.',
      ],
    },
    {
      id: 'allies',
      title: 'Allies and teams',
      paragraphs: [
        'On the New Game screen each seat can be put on a Team (1 to 4). Players on the same team are allies for the whole game: they share sight, can enter and repair in each other\'s cities, and win together. Players who are Alone fight everyone. Up to 8 players can play, human or Computer.',
        'Allied units cannot share a square in the open, and you cannot attack an ally. The computer players do not coordinate with their allies yet.',
      ],
    },
    {
      id: 'spies',
      title: 'Spies',
      paragraphs: [
        'A Spy (Advanced units rule) slips into an enemy city unseen. There it can read what the city is building, sabotage its production, damage one unit of its garrison, or (when Elite) incite a revolt. Each act risks the spy being caught and shot.',
        'The newspaper reports the big events: sabotage, a revolt, an operative found. A spy in your own city uncovers enemy spies in and beside it.',
      ],
    },
    {
      id: 'advanced',
      title: 'Advanced units rules',
      paragraphs: [
        'These rules from the original game\'s advanced version come with the Advanced units house rule: Armor, Bombers, Airbases and Spies; terrain on the map (mountains, forest, rough ground, rivers, deserts); 2-square sight for air units, cities and Airbases; crippled units attacking at half strength; and ships other than Carriers attacking aircraft poorly.',
        `A land unit in a forest or on a mountain defends at double against everything but Armies, and at double in a river against Armor. Armor cannot enter mountains and moves 1 square in rough ground, rivers and forest.`,
      ],
    },
    {
      id: 'houserules',
      title: 'House rules',
      paragraphs: [
        'These optional rules are chosen when a game is made. With all of them off the game plays like the original basic game.',
        `With City strength on, a player's city takes ${CITY_STRENGTH_HITS} hits to fall.`,
      ],
      items: HOUSE_RULE_OPTIONS.map((o) => ({ term: o.label, text: o.hint })),
    },
    {
      id: 'theaters',
      title: 'Historical theaters',
      paragraphs: [
        'Instead of a random map you can fight on a real one: Western Europe, the Pacific, the Eastern Front and more. Each theater lists the countries that start there. Choose your country on the New Game screen, or leave it on Random. The other players are given the remaining countries; each starts in its own capital or biggest city, and the cities of countries nobody plays start neutral.',
        'The start of a country nobody chose stays hidden until the game begins.',
      ],
    },
    {
      id: 'saving',
      title: 'Saving and settings',
      paragraphs: [
        'The game saves itself as you play ("Continue Last Save" on the title screen). Use Save As to keep a game under its own name, and Export to put it in a file.',
        'Settings has sound and music, and how fights are shown: animated on the map, as a report, or not at all.',
      ],
    },
  ];
  return sections;
}

/** The sections that match every word typed in the search box (all of them when it is empty). */
export function searchManual(sections: readonly ManualSection[], query: string): ManualSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...sections];
  return sections.filter((s) => {
    const text = [s.title, ...s.paragraphs, ...(s.items ?? []).flatMap((i) => [i.term, i.text])].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
