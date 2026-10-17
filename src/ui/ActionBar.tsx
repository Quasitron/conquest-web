import type { PlayerView, Unit } from '../engine';
import { visibleButtons } from './actions';
import type { ActionId } from './keys';
import { blur } from './blur';

export const ACTION_LABELS: Record<ActionId, { label: string; key: string }> = {
  next: { label: 'Next', key: 'N' },
  skip: { label: 'Skip', key: 'Space' },
  hold: { label: 'Hold', key: 'Tab' },
  sentry: { label: 'Sentry', key: 'S' },
  moveTo: { label: 'Move To', key: 'T' },
  patrol: { label: 'Patrol', key: 'P' },
  goHome: { label: 'Go Home', key: 'H' },
  explore: { label: 'Explore', key: 'X' },
  load: { label: 'Load', key: 'L' },
  unload: { label: 'Unload', key: 'U' },
  clearOrders: { label: 'Clear Orders', key: 'Ins' },
  disband: { label: 'Disband', key: 'Del' },
  center: { label: 'Center', key: 'C' },
  endTurn: { label: 'End Turn', key: 'Enter' },
  info: { label: 'Info', key: 'I' },
  fit: { label: 'Fit', key: 'Z' },
};

export function ActionBar({ view, unit, onAction }: {
  view: PlayerView; unit: Unit; onAction: (id: ActionId) => void;
}) {
  return (
    <div class="actions">
      {visibleButtons(view, unit).map((id) => (
        <button key={id} onClick={(e) => { blur(e); onAction(id); }}>
          {ACTION_LABELS[id].label} ({ACTION_LABELS[id].key})
        </button>
      ))}
    </div>
  );
}
