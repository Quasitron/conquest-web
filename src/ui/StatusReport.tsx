import { UNIT_STATS, type PlayerView } from '../engine';
import { UNIT_GLYPH } from './colors';
import { Flag } from './Flag';
import { opponentStatus, statusSummary } from './statusNumbers';

/** The status report: your cities, how much you have explored, and each unit type's production, strength and toll. */
export function StatusTab({ view, colors }: { view: PlayerView; colors: string[] }) {
  const s = statusSummary(view);
  const opponents = opponentStatus(view);
  return (
    <>
      <dl class="status-facts">
        <dt>Cities captured</dt><dd>{s.citiesCaptured}</dd>
        <dt>Cities known</dt><dd>{s.citiesKnown}</dd>
        <dt>World explored</dt><dd>{s.worldExplored}%</dd>
        <dt>Map edges</dt><dd>{view.wrap ? 'Wraps east-west' : 'No wrap'}</dd>
      </dl>
      <ul class="status-players" aria-label="Opponents">
        {opponents.map((p) => (
          <li key={p.id} class={p.active ? '' : 'out'}>
            <span class="swatch" style={{ background: colors[p.id] }} /> <Flag name={p.name} /> {p.name}{p.ally ? ' (ally)' : ''}: {p.active ? 'in the game' : 'eliminated'}
          </li>
        ))}
      </ul>
      {view.cityless.map((p) => (
        <p key={p.id} class="status-note">
          {p.name} has no cities left but still has {p.units} {p.units === 1 ? 'unit' : 'units'} somewhere.
        </p>
      ))}
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
    </>
  );
}
