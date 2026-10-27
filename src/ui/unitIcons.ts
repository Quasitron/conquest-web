import type { PlayerId, UnitType } from '../engine';
import type { LogEntry } from '../app/session';

/**
 * Picture icons for units on the map (public/art/units/<type>.webp, made by tools/make-unit-icons.ps1). A unit with
 * no icon here, or any unit when the map is zoomed out, is drawn as its letter badge instead.
 */
export interface UnitIcon {
  src: string;
  /** Which way the picture faces; the game mirrors it when the unit moves the other way. null: it never flips. */
  faces: 'left' | 'right' | null;
  /** How much of the square the picture may fill (1 = all of it): bigger units are drawn bigger, so they differ at a glance. */
  size: number;
}

export const UNIT_ICONS: Partial<Record<UnitType, UnitIcon>> = {
  army: { src: '/art/units/army.webp', faces: 'right', size: 1 },
  armor: { src: '/art/units/armor.webp', faces: 'right', size: 1 },
  fighter: { src: '/art/units/fighter.webp', faces: 'right', size: 0.92 },
  bomber: { src: '/art/units/bomber.webp', faces: 'right', size: 0.95 },
  destroyer: { src: '/art/units/destroyer.webp', faces: 'right', size: 0.84 },
  transport: { src: '/art/units/transport.webp', faces: 'right', size: 0.9 },
  cruiser: { src: '/art/units/cruiser.webp', faces: 'right', size: 0.93 },
  battleship: { src: '/art/units/battleship.webp', faces: 'right', size: 1 },
  carrier: { src: '/art/units/carrier.webp', faces: 'right', size: 1 },
  submarine: { src: '/art/units/submarine.webp', faces: 'right', size: 0.8 },
};

/** Squares at least this many pixels wide show the picture; smaller ones keep the letter badge. */
export const ICON_MIN_TILE = 28;

/** The share of the square this unit's picture may fill (see UnitIcon.size); 1 for a unit with no picture. */
export const iconSize = (type: UnitType): number => UNIT_ICONS[type]?.size ?? 1;

/** Whether the picture must be mirrored: the unit heads left but the picture faces right, or the other way round. */
export function iconFlipped(type: UnitType, movingLeft: boolean): boolean {
  const faces = UNIT_ICONS[type]?.faces ?? null;
  if (faces === null) return false;
  return faces === 'right' ? movingLeft : !movingLeft;
}

const images = new Map<string, HTMLImageElement>();
const listeners = new Set<() => void>();

/** Called when a picture has finished loading, so the map can be drawn again with it. */
export function onIconsLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A picture once it has loaded (loading starts the first time it is asked for), else null. */
export function loaded(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.onload = () => { for (const l of listeners) l(); };
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** The unit's picture once it has loaded, else null. */
export function iconImage(type: UnitType): HTMLImageElement | null {
  const icon = UNIT_ICONS[type];
  return icon ? loaded(icon.src) : null;
}

/** The city skyline picture (public/art/units/city.webp) once it has loaded, else null. */
export const cityImage = (): HTMLImageElement | null => loaded('/art/units/city.webp');

/**
 * The ids of the player's units whose last move was to the left (the shorter way round on a wrapping map). Units that
 * have not moved, or last moved right, face right. The log only holds this session's events, so after a reload every
 * unit faces right until it moves.
 */
export function unitsHeadingLeft(entries: readonly LogEntry[], width: number, wrap: boolean, me: PlayerId): Set<number> {
  void me; // the log is already the player's own view
  const left = new Set<number>();
  for (const { event: e } of entries) {
    if (e.type !== 'unitMoved') continue;
    let dx = e.to.x - e.from.x;
    if (wrap && Math.abs(dx) > width / 2) dx -= Math.sign(dx) * width;
    if (dx < 0) left.add(e.unitId);
    else if (dx > 0) left.delete(e.unitId);
  }
  return left;
}