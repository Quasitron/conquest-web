import { useState } from 'preact/hooks';
import { getSettings, playAll, setSettings } from '../audio/engine';
import { MUSIC } from '../audio/sounds';
import { blur } from './blur';
import { PlacedDialog } from './LeaderLine';

interface Props {
  onClose: () => void;
}

/** The Sound dialog: on/off, volume and a test button. A broader Settings dialog can grow from here. */
export function SoundDialog({ onClose }: Props) {
  const [s, setS] = useState(getSettings());
  const change = (patch: Partial<typeof s>) => setS(setSettings(patch));
  return (
    <PlacedDialog anchor={null} label="Sound" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <h2>Sound</h2>
      <p>
        <label>
          <input type="checkbox" checked={s.enabled} onChange={(e) => change({ enabled: (e.currentTarget as HTMLInputElement).checked })} />
          {' '}Sound effects on
        </label>
      </p>
      <p>
        <label>
          Volume{' '}
          <input
            type="range" min="0" max="100" step="5" value={Math.round(s.volume * 100)} disabled={!s.enabled}
            onInput={(e) => change({ volume: Number((e.currentTarget as HTMLInputElement).value) / 100 })}
          />
        </label>
      </p>
      <p>
        <label>
          <input type="checkbox" checked={s.music} disabled={!s.enabled} onChange={(e) => change({ music: (e.currentTarget as HTMLInputElement).checked })} />
          {' '}Music on{!MUSIC.title && <span class="muted"> (no theme file set yet)</span>}
        </label>
      </p>
      <p>
        <label>
          Music volume{' '}
          <input
            type="range" min="0" max="100" step="5" value={Math.round(s.musicVolume * 100)} disabled={!s.enabled || !s.music}
            onInput={(e) => change({ musicVolume: Number((e.currentTarget as HTMLInputElement).value) / 100 })}
          />
        </label>
      </p>
      <div class="picker-actions">
        <button disabled={!s.enabled} onClick={(e) => { blur(e); playAll(['produce-army', 'shot', 'explosion', 'capture']); }}>Test</button>
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}


