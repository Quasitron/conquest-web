import { useState } from 'preact/hooks';
import {
  UNIT_STATS, UNIT_TYPES, cargoCapacity, rankOf, unitDisplayName, type PlayerView, type Unit, type UnitType,
} from '../engine';
import { describeOrders } from './actions';
import { blur } from './blur';
import { Chevrons } from './Chevrons';
import { UNIT_GLYPH } from './colors';
import { cargoAndPatrols, patrolsFrom } from './labels';
import { PlacedDialog } from './LeaderLine';

interface Props {
  view: PlayerView;
  /** Selects the unit on the map and centers on it; the list then closes. */
  onSelect: (id: number) => void;
  onClose: () => void;
}

/** Where a unit is, in words: aboard a ship, in a city, or at map coordinates. */
function whereIs(view: PlayerView, u: Unit): string {
  if (u.carriedBy !== null) {
    const host = view.myUnits.find((h) => h.id === u.carriedBy);
    return host ? `aboard ${unitDisplayName(host)}` : 'aboard';
  }
  const city = view.myCities.find((c) => c.x === u.x && c.y === u.y);
  return city ? `in ${city.name}` : `at ${u.x},${u.y}`;
}

/** Every unit you own, filterable by type, each with a button that jumps to it on the map. */
export function UnitList({ view, onSelect, onClose }: Props) {
  const [filter, setFilter] = useState<UnitType | 'all'>('all');
  const counts = new Map<UnitType, number>();
  for (const u of view.myUnits) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  const shown = view.myUnits
    .filter((u) => filter === 'all' || u.type === filter)
    .sort((a, b) => UNIT_TYPES.indexOf(a.type) - UNIT_TYPES.indexOf(b.type) || a.id - b.id);

  return (
    <PlacedDialog anchor={null} label="Units" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <h2>Units <span class="muted">{view.myUnits.length} in all</span></h2>
      <label>Show{' '}
        <select value={filter} onChange={(e) => setFilter((e.target as HTMLSelectElement).value as UnitType | 'all')}>
          <option value="all">All units</option>
          {UNIT_TYPES.filter((t) => counts.has(t)).map((t) => (
            <option value={t}>{UNIT_STATS[t].name} ({counts.get(t)})</option>
          ))}
        </select>
      </label>
      {shown.length === 0
        ? <p class="muted">No units.</p>
        : (
          <ul class="unit-list">
            {shown.map((u) => (
              <li key={u.id}>
                <button class="linklike" onClick={(e) => { blur(e); onSelect(u.id); }}>
                  <span class="glyph">{UNIT_GLYPH[u.type]}</span> {unitDisplayName(u)}<Chevrons rank={rankOf(u.wins)} />
                </button>
                <span class="muted">
                  {whereIs(view, u)} · {describeOrders(u.orders)}
                  {UNIT_STATS[u.type].carries !== null && ` · ${cargoAndPatrols(view.myUnits.filter((c) => c.carriedBy === u.id).length, cargoCapacity(u), patrolsFrom(view.myUnits, u).length)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}
