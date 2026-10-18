import { useEffect, useState } from 'preact/hooks';
import { SettingsDialog } from './SettingsDialog';
import { GameSession } from '../app/session';
import { CLASSIC_RULES, validateMapSize, type HouseRules } from '../engine';
import { DEFAULT_WORLD, SIZE_PRESETS, type CityDensity, type Landmass, type SizePreset, type WorldOptions } from '../mapgen';
import { parseSave, serializeSave, type SaveStore, type SaveSummary, type SeatConfig } from '../storage';
import { defaultSeats, loadNewGameSettings, saveNewGameSettings } from './newGameSettings';
import { pickFileText } from './exportFile';
import { VERSION_LABEL } from './version';

interface Props {
  store: SaveStore;
  onStart: (s: GameSession) => void;
}

const HOUSE_RULE_OPTIONS: { key: keyof HouseRules; label: string; hint: string }[] = [
  {
    key: 'easierNeutralCities',
    label: 'Easier neutral cities',
    hint: 'Neutral cities defend at half strength (about 2 in 3 attacks succeed).',
  },
  {
    key: 'fairFirstTurn',
    label: 'Fair first turn',
    hint: 'No city builds on turn 1, so the first player gets no head start.',
  },
  {
    key: 'sentriedStayAsGarrison',
    label: 'Sentried armies stay as garrison',
    hint: "Transports leaving a city don't pick up armies on Sentry.",
  },
];

const REGION_OPTIONS: { value: WorldOptions['nameRegion']; label: string }[] = [
  { value: 'world', label: 'World' },
  { value: 'europe', label: 'Europe' },
  { value: 'northAmerica', label: 'North America' },
  { value: 'latinAmerica', label: 'Latin America' },
  { value: 'asia', label: 'Asia' },
  { value: 'africaMiddleEast', label: 'Africa & Middle East' },
  { value: 'oceania', label: 'Oceania' },
];

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);
export function TitleScreen({ store, onStart }: Props) {
  // The form starts from the last settings used (the seed is always fresh).
  const [remembered] = useState(() => loadNewGameSettings({ world: { ...DEFAULT_WORLD }, seats: defaultSeats(2, []), rules: { ...CLASSIC_RULES } }));
  const [world, setWorld] = useState<WorldOptions>(remembered.world);
  const [seats, setSeats] = useState<SeatConfig[]>(remembered.seats);
  const [seed, setSeed] = useState(randomSeed());
  const [rules, setRules] = useState<HouseRules>(remembered.rules);
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'menu' | 'new' | 'load'>('menu');
  const [soundOpen, setSoundOpen] = useState(false);

  useEffect(() => {
    store.list().then(setSaves).catch(() => setSaves([]));
  }, [store]);

  const setPlayers = (n: number) => {
    setWorld({ ...world, players: n });
    setSeats(defaultSeats(n, seats));
  };
  const updateSeat = (i: number, patch: Partial<SeatConfig>) =>
    setSeats(seats.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const start = () => {
    const sizeError = validateMapSize(world.width, world.height);
    if (sizeError) return setError(sizeError);
    try {
      const session = GameSession.create({ world, seed, seats, rules }, store);
      saveNewGameSettings({ world, seats, rules });
      onStart(session);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const load = async (name: string) => {
    try {
      const save = await store.get(name);
      if (!save) return setError(`No save named "${name}".`);
      // Re-validate the stored record as if it were an imported file.
      const r = parseSave(serializeSave(save));
      if (!r.ok) return setError(r.error);
      onStart(GameSession.fromSave(r.save, store, r.note));
    } catch (e) {
      setError(`Could not load "${name}": ${(e as Error).message}`);
    }
  };
  const remove = async (name: string) => {
    if (!window.confirm(`Delete the saved game "${name}"? This cannot be undone.`)) return;
    try {
      await store.delete(name);
      setSaves(await store.list());
    } catch (e) {
      setError(`Could not delete "${name}": ${(e as Error).message}`);
    }
  };
  const importFile = async () => {
    try {
      const text = await pickFileText();
      if (text === null) return;
      const r = parseSave(text);
      if (!r.ok) return setError(r.error);
      onStart(GameSession.fromSave(r.save, store, r.note));
    } catch (e) {
      setError(`Could not import save: ${(e as Error).message}`);
    }
  };

  /** Keeps a long game name from stretching the button. */
  const shorten = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

  const autosave = saves.find((s) => s.name === 'autosave');
  const named = saves.filter((s) => s.name !== 'autosave');

  return (
    <main class="title">
      <h1 class="sr-only">Theater of Conquest: Global Command</h1>
      <img class="title-art" src="/title.webp" alt="" width={1376} height={768} />
      <div class="title-menu">
        {panel === 'menu' && (
          <section>
            <div class="title-buttons">
              {autosave && (
                <button class="primary" onClick={() => load('autosave')}>Continue Last Save{autosave.gameName ? ` "${shorten(autosave.gameName, 20)}"` : ''} (turn {autosave.turn})</button>
              )}
              <button onClick={() => setPanel('new')} class={autosave ? '' : 'primary'}>New Game</button>
              <button onClick={() => setPanel('load')}>Load…</button>
              <button onClick={() => setSoundOpen(true)}>Settings</button>
            </div>
          </section>
        )}
        {panel === 'new' && (
      <section>
        <h2>New game</h2>
        <label>Map size{' '}
          <select onChange={(e) => {
            const preset = (e.target as HTMLSelectElement).value as SizePreset;
            setWorld({ ...world, ...SIZE_PRESETS[preset] });
          }} value={(Object.keys(SIZE_PRESETS) as SizePreset[]).find((k) => SIZE_PRESETS[k].width === world.width && SIZE_PRESETS[k].height === world.height) ?? 'medium'}>
            <option value="small">Small (40×30)</option>
            <option value="medium">Medium (60×45)</option>
            <option value="large">Large (100×70)</option>
            <option value="huge">Huge (150×100)</option>
          </select>
        </label>
        <label>Water {world.waterPercent}%{' '}
          <input type="range" min={60} max={85} value={world.waterPercent}
            onInput={(e) => setWorld({ ...world, waterPercent: Number((e.target as HTMLInputElement).value) })} />
        </label>
        <label>Landmass{' '}
          <select value={world.landmass} onChange={(e) => setWorld({ ...world, landmass: (e.target as HTMLSelectElement).value as Landmass })}>
            <option value="islands">Many islands</option>
            <option value="mixed">Mixed</option>
            <option value="continents">Few continents</option>
          </select>
        </label>
        <label>Cities{' '}
          <select value={world.cityDensity} onChange={(e) => setWorld({ ...world, cityDensity: (e.target as HTMLSelectElement).value as CityDensity })}>
            <option value="low">Few</option>
            <option value="normal">Normal</option>
            <option value="high">Many</option>
          </select>
        </label>
        <label><input type="checkbox" checked={world.wrap}
          onChange={(e) => setWorld({ ...world, wrap: (e.target as HTMLInputElement).checked })} /> Wrap east–west</label>
        <label>Players{' '}
          <select value={world.players} onChange={(e) => setPlayers(Number((e.target as HTMLSelectElement).value))}>
            {[2, 3, 4, 5, 6].map((n) => <option value={n}>{n}</option>)}
          </select>
        </label>
        <table class="seats">
          <tbody>
          {seats.map((s, i) => (
            <tr>
              <td><span class="swatch" style={{ background: s.color }} /></td>
              <td><input value={s.name} onInput={(e) => updateSeat(i, { name: (e.target as HTMLInputElement).value })} /></td>
              <td>
                <select value={s.kind} onChange={(e) => updateSeat(i, { kind: (e.target as HTMLSelectElement).value as SeatConfig['kind'] })}>
                  <option value="human">Human</option>
                  <option value="ai">Computer</option>
                  <option value="idle">Idle</option>
                </select>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
        <fieldset class="house-rules">
          <legend>House rules</legend>
          {HOUSE_RULE_OPTIONS.map((o) => (
            <label class="house-rule">
              <input type="checkbox" checked={rules[o.key]}
                onChange={(e) => setRules({ ...rules, [o.key]: (e.target as HTMLInputElement).checked })} />
              <span>
                {o.label}
                <span class="muted hint">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label>City names{' '}
          <select value={world.nameRegion} onChange={(e) => setWorld({ ...world, nameRegion: (e.target as HTMLSelectElement).value as WorldOptions['nameRegion'] })}>
            {REGION_OPTIONS.map((r) => <option value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label>Seed{' '}
          <input type="number" value={seed} onInput={(e) => setSeed(Number((e.target as HTMLInputElement).value) | 0)} />
        </label>
        <div class="row">
          <button class="primary" onClick={start}>Start</button>
          <button onClick={() => setPanel('menu')}>Back</button>
        </div>
      </section>
        )}
        {panel === 'load' && (
          <section>
            <h2>Saved games</h2>
            {named.length === 0 && <p>No saved games yet.</p>}
            <ul class="save-list">
              {named.map((s) => (
                <li>
                  <button onClick={() => load(s.name)}>{s.name}</button>
                  <span class="muted">turn {s.turn} · {new Date(s.savedAt).toLocaleString()}</span>
                  <button class="delete" onClick={() => remove(s.name)} aria-label={`Delete ${s.name}`}>Delete</button>
                </li>
              ))}
            </ul>
            <button onClick={importFile}>Import save file…</button>
            <button onClick={() => setPanel('menu')}>Back</button>
          </section>
        )}
        {error && <p class="error" role="alert">{error}</p>}
      </div>
      <p class="title-version">{VERSION_LABEL} · Anonymous visit counts, no cookies</p>
      {soundOpen && <SettingsDialog onClose={() => setSoundOpen(false)} />}
    </main>
  );
}

