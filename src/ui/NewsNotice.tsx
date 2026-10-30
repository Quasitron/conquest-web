import { blur } from './blur';
import { PlacedDialog } from './LeaderLine';
import type { NewsItem } from './spyNews';

/** A newspaper front page for one piece of news (see spyHeadlines), with the same spinning-in as the elimination notice. */
export function NewsNotice({ item, turn, more, onOk }: { item: NewsItem; turn: number; more: number; onOk: () => void }) {
  // Size the headline to the width of its band: long headlines get smaller type.
  const headlineSize = Math.min(9.5, 88 / (item.headline.length * 0.74));
  return (
    <PlacedDialog
      anchor={null} label="News" paper paperClass="dialog-paper-spy"
      onKey={(e) => {
        if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return false;
        onOk();
        return true;
      }}
    >
      <div class="paper-masthead">THE WAR DISPATCH</div>
      <div class="paper-dateline">SPECIAL EDITION · TURN {turn}</div>
      <h2 class="paper-headline" style={{ fontSize: `${headlineSize}cqw` }}>{item.headline}</h2>
      <div class="paper-subhead">{item.subhead}</div>
      <div class="paper-box">
        <p class="paper-text">{item.text}</p>
        {more > 0 && <p class="paper-text">{more} more {more === 1 ? 'story' : 'stories'} to follow.</p>}
        <button class="primary" onClick={(e) => { blur(e); onOk(); }}>OK</button>
      </div>
    </PlacedDialog>
  );
}
