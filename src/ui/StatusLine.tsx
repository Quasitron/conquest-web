import type { Unit } from '../engine';
import { statusLine } from './labels';

// After a pointer click, release focus so keys keep going to the map.
const blur = (e: Event) => (e.currentTarget as HTMLElement).blur();

export function StatusLine({ unit, onFit }: { unit: Unit | null; onFit: () => void }) {
  return (
    <div class="statusline">
      <span class="statusline-text">{unit ? statusLine(unit) : ''}</span>
      <button title="Fit the map to the window (Z)" onClick={(e) => { blur(e); onFit(); }}>Fit</button>
    </div>
  );
}