import { useEffect, useRef } from 'preact/hooks';
import type { ParsedMap } from '../engine/ascii';

interface Props {
  map: ParsedMap;
  /** Indices into `map.cities` of each player's starting city, and the colour of each player (to show starts to a player choosing a country; none are shown otherwise). */
  starts: number[];
  colors: string[];
}

const COLORS = {
  water: '#1c4a74',
  land: '#4d7a39',
  forest: '#2c5a2c',
  rough: '#8a7142',
  mountain: '#9a9a96',
  river: '#4f93d0',
  city: '#f2efe6',
};

/** A small picture of a map (as it will be played) for the New Game screen, with a ring in each player's colour on their start. */
export function MapPreview({ map, starts, colors }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cell = Math.max(2, Math.min(4, Math.floor(300 / map.width)));
    canvas.width = map.width * cell;
    canvas.height = map.height * cell;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = y * map.width + x;
        const t = map.terrain[i];
        const r = map.relief?.[i];
        ctx.fillStyle = t === 'water' ? COLORS.water
          : r === 'river' ? COLORS.river
          : r === 'mountain' ? COLORS.mountain
          : r === 'rough' ? COLORS.rough
          : r === 'forest' ? COLORS.forest
          : COLORS.land;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // Cities as small light squares; the start cities get a bigger marker in their player's colour.
    for (const c of map.cities) {
      ctx.fillStyle = COLORS.city;
      ctx.fillRect(c.x * cell, c.y * cell, cell, cell);
    }
    starts.forEach((s, p) => {
      const c = map.cities[s];
      if (!c) return;
      const cx = (c.x + 0.5) * cell;
      const cy = (c.y + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = colors[p] ?? '#ffffff';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
  }, [map, starts, colors]);
  return <canvas ref={ref} class="map-preview" role="img" aria-label="Map preview" />;
}
