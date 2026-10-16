import type { Unit } from '../engine';
import { statusLine } from './labels';
import { blur } from './blur';

export function StatusLine({ unit, onFit }: { unit: Unit | null; onFit: () => void }) {
  return (
    <div class="statusline">
      <span class="statusline-text">{unit ? statusLine(unit) : ''}</span>
      <button title="Fit the map to the window (Z)" onClick={(e) => { blur(e); onFit(); }}>Fit</button>
    </div>
  );
}
