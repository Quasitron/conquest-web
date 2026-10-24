import { CITY_STRENGTH_HITS, UNIT_STATS, UNIT_TYPES, buildTime, cargoCapacity, unitDisplayName, type City, type PlayerView, type Unit, type UnitType } from '../engine';
import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import { ActionBar } from './ActionBar';
import { describeOrders } from './actions';
import type { ActionId } from './keys';
import { UNIT_GLYPH } from './colors';
import { cargoAndPatrols, cargoLoad, cargoSummary, cityIsCoastal, patrolsFrom } from './labels';
import { HealthBar } from './UnitInfo';
import { blur } from './blur';
import { UNIT_ICONS } from './unitIcons';

export type Selection = { kind: 'unit'; id: number } | { kind: 'city'; id: number } | { kind: 'enemy'; id: number } | null;

/** The unit's (or city's) picture in your colour, at the top right of the panel; nothing if it has no picture. */
function Picture({ src, color }: { src: string | undefined; color: string }) {
  if (!src) return null;
  return (
    <div class="unit-pic" style={{ borderColor: color }}>
      <img src={src} alt="" />
    </div>
  );
}

interface Props {
  view: PlayerView;
  selection: Selection;
  onSelectUnit: (id: number) => void;
  onProduction: (cityId: number, type: UnitType | null) => void;
  onAction: (id: ActionId) => void;
  onOpenCity: (cityId: number) => void;
  /** Number of units the cycle would visit; End Turn is offered in the empty panel when it is 0. */
  readyCount: number;
  /** Your colour, for the frame round the picture. */
  myColor: string;
  /** The colour of the enemy unit being looked at, for its picture's frame. */
  enemyColor: string;
}

function UnitDetails({ u, view, onAction, onSelectUnit, myColor }: {
  u: Unit; view: PlayerView; onAction: (id: ActionId) => void; onSelectUnit: (id: number) => void; myColor: string;
}) {
  const st = UNIT_STATS[u.type];
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id).sort((a, b) => a.id - b.id);
  const [open, setOpen] = useState(false);
  // Fighters out on a patrol tied to this carrier are part of its group even while they are away.
  const away = st.carries !== null ? patrolsFrom(view.myUnits, u) : [];
  return (
    <div>
      <Picture src={UNIT_ICONS[u.type]?.src} color={myColor} />
      <h3><span class="glyph">{UNIT_GLYPH[u.type]}</span> {unitDisplayName(u)}</h3>
      <p>Orders: {describeOrders(u.orders)}</p>
      <p>Moves {u.movesLeft}/{st.move}</p>
      <HealthBar u={u} />
      {u.fuel !== null && <p>Fuel {u.fuel}/{st.range}</p>}
      {st.carries !== null && cargo.length === 0 && away.length === 0 && <p>{cargoLoad(0, cargoCapacity(u))}</p>}
      {(cargo.length > 0 || away.length > 0) && (
        <div>
          <button class="linklike" aria-expanded={open} title={cargoSummary(cargo)} onClick={(e) => { blur(e); setOpen(!open); }}>
            {cargoAndPatrols(cargo.length, cargoCapacity(u), away.length)}
          </button>
          {open && (
            <ul class="cargo-list">
              {cargo.map((c) => (
                <li key={c.id}><button onClick={(e) => { blur(e); onSelectUnit(c.id); }}>{unitDisplayName(c)} · {describeOrders(c.orders)}</button></li>
              ))}
              {away.map((c) => (
                <li key={c.id}><button onClick={(e) => { blur(e); onSelectUnit(c.id); }}>{unitDisplayName(c)} · {describeOrders(c.orders)} (away)</button></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ActionBar view={view} unit={u} onAction={onAction} />
    </div>
  );
}

function CityDetails({ city, view, onProduction, onSelectUnit, onOpenCity, myColor }: {
  city: City; view: PlayerView; onProduction: Props['onProduction']; onSelectUnit: Props['onSelectUnit']; onOpenCity: Props['onOpenCity']; myColor: string;
}) {
  const coastal = cityIsCoastal(view, city);
  const here = view.myUnits.filter((u) => u.x === city.x && u.y === city.y && u.carriedBy === null);
  return (
    <div>
      <Picture src="/art/units/city.webp" color={myColor} />
      <h3>{city.name}</h3>
      {view.rules.cityStrength && <p>Strength {CITY_STRENGTH_HITS - (city.damage ?? 0)}/{CITY_STRENGTH_HITS}</p>}
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

function SidePanelView({ view, selection, onSelectUnit, onProduction, onAction, onOpenCity, readyCount, myColor, enemyColor }: Props) {
  if (!selection) return <EmptyPanel text="Select a unit or city." readyCount={readyCount} onAction={onAction} />;
  if (selection.kind === 'enemy') {
    const e = view.enemies.find((x) => x.markerId === selection.id);
    if (!e) return <EmptyPanel text="That unit is no longer in view." readyCount={readyCount} onAction={onAction} />;
    const seen = e.visibleNow ? 'In sight now' : `Last seen turn ${e.turnSeen}`;
    return (
      <aside class="panel">
        <Picture src={UNIT_ICONS[e.type]?.src} color={enemyColor} />
        <h3><span class="glyph">{UNIT_GLYPH[e.type]}</span> {UNIT_STATS[e.type].name}</h3>
        <p>{view.players[e.owner].name}</p>
        <p>{seen}</p>
      </aside>
    );
  }
  if (selection.kind === 'unit') {
    const u = view.myUnits.find((x) => x.id === selection.id);
    if (!u) return <EmptyPanel text="That unit is gone." readyCount={readyCount} onAction={onAction} />;
    return (
      <aside class="panel">
        <UnitDetails key={u.id} u={u} view={view} onAction={onAction} onSelectUnit={onSelectUnit} myColor={myColor} />
      </aside>
    );
  }
  const own = view.myCities.find((c) => c.id === selection.id);
  if (own) {
    return (
      <aside class="panel">
        <CityDetails city={own} view={view} onProduction={onProduction} onSelectUnit={onSelectUnit} onOpenCity={onOpenCity} myColor={myColor} />
      </aside>
    );
  }
  const known = view.knownCities.find((c) => c.id === selection.id);
  const owner = known?.owner;
  return (
    <aside class="panel">
      <h3>{known?.name ?? `City #${selection.id}`}</h3>
      <p>{owner === null || owner === undefined ? 'Neutral (last known)' : `${view.players[owner].name} (last known)`}</p>
      {view.rules.cityStrength && known && known.owner !== null && <p>Strength {CITY_STRENGTH_HITS - known.damage}/{CITY_STRENGTH_HITS}</p>}
    </aside>
  );
}

/** Memoised so unrelated GameScreen renders (hover, camera) skip it when its props are unchanged. */
export const SidePanel = memo(SidePanelView);
