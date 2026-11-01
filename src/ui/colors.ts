import type { UnitType } from '../engine';

/** Eight distinct player colors that stay readable on both land and water. */
export const PLAYER_COLORS = ['#d7263d', '#1b98e0', '#f4a259', '#2e933c', '#8e44ad', '#e8c547', '#14b8a6', '#ff7eb6'];

/** What each player colour is called, in the same order as PLAYER_COLORS. */
const COLOR_NAMES = ['Red', 'Blue', 'Orange', 'Green', 'Purple', 'Yellow', 'Teal', 'Pink'];

/** The name of a player's colour ("Blue"), or null when it is not one of the eight. */
export function colorName(color: string): string | null {
  const i = PLAYER_COLORS.indexOf(color.toLowerCase());
  return i < 0 ? null : COLOR_NAMES[i];
}

export const TERRAIN_COLORS = {
  water: '#24527a',
  land: '#5f8f4a',
  neutralCity: '#e6e6e6',
  unexplored: '#0e1116',
  fog: 'rgba(0, 0, 0, 0.42)',
  selection: '#ffffff',
  moveTarget: 'rgba(255, 255, 255, 0.35)',
  attackTarget: 'rgba(255, 80, 80, 0.55)',
} as const;

export const UNIT_GLYPH: Record<UnitType, string> = {
  army: 'A', armor: 'M', fighter: 'F', bomber: 'R', transport: 'T', destroyer: 'D',
  submarine: 'S', cruiser: 'C', battleship: 'B', carrier: 'K', airbase: 'H', spy: 'Y',
};
