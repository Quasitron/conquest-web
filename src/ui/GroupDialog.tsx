import { UNIT_STATS, UNIT_TYPES, type PlayerView, type UnitType } from '../engine';
import { blur } from './blur';
import { eligibleFor, GROUP_ORDERS, type GroupOrderId } from './group';
import { PlacedDialog } from './LeaderLine';

interface Props {
  view: PlayerView;
  /** Ids of the units the box caught. */
  unitIds: number[];
  onPick: (order: GroupOrderId) => void;
  onCancel: () => void;
}

/** The one order to give every unit in the group; each button shows how many of the units it applies to. */
export function GroupDialog({ view, unitIds, onPick, onCancel }: Props) {
  const counts = new Map<UnitType, number>();
  for (const id of unitIds) {
    const u = view.myUnits.find((x) => x.id === id);
    if (u) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  }
  const summary = UNIT_TYPES.filter((t) => counts.has(t)).map((t) => `${counts.get(t)} ${UNIT_STATS[t].name}`).join(', ');
  return (
    <PlacedDialog anchor={null} label="Group" onKey={(e) => { if (e.key === 'Escape') { onCancel(); return true; } return false; }}>
      <h2>Group <span class="muted">{unitIds.length} {unitIds.length === 1 ? 'unit' : 'units'}</span></h2>
      <p class="muted">{summary}</p>
      <p>Give them all one order:</p>
      <div class="group-orders">
        {GROUP_ORDERS.map((o) => {
          const n = eligibleFor(view, unitIds, o.id).length;
          return (
            <button key={o.id} disabled={n === 0} onClick={(e) => { blur(e); onPick(o.id); }}>{o.label} ({n})</button>
          );
        })}
      </div>
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onCancel(); }}>Cancel</button>
      </div>
    </PlacedDialog>
  );
}

