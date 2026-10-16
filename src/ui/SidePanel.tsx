import { UNIT_STATS, UNIT_TYPES, buildTime, unitDisplayName, type City, type PlayerView, type Unit, type UnitType } from '../engine';
import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import { ActionBar } from './ActionBar';
import { describeOrders } from './actions';
import type { ActionId } from './keys';
import { UNIT_GLYPH } from './colors';
import { cargoSummary, cityIsCoastal } from './labels';
import { HealthBar } from './UnitInfo';
import { blur } from './blur';

export type Selection = { kind: 'unit'; id: number } | { kind: 'city'; id: number } | null;

interface Props {
  view: PlayerView;
  selection: Selection;
  onSelectUnit: (id: number) => void;
  onProduction: (cityId: number, type: UnitType | null) => void;
  onAction: (id: ActionId) => void;
  onOpenCity: (cityId: number) => void;
  /** Number of units the cycle would visit; End Turn is offered in the empty panel when it is 0. */
  readyCount: number;
}

function UnitDetails({ u, view, onAction, onSelectUnit }: {
  u: Unit; view: PlayerView; onAction: (id: ActionId) => void; onSelectUnit: (id: number) => void;
}) {
  const st = UNIT_STATS[u.type];
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id).sort((a, b) => a.id - b.id);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <h3><span class="glyph">{UNIT_GLYPH[u.type]}</span> {unitDisplayName(u)}</h3>
      <p>Orders: {describeOrders(u.orders)}</p>
      <p>Moves {u.movesLeft}/{st.move}</p>
      <HealthBar u={u} />
      {u.fuel !== null && <p>Fuel {u.fuel}/{st.range}</p>}
      {cargo.length > 0 && (
        <div>
          <button class="linklike" aria-expanded={open} onClick={(e) => { blur(e); setOpen(!open); }}>
            Carrying: {cargoSummary(cargo)}
          </button>
          {open && (
            <ul class="cargo-list">
              {cargo.map((c) => (
                <li key={c.id}><button onClick={(e) => { blur(e); onSelectUnit(c.id); }}>{unitDisplayName(c)}</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ActionBar view={view} unit={u} onAction={onAction} />
    </div>
  );
}

function CityDetails({ city, view, onProduction, onSelectUnit, onOpenCity }: {
  city: City; view: PlayerView; onProduction: Props['onProduction']; onSelectUnit: Props['onSelectUnit']; onOpenCity: Props['onOpenCity'];
}) {
  const coastal = cityIsCoastal(view, city);
  const here = view.myUnits.filter((u) => u.x === city.x && u.y === city.y && u.carriedBy === null);
  return (
    <div>
      <h3>{city.name}</h3>
      <button onClick={(e) => { blur(e); onOpenCity(city.id); }}>Open city screen</button>
      <label>Building{' '}
        <select value={city.production ?? ''} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
          (e.currentTarget as HTMLElement).blur();
          onProduction(city.id, v === '' ? null : (v as UnitType));
        }}>
          <option value="">Nothing</option>
          {UNIT_TYPES.map((t) => (
            <option value={t} disabled={UNIT_STATS[t].domain === 'sea' && !coastal}>
              {UNIT_STATS[t].name} ({buildTime(city, t)} turns)
            </option>
          ))}
        </select>
      </label>
      {city.production && <p>Progress {city.progress}/{buildTime(city, city.production)}</p>}
      {here.length > 0 && (
        <div>
          <h4>Units here</h4>
          {here.map((u) => (
            <button onClick={(e) => { (e.currentTarget as HTMLElement).blur(); onSelectUnit(u.id); }}>{UNIT_STATS[u.type].name} ({u.movesLeft} moves)</button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyPanel({ text, readyCount, onAction }: { text: string; readyCount: number; onAction: Props['onAction'] }) {
  return (
    <aside class="panel">
      <p>{text}</p>
      <div class="actions">
        <button onClick={(e) => { blur(e); onAction('next'); }}>Next unit</button>
        {readyCount === 0 && <button class="primary" onClick={(e) => { blur(e); onAction('endTurn'); }}>End Turn</button>}
      </div>
    </aside>
  );
}

function SidePanelView({ view, selection, onSelectUnit, onProduction, onAction, onOpenCity, readyCount }: Props) {
  if (!selection) return <EmptyPanel text="Select a unit or city." readyCount={readyCount} onAction={onAction} />;
  if (selection.kind === 'unit') {
    const u = view.myUnits.find((x) => x.id === selection.id);
    if (!u) return <EmptyPanel text="That unit is gone." readyCount={readyCount} onAction={onAction} />;
    return (
      <aside class="panel">
        <UnitDetails key={u.id} u={u} view={view} onAction={onAction} onSelectUnit={onSelectUnit} />
      </aside>
    );
  }
  const own = view.myCities.find((c) => c.id === selection.id);
  if (own) {
    return (
      <aside class="panel">
        <CityDetails city={own} view={view} onProduction={onProduction} onSelectUnit={onSelectUnit} onOpenCity={onOpenCity} />
      </aside>
    );
  }
  const known = view.knownCities.find((c) => c.id === selection.id);
  const owner = known?.owner;
  return (
    <aside class="panel">
      <h3>{known?.name ?? `City #${selection.id}`}</h3>
      <p>{owner === null || owner === undefined ? 'Neutral (last known)' : `${view.players[owner].name} (last known)`}</p>
    </aside>
  );
}

/** Memoised so unrelated GameScreen renders (hover, camera) skip it when its props are unchanged. */
export const SidePanel = memo(SidePanelView);
