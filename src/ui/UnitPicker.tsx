import { useState } from 'preact/hooks';
import { UNIT_STATS, type Unit } from '../engine';
import { blur } from './blur';

interface Props {
  title: string;
  units: Unit[];
  /** Free cargo space in slots (Armor takes two); the engine rejects loads over capacity. */
  room?: number;
  onConfirm: (ids: number[]) => void;
  onCancel: () => void;
}

export function UnitPicker({ title, units, room, onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const slots = (u: Unit) => UNIT_STATS[u.type].slots;
  const used = units.filter((u) => checked.has(u.id)).reduce((n, u) => n + slots(u), 0);
  const fits = (u: Unit) => room === undefined || used + slots(u) <= room;
  const full = !units.some((u) => !checked.has(u.id) && fits(u));

  const toggle = (id: number) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else if (fits(units.find((u) => u.id === id)!)) next.add(id);
    setChecked(next);
  };
  // Clears when full, otherwise checks units in list order while they fit.
  const toggleAll = () => {
    if (full) {
      setChecked(new Set());
      return;
    }
    let left = room ?? Infinity;
    const next = new Set<number>();
    for (const u of units) {
      if (slots(u) > left) continue;
      left -= slots(u);
      next.add(u.id);
    }
    setChecked(next);
  };

  return (
    <div class="picker">
      <h3>{title}</h3>
      {units.map((u) => (
        <label class="picker-row" key={u.id}>
          <input
            type="checkbox"
            checked={checked.has(u.id)}
            disabled={!checked.has(u.id) && !fits(u)}
            onChange={(e) => { blur(e); toggle(u.id); }}
          />
          {UNIT_STATS[u.type].name} #{u.id}
        </label>
      ))}
      <span class="muted">{checked.size} selected{room === undefined ? '' : ` (space ${room})`}</span>
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
