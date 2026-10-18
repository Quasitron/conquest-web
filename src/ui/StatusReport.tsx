import { UNIT_STATS, type PlayerView } from '../engine';
import { blur } from './blur';
import { UNIT_GLYPH } from './colors';
import { PlacedDialog } from './LeaderLine';
import { statusSummary } from './statusNumbers';

interface Props {
  view: PlayerView;
  onClose: () => void;
}

/** The status report: your cities, how much you have explored, and each unit type's production, strength and toll. */
export function StatusReport({ view, onClose }: Props) {
  const s = statusSummary(view);
  return (
    <PlacedDialog anchor={null} label="Status report" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <h2>Status <span class="muted">turn {view.turn}</span></h2>
      <dl class="status-facts">
        <dt>Cities captured</dt><dd>{s.citiesCaptured}</dd>
        <dt>Cities known</dt><dd>{s.citiesKnown}</dd>
        <dt>World explored</dt><dd>{s.worldExplored}%</dd>
      </dl>
      <table class="status-table">
        <thead>
          <tr>
            <th />
            <th title="Cities building this type">Building</th>
            <th title="Turns until the next one is finished">Next in</th>
            <th title="Units of this type you have now">In service</th>
            <th title="Enemy units of this type you destroyed">Killed</th>
            <th title="Your units of this type destroyed">Lost</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.type}>
              <th scope="row"><span class="glyph">{UNIT_GLYPH[r.type]}</span> {UNIT_STATS[r.type].name}</th>
              <td>{r.underConstruction || ''}</td>
              <td>{r.soonest ?? ''}</td>
              <td>{r.inService || ''}</td>
              <td>{r.killed || ''}</td>
              <td>{r.lost || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}
