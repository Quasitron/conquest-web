import { useState } from 'preact/hooks';
import { UNIT_STATS, type UnitType } from '../engine';
import { cardLines } from './labels';

/**
 * A unit's artwork card (public/art/<type>.webp). The pictures carry made-up lettering in their top-left corner, so a
 * dark panel covers it and shows the unit's real numbers instead. The card scales with its width (see .unit-card).
 */
export function UnitCard({ type }: { type: UnitType }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <div class="unit-card">
      <img src={`/art/${type}.webp`} alt={`${UNIT_STATS[type].name} card`} onError={() => setMissing(true)} />
      <ul class="unit-card-hud">
        {cardLines(type).map((l) => <li key={l}>{l}</li>)}
      </ul>
    </div>
  );
}
