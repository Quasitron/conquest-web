import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlayerView, Unit } from '../engine';
import { ACTION_LABELS } from './ActionBar';
import { availableActions } from './actions';
import type { ActionId } from './keys';

const ORDER_ITEMS: ActionId[] = [
  'moveTo', 'patrol', 'goHome', 'explore', 'sentry', 'load', 'unload', 'clearOrders', 'skip', 'hold', 'disband',
];

// After a pointer click, release focus so keys keep going to the map.
const blur = (e: Event) => (e.currentTarget as HTMLElement).blur();

interface Props {
  view: PlayerView;
  unit: Unit | null;
  /** Viewport (client) coordinates for the context menu; null for the top-bar drop-down. */
  at: { x: number; y: number } | null;
  onAction: (id: ActionId) => void;
  onClose: () => void;
}

/** Top-bar drop-down when `at` is null, otherwise a context menu placed at `at`. */
export function OrdersMenu({ view, unit, at, onAction, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const avail = unit ? availableActions(view, unit) : null;
  const shown = at !== null || open;

  const close = () => {
    setOpen(false);
    onClose();
  };
  // While shown, Esc and a press outside the menu close it. Esc is taken in the capture phase
  // so the game's own Esc handling (deselect) does not also run.
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [shown, onClose]);

  const choose = (id: ActionId) => {
    setOpen(false);
    onAction(id);
    onClose();
  };
  const items = ORDER_ITEMS.map((id) => (
    <button key={id} disabled={!avail || !avail[id]} onClick={(e) => { blur(e); choose(id); }}>
      {ACTION_LABELS[id].label} ({ACTION_LABELS[id].key})
    </button>
  ));

  if (at) {
    return (
      <div ref={root} class="orders-menu context" style={{ left: `${at.x}px`, top: `${at.y}px` }}>
        {items}
        <button onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    );
  }
  return (
    <div class="orders-wrap" ref={root}>
      <button onClick={(e) => { blur(e); setOpen(!open); }}>Orders ▾</button>
      {open && <div class="orders-menu">{items}</div>}
    </div>
  );
}
