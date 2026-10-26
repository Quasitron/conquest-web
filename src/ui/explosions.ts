import type { Pos } from '../engine';
import { loaded } from './unitIcons';

/**
 * The explosion over a unit (or city) that lost a fight: one of three fire pictures, drawn as light on the map (the
 * black round them disappears), with a puff of smoke behind it. The fire flashes in, swells and settles at half
 * strength, where it stays for the last frame of the fight.
 */
/** After its fight is over the explosion stays this long (ms), fading out. */
export const EXPLOSION_TAIL_MS = 600;

const FIRE = ['/art/fx/explosion-1.webp', '/art/fx/explosion-2.webp', '/art/fx/explosion-3.webp'];
const SMOKE = ['/art/fx/smoke-1.webp', '/art/fx/smoke-2.webp'];

/** Which of the pictures a fight uses: fixed by where and who, so playing the same fight again looks the same. */
export function explosionVariant(f: { at: Pos; attackerId: number }): number {
  return Math.abs(f.at.x * 7 + f.at.y * 13 + f.attackerId) % FIRE.length;
}

/** Whether the fire picture has loaded (it starts loading the first time it is asked for). */
export function explosionReady(variant: number): boolean {
  return loaded(FIRE[variant % FIRE.length]) !== null;
}

/** Draws the explosion centred on (cx, cy) for a tile `t` pixels wide; `burst` runs from 0 (nothing yet) to 1 (settled). */
export function drawExplosion(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, burst: number, variant: number, fade = 1): void {
  const fire = loaded(FIRE[variant % FIRE.length]);
  if (!fire) return;
  const smoke = loaded(SMOKE[variant % SMOKE.length]);
  const grow = 1 - (1 - Math.min(1, Math.max(0, burst))) ** 2; // quick at first, then easing
  ctx.save();
  if (smoke) {
    const size = t * (0.9 + 1.4 * grow);
    ctx.globalAlpha = 0.55 * Math.min(1, burst * 3) * fade;
    ctx.drawImage(smoke, cx - size / 2, cy - size / 2 - t * 0.2 * grow, size, size);
  }
  const size = t * (0.8 + 1.4 * grow);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (burst < 0.2 ? burst / 0.2 : 1 - 0.5 * ((burst - 0.2) / 0.8)) * fade;
  ctx.drawImage(fire, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}