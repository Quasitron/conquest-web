import type { Unit } from '../engine';
import { statusLine } from './labels';
import { blur } from './blur';

interface Props {
  unit: Unit | null;
  onFit: () => void;
  /** Clears the selection like Esc; the button shows only when canDeselect. */
  onDeselect: () => void;
  canDeselect: boolean;
}

export function StatusLine({ unit, onFit, onDeselect, canDeselect }: Props) {
  return (
    <div class="statusline">
      <span class="statusline-text">{unit ? statusLine(unit) : ''}</span>
      {canDeselect && <button title="Clear the selection (Esc)" onClick={(e) => { blur(e); onDeselect(); }}>Deselect (Esc)</button>}
      <button title="Fit the map to the window (Z)" onClick={(e) => { blur(e); onFit(); }}>Fit</button>
    </div>
  );
}
