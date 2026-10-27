import { useState } from 'preact/hooks';
import { UNIT_STATS, unitDisplayName, type PlayerView, type UnitType } from '../engine';
import type { ProductionReportItem } from './cycle';
import { statsText, withArticle } from './labels';
import { PlacedDialog } from './LeaderLine';
import type { Pt } from './placement';
import { blur } from './blur';
import { UnitCard } from './UnitCard';

/** One short description per unit type, for the Help line. */
export const UNIT_BLURB: Record<UnitType, string> = {
  army: 'Foot soldiers: one of two units that can take a city, but slow and helpless at sea.',
  armor: 'Heavy tanks: twice as fast and twice as tough as an army, but they fill two places on a transport.',
  fighter: 'A fast scout and striker; it must land in a city or on a carrier before its fuel runs out.',
  bomber: 'A slower aircraft with a longer range; it sinks ships and bombs cities, but fights poorly against fighters and cannot land on a carrier.',
  airbase: 'Made by an army or armor on open land: it cannot move or attack, but aircraft land and refuel there.',
  transport: 'Ferries armies across the water; weak in a fight, so keep it escorted.',
  destroyer: 'A quick, cheap warship that spots submarines and screens bigger ships.',
  submarine: 'Hard to see and hits hard, striking with several shots at once.',
  cruiser: 'A tough warship that can shell shore targets and spot submarines.',
  battleship: 'The heaviest gun at sea: slow and costly, but very hard to sink.',
  carrier: 'A floating airfield that carries and refuels fighters.',
};

interface Props {
  view: PlayerView;
  report: ProductionReportItem;
  anchor: Pt | null;
  /** The latest command error, if any (the top bar is hidden behind the dialog). */
  error?: string | null;
  onRename: (name: string) => void;
  onProd: () => void;
  /** Told when the Help line is shown or hidden. */
  onHelp?: (open: boolean) => void;
  onOk: () => void;
}

export function ProductionReport({ view, report, anchor, error, onRename, onProd, onHelp, onOk }: Props) {
  const city = view.myCities.find((c) => c.id === report.cityId);
  const unit = view.myUnits.find((u) => u.id === report.unitId);
  const [name, setName] = useState(unit?.name ?? '');
  const [help, setHelp] = useState(false);
  if (!city) return null;
  const st = UNIT_STATS[report.unitType];
  return (
    <PlacedDialog
      anchor={anchor} label="Production report"
      onKey={(e) => {
        if (e.key !== 'Escape') return false;
        onOk();
        return true;
      }}
    >
      <h2>Production report</h2>
      <UnitCard type={report.unitType} />
      <p class="report-text">City <strong>{city.name}</strong> reports production of <strong>{withArticle(st.name)}</strong>.</p>
      {unit && (
        <form class="rename" onSubmit={(e) => { e.preventDefault(); onRename(name); }}>
          <input
            value={name} maxLength={24} placeholder={unitDisplayName(unit)} aria-label="Unit name"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <button type="submit" onClick={blur}>Rename</button>
        </form>
      )}
      {help && (
        <div class="muted">
          <p>{st.name}: {statsText(report.unitType)}</p>
          <p>{UNIT_BLURB[report.unitType]}</p>
        </div>
      )}
      {error && <p class="error" role="alert">{error}</p>}
      <div class="picker-actions">
        <button onClick={(e) => { blur(e); onProd(); }}>Prod.</button>
        <button aria-pressed={help} onClick={(e) => { blur(e); setHelp(!help); onHelp?.(!help); }}>Help</button>
        <button class="primary" onClick={(e) => { blur(e); onOk(); }}>OK</button>
      </div>
    </PlacedDialog>
  );
}
