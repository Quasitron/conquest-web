import { useMemo, useState } from 'preact/hooks';
import { blur } from './blur';
import { PlacedDialog } from './LeaderLine';
import { buildManual, searchManual } from './manualContent';

interface Props {
  onClose: () => void;
}

/** The Manual: how to play, searchable. Typing in the box narrows the pages to the ones that mention every word. */
export function ManualDialog({ onClose }: Props) {
  const manual = useMemo(buildManual, []);
  const [query, setQuery] = useState('');
  const shown = searchManual(manual, query);
  const jump = (id: string) => document.getElementById(`manual-${id}`)?.scrollIntoView({ block: 'start' });
  return (
    <PlacedDialog anchor={null} wide label="Manual" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <h2>Manual</h2>
      <div class="manual-search">
        <input
          type="search" placeholder="Search the manual" aria-label="Search the manual" value={query} autoFocus
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      </div>
      {query.trim() === '' && (
        <nav class="manual-contents" aria-label="Contents">
          {manual.map((s) => <button key={s.id} onClick={(e) => { blur(e); jump(s.id); }}>{s.title}</button>)}
        </nav>
      )}
      {shown.length === 0 && <p class="muted">Nothing in the manual mentions all of those words.</p>}
      {shown.map((s) => (
        <section key={s.id} id={`manual-${s.id}`} class="manual-section">
          <h3>{s.title}</h3>
          {s.paragraphs.map((p) => <p>{p}</p>)}
          {s.items && (
            <dl>
              {s.items.map((i) => <><dt>{i.term}</dt><dd>{i.text}</dd></>)}
            </dl>
          )}
        </section>
      ))}
      <div class="picker-actions">
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}
