import type { PlayerView } from '../engine';
import { blur } from './blur';
import { colorName } from './colors';
import { PlacedDialog } from './LeaderLine';

const NUMBER_WORDS = ['NO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];

/** The front-page headline: "BLUE EMPIRE FALLS!", or "TWO EMPIRES FALL!" when several go down at once. */
export function eliminationHeadline(colorNames: (string | null)[], count: number): string {
  if (count === 1) return `${colorNames[0] ? `${colorNames[0].toUpperCase()} ` : ''}EMPIRE FALLS!`;
  return `${NUMBER_WORDS[count] ?? count} EMPIRES FALL!`;
}

/** A newspaper front page at the start of a turn: these players have been knocked out, and how many opponents are left. */
export function EliminationNotice({ view, colors, ids, onOk }: { view: PlayerView; colors: string[]; ids: number[]; onOk: () => void }) {
  const name = (id: number) => view.players.find((p) => p.id === id)?.name ?? `Player ${id + 1}`;
  const left = view.players.filter((p) => p.id !== view.me && !p.eliminated).length;
  const headline = eliminationHeadline(ids.map((id) => (colors[id] ? colorName(colors[id]) : null)), ids.length);
  // Size the headline to the width of its band: long colour names get smaller type.
  const headlineSize = Math.min(9.5, 88 / (headline.length * 0.74));
  return (
    <PlacedDialog
      anchor={null} label="Player eliminated" paper
      onKey={(e) => {
        if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return false;
        onOk();
        return true;
      }}
    >
      <div class="paper-masthead">THE WAR DISPATCH</div>
      <div class="paper-dateline">EXTRA EDITION · TURN {view.turn}</div>
      <h2 class="paper-headline" style={{ fontSize: `${headlineSize}cqw` }}>{headline}</h2>
      <div class="paper-subhead">{ids.length === 1 ? 'A commander is out of the war' : 'Commanders are out of the war'}</div>
      <div class="paper-box">
        {ids.map((id) => {
          const color = colors[id];
          const named = color ? colorName(color) : null;
          return (
            <p key={id} class="paper-text">
              {color && <span class="swatch" style={{ background: color }} />} <strong>{name(id)}</strong>{named && ` (${named})`} has been eliminated.
            </p>
          );
        })}
        <p class="paper-text">{left === 0 ? 'No opponents are left.' : left === 1 ? '1 opponent is still in the game.' : `${left} opponents are still in the game.`}</p>
        <button class="primary" onClick={(e) => { blur(e); onOk(); }}>OK</button>
      </div>
    </PlacedDialog>
  );
}
