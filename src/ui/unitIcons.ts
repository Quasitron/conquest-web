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
}

export const UNIT_ICONS: Partial<Record<UnitType, UnitIcon>> = {
  army: { src: '/art/units/army.webp', faces: null },
  destroyer: { src: '/art/units/destroyer.webp', faces: 'right' },
  transport: { src: '/art/units/transport.webp', faces: 'right' },
  fighter: { src: '/art/units/fighter.webp', faces: 'left' },
};

/** Squares at least this many pixels wide show the picture; smaller ones keep the letter badge. */
export const ICON_MIN_TILE = 28;

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

/** The unit's picture once it has loaded (loading starts the first time it is asked for), else null. */
export function iconImage(type: UnitType): HTMLImageElement | null {
  const icon = UNIT_ICONS[type];
  if (!icon || typeof Image === 'undefined') return null;
  let img = images.get(icon.src);
  if (!img) {
    img = new Image();
    img.onload = () => { for (const l of listeners) l(); };
    img.src = icon.src;
    images.set(icon.src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

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