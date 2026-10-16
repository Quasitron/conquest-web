import { useState } from 'preact/hooks';
import { UNIT_STATS, type Unit } from '../engine';
import { blur } from './blur';

interface Props {
  title: string;
  units: Unit[];
  /** Most units that may be checked; the engine rejects loads over capacity. */
  max?: number;
  onConfirm: (ids: number[]) => void;
  onCancel: () => void;
}

export function UnitPicker({ title, units, max, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const cap = Math.min(units.length, max ?? units.length);
  const full = checked.size >= cap;

  const toggle = (id: number) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else if (next.size < cap) next.add(id);
    setChecked(next);
  };
  // Clears when full, otherwise checks units in list order up to the cap.
  const toggleAll = () => {
    setChecked(full ? new Set() : new Set(units.slice(0, cap).map((u) => u.id)));
  };

  return (
    <div class="picker">
      <h3>{title}</h3>
      {units.map((u) => (
        <label class="picker-row" key={u.id}>
          <input
            type="checkbox"
            checked={checked.has(u.id)}
            disabled={!checked.has(u.id) && full}
            onChange={(e) => { blur(e); toggle(u.id); }}
          />
          {UNIT_STATS[u.type].name} #{u.id}
        </label>
      ))}
      <span class="muted">{checked.size} selected{max === undefined ? '' : ` (max ${max})`}</span>
      <div class="picker-actions">
        <button onClick={(e) => { blur(e); toggleAll(); }}>All</button>
        <button class="primary" onClick={(e) => {
          blur(e);
          onConfirm(Array.from(checked).sort((a, b) => a - b));
        }}>OK</button>
        <button onClick={(e) => { blur(e); onCancel(); }}>Cancel</button>
      </div>
    </div>
  );
}
