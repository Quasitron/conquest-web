import { useState } from 'preact/hooks';
import { UNIT_STATS, isCrippled, unitDisplayName, type PlayerView, type Unit } from '../engine';
import { describeOrders } from './actions';
import { UNIT_GLYPH } from './colors';
import { cargoSummary, healthText } from './labels';

// After a pointer click, release focus so keys keep going to the map.
const blur = (e: Event) => (e.currentTarget as HTMLElement).blur();

export function HealthBar({ u }: { u: Unit }) {
  const st = UNIT_STATS[u.type];
  const pct = ((st.hits - u.damage) / st.hits) * 100;
  return (
    <div class="health" title={healthText(u)}>
      <div class="health-bar"><div class={`health-fill${isCrippled(u) ? ' crippled' : ''}`} style={{ width: `${pct}%` }} /></div>
      <span>{healthText(u)}</span>
      {isCrippled(u) && <span class="crippled-tag">Crippled</span>}
    </div>
  );
}

function whereText(view: PlayerView, u: Unit): string {
  const t = view.terrain[u.y * view.width + u.x];
  let kind = 'Land';
  if (t === 'water') kind = 'Ocean';
  else if (t === 'city') {
    const c = view.knownCities.find((x) => x.x === u.x && x.y === u.y);
    kind = `City: ${c?.name ?? 'unknown'}`;
  }
  return `${u.x},${u.y} (${kind})`;
}

interface Props {
  view: PlayerView;
  unit: Unit;
  onRename: (name: string) => void;
  /** Opens the Orders menu at the given viewport point. */
  onOrders: (at: { x: number; y: number }) => void;
  onClose: () => void;
}

export function UnitInfo({ view, unit, onRename, onOrders, onClose }: Props) {
  const st = UNIT_STATS[unit.type];
  const [name, setName] = useState(unit.name ?? '');
  const cargo = view.myUnits.filter((c) => c.carriedBy === unit.id);
  return (
    <div
      class="card unit-info" role="dialog" aria-label="Unit information"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <h2><span class="glyph">{UNIT_GLYPH[unit.type]}</span> {unitDisplayName(unit)}</h2>
      <form class="rename" onSubmit={(e) => { e.preventDefault(); onRename(name); }}>
        <input
          value={name} maxLength={24} placeholder={st.name} aria-label="Unit name"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <button type="submit" onClick={blur}>Rename</button>
      </form>
      <p>{whereText(view, unit)}</p>
      <p>Orders: {describeOrders(unit.orders)}</p>
      <HealthBar u={unit} />
      <p class="muted">
        {st.name}: move {st.move}, attack {st.attack}, defense {st.defense}, hits {st.hits}
        {st.range !== null ? `, range ${st.range}` : ''}
      </p>
      {cargo.length > 0 && <p>Carrying: {cargoSummary(cargo)}</p>}
      <div class="picker-actions">
        <button onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          blur(e);
          onOrders({ x: r.left, y: r.bottom });
        }}>Orders</button>
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>OK</button>
      </div>
    </div>
  );
}