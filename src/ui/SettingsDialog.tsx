import { useState } from 'preact/hooks';
import { getSettings, playAll, setSettings } from '../audio/engine';
import { MUSIC } from '../audio/sounds';
import { blur } from './blur';
import {
  COMBAT_MODES, REPLAY_PACES, getCombatMode, getReplayPace, getReportAfter, setCombatMode, setReplayPace, setReportAfter,
  type CombatMode, type ReplayPace,
} from './combatMode';
import { PlacedDialog } from './LeaderLine';

interface Props {
  onClose: () => void;
}

const COMBAT_CHOICES: Record<CombatMode, { label: string; hint: string }> = {
  animated: { label: 'Animated', hint: 'Fights play out on the map, and what the other players did is replayed at the start of your turn.' },
  reports: { label: 'Reports', hint: 'No animation. The Combat report opens by itself at the start of your turn.' },
  off: { label: 'Off', hint: 'No animation and nothing opens by itself. The Reports button still lists the fights.' },
};

const PACE_LABELS: Record<ReplayPace, string> = {
  manual: 'Manual (tap Next)', slow: 'Slow', normal: 'Normal', fast: 'Fast',
};

/** The Settings dialog: sound (on/off, volume, music, a test button) and how fights are shown. */
export function SettingsDialog({ onClose }: Props) {
  const [s, setS] = useState(getSettings());
  const [combat, setCombat] = useState(getCombatMode());
  const [pace, setPace] = useState(getReplayPace());
  const [after, setAfter] = useState(getReportAfter());
  const change = (patch: Partial<typeof s>) => setS(setSettings(patch));
  return (
    <PlacedDialog anchor={null} label="Settings" onKey={(e) => { if (e.key === 'Escape') { onClose(); return true; } return false; }}>
      <h2>Settings</h2>
      <h3>Sound</h3>
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
      <h3>Combat</h3>
      <div class="combat-choice" role="radiogroup" aria-label="Combat">
        {COMBAT_MODES.map((m) => (
          <label key={m} class={combat === m ? 'selected' : ''}>
            <input
              type="radio" name="combat" checked={combat === m}
              onChange={() => setCombat(setCombatMode(m))}
            />
            {' '}<strong>{COMBAT_CHOICES[m].label}</strong>
            <span class="muted"> {COMBAT_CHOICES[m].hint}</span>
          </label>
        ))}
      </div>
      <p class="muted">Animated replay at the start of your turn:</p>
      <div class="pace-choice" role="radiogroup" aria-label="Replay pace">
        {REPLAY_PACES.map((m) => (
          <label key={m} class={pace === m ? 'selected' : ''}>
            <input type="radio" name="pace" checked={pace === m} disabled={combat !== 'animated'} onChange={() => setPace(setReplayPace(m))} />
            {' '}{PACE_LABELS[m]}
          </label>
        ))}
      </div>
      <p>
        <label>
          <input type="checkbox" checked={after} disabled={combat !== 'animated'} onChange={(e) => setAfter(setReportAfter((e.currentTarget as HTMLInputElement).checked))} />
          {' '}Always open the Combat report when the replay ends (it opens anyway if some fights were left out)
        </label>
      </p>
      <div class="picker-actions">
        <button disabled={!s.enabled} onClick={(e) => { blur(e); playAll(['produce-army', 'shot', 'explosion', 'capture']); }}>Test</button>
        <button class="primary" onClick={(e) => { blur(e); onClose(); }}>Close</button>
      </div>
    </PlacedDialog>
  );
}
