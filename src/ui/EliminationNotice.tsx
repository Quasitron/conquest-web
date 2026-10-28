import type { PlayerView } from '../engine';
import { blur } from './blur';
import { colorName } from './colors';
import { PlacedDialog } from './LeaderLine';

/** A short notice at the start of a turn: these players have been knocked out, and how many opponents are left. */
export function EliminationNotice({ view, colors, ids, onOk }: { view: PlayerView; colors: string[]; ids: number[]; onOk: () => void }) {
  const name = (id: number) => view.players.find((p) => p.id === id)?.name ?? `Player ${id + 1}`;
  const left = view.players.filter((p) => p.id !== view.me && !p.eliminated).length;
  return (
    <PlacedDialog
      anchor={null} label="Player eliminated"
      onKey={(e) => {
        if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return false;
        onOk();
        return true;
      }}
    >
      <h2>{ids.length === 1 ? 'Player eliminated' : 'Players eliminated'}</h2>
      {ids.map((id) => {
        const color = colors[id];
        const named = color ? colorName(color) : null;
        return (
          <p key={id} class="report-text">
            {color && <span class="swatch" style={{ background: color }} />} <strong>{name(id)}</strong>{named && ` (${named})`} has been eliminated.
          </p>
        );
      })}
      <p class="muted">{left === 0 ? 'No opponents are left.' : left === 1 ? '1 opponent is still in the game.' : `${left} opponents are still in the game.`}</p>
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onOk(); }}>OK</button>
      </div>
    </PlacedDialog>
  );
}