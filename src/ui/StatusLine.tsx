import type { Unit } from '../engine';
import { statusLine } from './labels';
import { blur } from './blur';

interface Props {
  unit: Unit | null;
  onFit: () => void;
  /** Clears the selection like Esc; the button shows only when canDeselect. */
  onDeselect: () => void;
  canDeselect: boolean;
  /** Production map: units hidden, each city shows what it builds. */
  prodMap: boolean;
  onToggleProdMap: () => void;
  /** Routes view: arrows from each route city to its destination. */
  routesMap: boolean;
  onToggleRoutes: () => void;
}

export function StatusLine({ unit, onFit, onDeselect, canDeselect, prodMap, onToggleProdMap, routesMap, onToggleRoutes }: Props) {
  return (
    <div class="statusline">
      <span class="statusline-text">{prodMap ? 'Production map: each city shows what it is building and the turns left.' : unit ? statusLine(unit) : ''}</span>
      <button class={routesMap ? 'primary' : ''} title="Show the routes set on your cities" onClick={(e) => { blur(e); onToggleRoutes(); }}>
        {routesMap ? 'Hide Routes' : 'Routes'}
      </button>
      <button class={prodMap ? 'primary' : ''} title="Show what every city is building and when it finishes" onClick={(e) => { blur(e); onToggleProdMap(); }}>
        {prodMap ? 'Exit Prod. Map' : 'Prod. Map'}
      </button>
      {canDeselect && <button title="Clear the selection (Esc)" onClick={(e) => { blur(e); onDeselect(); }}>Deselect (Esc)</button>}
      <button title="Fit the map to the window (Z)" onClick={(e) => { blur(e); onFit(); }}>Fit</button>
    </div>
  );
}
