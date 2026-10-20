import type { Unit } from '../engine';
import { statusLine } from './labels';
import { blur } from './blur';

interface Props {
  unit: Unit | null;
  onFit: () => void;
  /** Centres the map on the selected unit or city; the button shows only when something is selected. */
  onCenter: () => void;
  /** Clears the selection like Esc; the button shows only when canDeselect. */
  onDeselect: () => void;
  canDeselect: boolean;
  /** Production map: units hidden, each city shows what it builds. */
  prodMap: boolean;
  onToggleProdMap: () => void;
  /** Routes view: arrows from each route city to its destination. */
  routesMap: boolean;
  onToggleRoutes: () => void;
  /** Opens the list of all your units. */
  onUnits: () => void;
  /** Opens the reports (status, combat, recon). */
  onReports: () => void;
  /** Battles against you since your last turn, shown as a count on the Reports button. */
  battleCount: number;
  /** Group mode: drag a box on the map, then give all the units in it one order. */
  groupActive: boolean;
  onGroup: () => void;
}

export function StatusLine({
  unit, onFit, onCenter, onDeselect, canDeselect, prodMap, onToggleProdMap, routesMap, onToggleRoutes, onUnits, onReports,
  battleCount, groupActive, onGroup,
}: Props) {
  return (
    <div class="statusline">
      <span class="statusline-text">{prodMap ? 'Production map: each city shows what it is building and the turns left.' : unit ? statusLine(unit) : ''}</span>
      <button title="Status, battles against you, and enemy sightings" onClick={(e) => { blur(e); onReports(); }}>
        Reports{battleCount > 0 ? ` (${battleCount})` : ''}
      </button>
      <button title="List all your units and jump to one" onClick={(e) => { blur(e); onUnits(); }}>Units</button>
      <button class={groupActive ? 'primary' : ''} title="Drag a box over your units, then give them all one order (Shift+drag with a mouse)" onClick={(e) => { blur(e); onGroup(); }}>
        {groupActive ? 'Cancel Group' : 'Group'}
      </button>
      <button class={routesMap ? 'primary' : ''} title="Show the routes set on your cities" onClick={(e) => { blur(e); onToggleRoutes(); }}>
        {routesMap ? 'Hide Routes' : 'Routes'}
      </button>
      <button class={prodMap ? 'primary' : ''} title="Show what every city is building and when it finishes" onClick={(e) => { blur(e); onToggleProdMap(); }}>
        {prodMap ? 'Exit Prod. Map' : 'Prod. Map'}
      </button>
      {canDeselect && <button title="Centre the map on the selected unit (C)" onClick={(e) => { blur(e); onCenter(); }}>Center</button>}
      {canDeselect && <button title="Clear the selection (Esc)" onClick={(e) => { blur(e); onDeselect(); }}>Deselect (Esc)</button>}
      <button title="Fit the map to the window (Z)" onClick={(e) => { blur(e); onFit(); }}>Fit</button>
    </div>
  );
}
