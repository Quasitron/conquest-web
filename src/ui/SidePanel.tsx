import { UNIT_STATS, UNIT_TYPES, buildTime, isCoastal, type City, type PlayerView, type Unit, type UnitType } from '../engine';

export type Selection = { kind: 'unit'; id: number } | { kind: 'city'; id: number } | null;

interface Props {
  view: PlayerView;
  selection: Selection;
  onSelectUnit: (id: number) => void;
  onProduction: (cityId: number, type: UnitType | null) => void;
  onDisband: (id: number) => void;
}

function UnitDetails({ u, view }: { u: Unit; view: PlayerView }) {
  const st = UNIT_STATS[u.type];
  const cargo = view.myUnits.filter((c) => c.carriedBy === u.id);
  return (
    <div>
      <h3>{st.name} #{u.id}</h3>
      <p>Moves {u.movesLeft}/{st.move} · Hits {st.hits - u.damage}/{st.hits}</p>
      {u.fuel !== null && <p>Fuel {u.fuel}/{st.range}</p>}
      {cargo.length > 0 && <p>Carrying: {cargo.map((c) => UNIT_STATS[c.type].name).join(', ')}</p>}
    </div>
  );
}

function CityDetails({ city, view, onProduction, onSelectUnit }: {
  city: City; view: PlayerView; onProduction: Props['onProduction']; onSelectUnit: Props['onSelectUnit'];
}) {
  const coastal = isCoastal(
    { width: view.width, height: view.height, wrap: view.wrap, terrain: view.terrain.map((t) => t ?? 'land') },
    city.x, city.y,
  );
  const here = view.myUnits.filter((u) => u.x === city.x && u.y === city.y && u.carriedBy === null);
  return (
    <div>
      <h3>City #{city.id}</h3>
      <label>Building{' '}
        <select value={city.production ?? ''} onChange={(e) => {
          const v = (e.target as HTMLSelectElement).value;
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
            <button onClick={() => onSelectUnit(u.id)}>{UNIT_STATS[u.type].name} ({u.movesLeft} moves)</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SidePanel({ view, selection, onSelectUnit, onProduction, onDisband }: Props) {
  if (!selection) return <aside class="panel"><p>Select a unit or city.</p></aside>;
  if (selection.kind === 'unit') {
    const u = view.myUnits.find((x) => x.id === selection.id);
    if (!u) return <aside class="panel"><p>That unit is gone.</p></aside>;
    return (
      <aside class="panel">
        <UnitDetails u={u} view={view} />
        <button onClick={() => onDisband(u.id)}>Disband</button>
      </aside>
    );
  }
  const own = view.myCities.find((c) => c.id === selection.id);
  if (own) {
    return (
      <aside class="panel">
        <CityDetails city={own} view={view} onProduction={onProduction} onSelectUnit={onSelectUnit} />
      </aside>
    );
  }
  const known = view.knownCities.find((c) => c.id === selection.id);
  const owner = known?.owner;
  return (
    <aside class="panel">
      <h3>City #{selection.id}</h3>
      <p>{owner === null || owner === undefined ? 'Neutral (last known)' : `${view.players[owner].name} (last known)`}</p>
    </aside>
  );
}
