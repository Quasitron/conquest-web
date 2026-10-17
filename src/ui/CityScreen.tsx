import { useState } from 'preact/hooks';
import {
  UNIT_STATS, UNIT_TYPES, buildTime, pathMapFromView, routeUnitTypes, unitDisplayName,
  type City, type CityRoute, type PlayerView, type UnitType,
} from '../engine';
import { UNIT_GLYPH } from './colors';
import { cityIsCoastal, inProductionCount, statsText, turnsToComplete } from './labels';
import { PlacedDialog } from './LeaderLine';
import type { Pt } from './placement';
import { blur } from './blur';

interface Props {
  view: PlayerView;
  city: City;
  anchor: Pt | null;
  /** The latest command error, if any (the top bar is hidden behind the dialog). */
  error?: string | null;
  onPick: (t: UnitType | null) => void;
  onRename: (name: string) => void;
  /** Sets (or with null, clears) the city's route. Returns true when it was accepted. */
  onSetRoute?: (route: Omit<CityRoute, 'by'> | null) => boolean;
  /** Mouse-only: selects a unit listed in the City view; the screen then closes. */
  onSelectUnit?: (id: number) => void;
  onClose: () => void;
}

const ROWS: (UnitType | null)[] = [null, ...UNIT_TYPES];

function routeSummary(view: PlayerView, route: CityRoute): string {
  const dest = view.myCities.find((c) => c.id === route.destId);
  const types = route.types.map((t) => UNIT_STATS[t].name).join(', ');
  return `${types} → ${dest ? dest.name : 'a lost city'}`;
}

export function CityScreen({ view, city, anchor, error, onPick, onRename, onSetRoute, onSelectUnit, onClose }: Props) {
  const coastal = cityIsCoastal(view, city);
  const usable = (t: UnitType | null) => t === null || coastal || UNIT_STATS[t].domain !== 'sea';
  // The highlight is a pending choice: OK and Enter apply it, Esc drops it.
  const [cursor, setCursor] = useState<UnitType | null>(city.production);
  const [hover, setHover] = useState<UnitType | null>(null);
  const [mode, setMode] = useState<'list' | 'city' | 'route'>('list');
  const [name, setName] = useState(city.name);

  // Route form: unit types the route cannot serve are greyed out, per the chosen destination.
  const others = view.myCities.filter((c) => c.id !== city.id);
  const [destId, setDestId] = useState<number | null>(city.route?.destId ?? others[0]?.id ?? null);
  const [routeTypes, setRouteTypes] = useState<UnitType[]>(city.route?.types ?? []);
  const [blockWait, setBlockWait] = useState(city.route?.blockWait ?? 3);
  const [arrival, setArrival] = useState<'wait' | 'sentry'>(city.route?.arrival ?? 'wait');
  const dest = others.find((c) => c.id === destId) ?? null;
  const canGo = dest ? routeUnitTypes(pathMapFromView(view), city, dest) : null;
  const chosen = canGo ? routeTypes.filter((t) => canGo[t]) : [];
  const toggleType = (t: UnitType) =>
    setRouteTypes(routeTypes.includes(t) ? routeTypes.filter((x) => x !== t) : [...routeTypes, t]);
  const saveRoute = () => {
    if (destId === null || chosen.length === 0) return;
    if (onSetRoute?.({ destId, types: chosen, blockWait, arrival })) setMode('city');
  };

  const commit = () => {
    if (cursor !== city.production) onPick(cursor);
    onClose();
  };
  const move = (delta: 1 | -1) => {
    let i = ROWS.indexOf(cursor);
    for (;;) {
      i += delta;
      if (i < 0 || i >= ROWS.length) return;
      if (usable(ROWS[i])) return setCursor(ROWS[i]);
    }
  };
  const onKey = (e: KeyboardEvent): boolean => {
    if (e.key === 'Escape') {
      onClose();
      return true;
    }
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (mode !== 'list' || tag === 'INPUT') return false;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      move(e.key === 'ArrowUp' ? -1 : 1);
      return true;
    }
    if (e.key === 'Enter' && tag !== 'BUTTON') {
      commit();
      return true;
    }
    return false;
  };

  const shown = hover ?? cursor;
  const here = view.myUnits.filter((u) => u.x === city.x && u.y === city.y && u.carriedBy === null);
  const progress = city.production
    ? { type: city.production, done: city.progress, total: buildTime(city, city.production) }
    : null;
  const bar = progress && (
    <div class="progress" title={`${progress.done}/${progress.total}`}>
      <div class="progress-bar"><div class="progress-fill" style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }} /></div>
      <span>{UNIT_STATS[progress.type].name}: {progress.done}/{progress.total}</span>
    </div>
  );

  return (
    <PlacedDialog anchor={anchor} label={`City ${city.name}`} onKey={onKey}>
      {mode === 'list' ? (
        <>
          <h2>{city.name} <span class="muted">Production</span></h2>
          <ul class="prod-list" role="listbox" aria-label="Production">
            <li class="prod-head" aria-hidden="true"><span /><span /><span class="num">Turns</span><span class="num">In production</span></li>
            {ROWS.map((t) => {
              const ok = usable(t);
              return (
                <li
                  key={t ?? 'none'} role="option" aria-selected={cursor === t} aria-disabled={!ok}
                  class={`prod-row${cursor === t ? ' selected' : ''}${ok ? '' : ' disabled'}${city.production === t ? ' current' : ''}`}
                  title={ok ? (t ? statsText(t) : undefined) : 'Needs a coastal city'}
                  onClick={() => { if (ok) setCursor(t); }}
                  onDblClick={() => { if (ok) { if (t !== city.production) onPick(t); onClose(); } }}
                  onMouseEnter={() => setHover(ok ? t : null)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span class="glyph">{t ? UNIT_GLYPH[t] : '-'}</span>
                  <span>{t ? UNIT_STATS[t].name : 'No Production'}</span>
                  <span class="num">{t ? turnsToComplete(city, t) : ''}</span>
                  <span class="num">{t ? inProductionCount(view.myCities, t) : ''}</span>
                </li>
              );
            })}
          </ul>
          <p class="muted stats-line">{shown ? `${UNIT_STATS[shown].name}: ${statsText(shown)}` : 'Nothing will be built.'}</p>
          {bar}
        </>
      ) : mode === 'city' ? (
        <>
          <h2>{city.name}</h2>
          <form class="rename" onSubmit={(e) => { e.preventDefault(); onRename(name); }}>
            <input value={name} maxLength={24} aria-label="City name" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <button type="submit" onClick={blur}>Rename</button>
          </form>
          <h3>Units inside</h3>
          {here.length === 0
            ? <p class="muted">None.</p>
            : <ul class="plain-list">{here.map((u) => <li key={u.id}>
                {onSelectUnit
                  ? <button class="linklike" onClick={(e) => { blur(e); onSelectUnit(u.id); onClose(); }}>{unitDisplayName(u)}</button>
                  : unitDisplayName(u)}
              </li>)}</ul>}
          {bar ?? <p class="muted">Not building anything.</p>}
          {city.route && <p class="muted">Route: {routeSummary(view, city.route)}</p>}
        </>
      ) : (
        <>
          <h2>{city.name} <span class="muted">Route</span></h2>
          <p class="muted">New units built here that match the types below head for the destination.</p>
          <label>Destination{' '}
            <select value={destId ?? ''} onChange={(e) => setDestId(Number((e.target as HTMLSelectElement).value))}>
              {others.map((c) => <option value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <fieldset class="route-types">
            <legend>Unit types</legend>
            {UNIT_TYPES.map((t) => {
              const ok = canGo ? canGo[t] : false;
              return (
                <label class={ok ? '' : 'disabled'} title={ok ? undefined : 'Cannot make this trip'}>
                  <input type="checkbox" disabled={!ok} checked={ok && routeTypes.includes(t)} onChange={() => toggleType(t)} />
                  {' '}{UNIT_STATS[t].name}
                </label>
              );
            })}
          </fieldset>
          <label>If blocked, wait{' '}
            <select value={blockWait} onChange={(e) => setBlockWait(Number((e.target as HTMLSelectElement).value))}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option value={n}>{n} {n === 1 ? 'turn' : 'turns'}</option>)}
            </select>
          </label>
          <label>On arrival{' '}
            <select value={arrival} onChange={(e) => setArrival((e.target as HTMLSelectElement).value as 'wait' | 'sentry')}>
              <option value="wait">Wait for orders</option>
              <option value="sentry">Sentry</option>
            </select>
          </label>
          {others.length === 0 && <p class="muted">You need another city to route to.</p>}
        </>
      )}
      {error && <p class="error" role="alert">{error}</p>}
      <div class="picker-actions">
        {mode === 'list' && <button onClick={(e) => { blur(e); setMode('city'); }}>City</button>}
        {mode === 'city' && onSetRoute && <button onClick={(e) => { blur(e); setMode('route'); }}>Route…</button>}
        {mode !== 'list' && <button onClick={(e) => { blur(e); setMode(mode === 'route' ? 'city' : 'list'); }}>Back</button>}
        {mode === 'route'
          ? (
            <>
              {city.route && <button onClick={(e) => { blur(e); if (onSetRoute?.(null)) setMode('city'); }}>Clear Route</button>}
              <button class="primary" disabled={chosen.length === 0} onClick={(e) => { blur(e); saveRoute(); }}>Set Route</button>
            </>
          )
          : <button class="primary" onClick={(e) => { blur(e); commit(); }}>OK</button>}
      </div>
    </PlacedDialog>
  );
}
