import { useState } from 'preact/hooks';
import { UNIT_STATS, type PlayerView, type Pos } from '../engine';
import { blur } from './blur';
import { UNIT_GLYPH } from './colors';
import { PlacedDialog } from './LeaderLine';
import type { BattleLine, Sighting } from './reportLines';
import { StatusTab } from './StatusReport';

export type ReportTab = 'status' | 'combat' | 'recon';

interface Props {
  view: PlayerView;
  tab: ReportTab;
  battles: BattleLine[];
  sightings: Sighting[];
  /** Centers the map on a square and flashes it, so a line in a report can be found on the map. */
  onShow: (at: Pos) => void;
  onClose: () => void;
}

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'status', label: 'Status' },
  { id: 'combat', label: 'Combat' },
  { id: 'recon', label: 'Recon' },
];

/** The Reports dialog, like the original's Reports menu: status, battles against you, and enemy sightings. */
export function Reports({ view, tab: first, battles, sightings, onShow, onClose }: Props) {
  const [tab, setTab] = useState<ReportTab>(first);
  const count = (id: ReportTab) => (id === 'combat' ? battles.length : id === 'recon' ? sightings.length : 0);
  return (
    <PlacedDialog anchor={null} label="Reports" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <h2>Reports <span class="muted">turn {view.turn}</span></h2>
      <div class="report-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" aria-selected={tab === t.id} class={tab === t.id ? 'primary' : ''}
            onClick={(e) => { blur(e); setTab(t.id); }}
          >
            {t.label}{count(t.id) > 0 ? ` (${count(t.id)})` : ''}
          </button>
        ))}
      </div>

      {tab === 'status' && <StatusTab view={view} />}

      {tab === 'combat' && (
        battles.length === 0
          ? <p class="muted">No battles against you since your last turn.</p>
          : (
            <ul class="report-list">
              {battles.map((b, i) => (
                <li key={i}>
                  <span class={b.attackerWon ? 'lost-battle' : 'won-battle'}>{b.text}</span>
                  <span class="muted">at {b.at.x},{b.at.y}</span>
                  <button onClick={(e) => { blur(e); onShow(b.at); }}>Show</button>
                </li>
              ))}
            </ul>
          )
      )}

      {tab === 'recon' && (
        sightings.length === 0
          ? <p class="muted">No enemy units sighted since your last turn.</p>
          : (
            <ul class="report-list">
              {sightings.map((s, i) => (
                <li key={i}>
                  <span><span class="glyph">{UNIT_GLYPH[s.type]}</span> {s.owner}'s {UNIT_STATS[s.type].name}</span>
                  <span class="muted">at {s.at.x},{s.at.y} · {s.visibleNow ? 'in sight now' : `last seen turn ${s.turnSeen}`}</span>
                  <button onClick={(e) => { blur(e); onShow(s.at); }}>Show</button>
                </li>
              ))}
            </ul>
          )
      )}

      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}
