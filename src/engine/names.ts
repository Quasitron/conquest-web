import { CITY_NAMES } from '../data/cityNames';
import { Rng } from './rng';
import { UNIT_STATS } from './units';
import type { Unit } from './types';

export const NAME_MAX = 24;

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

export function unitDisplayName(u: Pick<Unit, 'id' | 'type' | 'name'>): string {
  return u.name ?? `${ordinal(u.id)} ${UNIT_STATS[u.type].name}`;
}

const ROMAN = [
  '', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X',
  ' XI', ' XII', ' XIII', ' XIV', ' XV', ' XVI', ' XVII', ' XVIII', ' XIX', ' XX',
];

/** '' for 0, ' II' for 1, ... up to ' XX' for 19; beyond that a plain number suffix. */
export function romanSuffix(k: number): string {
  return k < ROMAN.length ? ROMAN[k] : ` ${k + 1}`;
}

let shuffled: string[] | null = null;

function shuffledNames(): string[] {
  if (!shuffled) {
    const order = CITY_NAMES.map((n) => n.name);
    const rng = new Rng(0x2c2c);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    shuffled = order;
  }
  return shuffled;
}

export function defaultCityName(id: number): string {
  const order = shuffledNames();
  const L = order.length;
  return order[id % L] + romanSuffix(Math.floor(id / L));
}

/** Trimmed name, or null when the input is not a string, has control characters, or is too long. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  const t = raw.trim();
  return t.length > NAME_MAX ? null : t;
}
