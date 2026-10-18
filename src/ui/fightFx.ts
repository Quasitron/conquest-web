import type { FightFrame } from './fights';

const COLORS = { capture: '#ffd24a', explosion: '#ff7a2e', hit: '#cfd8e3' } as const;

/**
 * Draws one frame of a fight on a square whose centre is (cx, cy) and whose side is t pixels.
 * Deliberately plain (rings, tracers, a burst) and self-contained: the later art pass replaces just this function.
 */
export function drawFightFx(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number, f: FightFrame): void {
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = 'round';

  if (f.burst === 0) {
    // Shots: a red target ring and three tracers closing in on the square.
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ff4d4d';
    ctx.lineWidth = Math.max(2, t * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, t * (0.75 - 0.2 * f.shots), 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#fff3b0';
    ctx.lineWidth = Math.max(1.5, t * 0.06);
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 2.1;
      const near = (1.3 - 1.0 * f.shots) * t;
      const far = near + 0.35 * t;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * far, cy + Math.sin(a) * far);
      ctx.lineTo(cx + Math.cos(a) * near, cy + Math.sin(a) * near);
      ctx.stroke();
    }
  } else {
    // The result: an expanding ring and rays that fade out. Gold for a captured city, orange for a kill, grey for a hit.
    const color = COLORS[f.outcome];
    ctx.globalAlpha = Math.max(0, 1 - f.burst);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, t * 0.12 * (1 - f.burst));
    const reach = f.outcome === 'hit' ? 0.7 : 1.15;
    ctx.beginPath();
    ctx.arc(cx, cy, t * (0.2 + reach * f.burst), 0, Math.PI * 2);
    ctx.stroke();
    if (f.outcome !== 'hit') {
      ctx.globalAlpha = Math.max(0, 0.8 - f.burst);
      ctx.beginPath();
      ctx.arc(cx, cy, t * 0.35 * (1 - f.burst * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.max(0, 1 - f.burst);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * t * (0.3 + 0.5 * f.burst), cy + Math.sin(a) * t * (0.3 + 0.5 * f.burst));
        ctx.lineTo(cx + Math.cos(a) * t * (0.5 + 0.9 * f.burst), cy + Math.sin(a) * t * (0.5 + 0.9 * f.burst));
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
