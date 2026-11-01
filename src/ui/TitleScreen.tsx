import { DEFAULT_DIFFICULTY, DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from '../ai/difficulty';
import { Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { SettingsDialog } from './SettingsDialog';
import { ManualDialog } from './ManualDialog';
import { GameSession } from '../app/session';
import { CLASSIC_RULES, MAX_PLAYERS, validateMapSize, type HouseRules } from '../engine';
import { DEFAULT_WORLD, SIZE_PRESETS, type CityDensity, type Climate, type Landmass, type SizePreset, type WorldOptions } from '../mapgen';
import { parseSave, serializeSave, type SaveStore, type SaveSummary, type SeatConfig } from '../storage';
import { defaultSeats, loadNewGameSettings, saveNewGameSettings } from './newGameSettings';
import { pickFileText } from './exportFile';
import { VERSION_LABEL } from './version';
import { THEATERS, loadTheater, maxTheaterPlayers, theaterById, theaterWorld, type TheaterData } from '../theaters';
import { MapPreview } from './MapPreview';
import { HOUSE_RULE_OPTIONS } from './houseRules';

interface Props {
  store: SaveStore;
  onStart: (s: GameSession) => void;
}

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
/**
 * Whether the title picture can fill the space beside the menu (cropped) without cutting off its baked-in title: it can once
 * that space is wide enough for its proportions (the title is under half the picture's width). Otherwise the whole picture
 * is fitted in.
 */
function artFills(): boolean {
  const menu = Math.min(420, window.innerWidth * 0.4);
  return (window.innerWidth - menu) / window.innerHeight >= 0.95;
}

export function TitleScreen({ store, onStart }: Props) {
  const [fill, setFill] = useState(artFills);
  useEffect(() => {
    const onResize = () => setFill(artFills());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
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
  const [manualOpen, setManualOpen] = useState(false);
  const [mapKind, setMapKind] = useState<'random' | 'theater'>('random');
  const [theaterId, setTheaterId] = useState(THEATERS[0]?.id ?? '');
  const theater = mapKind === 'theater' ? theaterById(theaterId) : undefined;
  const mostPlayers = theater ? maxTheaterPlayers(theater) : MAX_PLAYERS;
  const TEAM_NUMBERS = [1, 2, 3, 4];
  /** The country each seat chose on a theater map ('' = drawn at random). */
  const [picks, setPicks] = useState<string[]>([]);
  const [theaterData, setTheaterData] = useState<TheaterData | null>(null);
  useEffect(() => {
    if (!theater) return;
    let live = true;
    loadTheater(theater.id).then((d) => { if (live) setTheaterData(d); }).catch(() => { if (live) setTheaterData(null); });
    return () => { live = false; };
  }, [theater?.id]);

  // The picture of a theater on the form. Random maps are never shown ahead of time (they are for discovering), and
  // nobody's start is shown either, except a country a player has chosen.
  const preview = useMemo(() => {
    if (panel !== 'new' || mapKind !== 'theater' || !theaterData || theaterData.id !== theaterId) return null;
    try {
      const map = theaterWorld(theaterData, 2, seed, rules.advancedUnits).map;
      const shown = seats.slice(0, world.players).flatMap((s, i) => {
        const n = theaterData.nations.find((x) => x.name === picks[i]);
        return n ? [{ start: n.start, color: s.color }] : [];
      });
      return { map, starts: shown.map((s) => s.start), colors: shown.map((s) => s.color) };
    } catch {
      return null;
    }
  }, [panel, mapKind, theaterData, theaterId, seed, rules.advancedUnits, picks, seats, world.players]);

  useEffect(() => {
    store.list().then(setSaves).catch(() => setSaves([]));
  }, [store]);

  const setPlayers = (n: number) => {
    setWorld({ ...world, players: n });
    setSeats(defaultSeats(n, seats));
  };
  const updateSeat = (i: number, patch: Partial<SeatConfig>) =>
    setSeats(seats.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const pickNation = (i: number, nation: string) => setPicks((p) => Object.assign([...p], { [i]: nation }));
  const chooseTheater = (id: string) => {
    setTheaterId(id);
    setPicks([]);
    const t = theaterById(id);
    if (t && world.players > maxTheaterPlayers(t)) setPlayers(maxTheaterPlayers(t));
  };

  const start = async () => {
    try {
      // Everyone on one team would leave nobody to fight.
      if (seats.every((s) => s.team !== undefined && s.team === seats[0].team)) return setError('Put at least two sides in the game: players on the same team are allies.');
      if (theater) {
        // A historical theater: the real map, each player a different nation (named for it unless the seat has its own name).
        const data = await loadTheater(theater.id);
        const preset = theaterWorld(data, world.players, seed, rules.advancedUnits, picks);
        const named = seats.map((s, i) => (/^Player \d+$/.test(s.name) ? { ...s, name: preset.nations[i] } : s));
        const session = GameSession.create({ world: { ...world, width: data.width, height: data.height, wrap: data.wrap }, seed, seats: named, rules, preset }, store);
        saveNewGameSettings({ world, seats, rules });
        return onStart(session);
      }
      const sizeError = validateMapSize(world.width, world.height);
      if (sizeError) return setError(sizeError);
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
      <img class={fill ? 'title-art fill' : 'title-art'} src="/title.webp" alt="" width={1376} height={768} />
      <div class="title-menu">
        {panel === 'menu' && (
          <section>
            <div class="title-buttons">
              {autosave && (
                <button class="primary" onClick={() => load('autosave')}>Continue Last Save{autosave.gameName ? ` "${shorten(autosave.gameName, 20)}"` : ''} (turn {autosave.turn})</button>
              )}
              <button onClick={() => setPanel('new')} class={autosave ? '' : 'primary'}>New Game</button>
              <button onClick={() => setPanel('load')}>Load…</button>
              <button onClick={() => setManualOpen(true)}>Manual</button>
              <button onClick={() => setSoundOpen(true)}>Settings</button>
            </div>
          </section>
        )}
        {panel === 'new' && (
      <section>
        <h2>New game</h2>
        <label>Map{' '}
          <select aria-label="Map" value={mapKind} onChange={(e) => {
            const kind = (e.target as HTMLSelectElement).value as 'random' | 'theater';
            setMapKind(kind);
            if (kind === 'theater') chooseTheater(theaterId);
          }}>
            <option value="random">Random map</option>
            <option value="theater">Historical theater</option>
          </select>
        </label>
        {theater && (
          <>
            <label>Theater{' '}
              <select aria-label="Theater" value={theaterId} onChange={(e) => chooseTheater((e.target as HTMLSelectElement).value)}>
                {THEATERS.map((t) => <option value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <div class="theater-info">
              <p class="theater-wars">{theater.wars}</p>
              <p>{theater.notes}</p>
              <p class="muted">{theater.width}×{theater.height} squares, {theater.cities} real cities. Up to {mostPlayers} players, each starting as a different country, chosen for each player below or drawn at random, from {theater.nations.length}: {theater.nations.join(', ')}. The cities of the other countries start neutral, free to be captured.</p>
            </div>
          </>
        )}
        {!theater && <>
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
        <label>Climate{' '}
          <select aria-label="Climate" value={world.climate} onChange={(e) => setWorld({ ...world, climate: (e.target as HTMLSelectElement).value as Climate })}>
            <option value="temperate">Temperate</option>
            <option value="arid">Arid (deserts)</option>
            <option value="wet">Wet (more forest)</option>
          </select>
          {!rules.advancedUnits && world.climate !== 'temperate' && <span class="muted hint"> Shapes the terrain, which needs the Advanced units rule.</span>}
        </label>
        <label>Starting positions{' '}
          <select value={world.starts} onChange={(e) => setWorld({ ...world, starts: (e.target as HTMLSelectElement).value as WorldOptions['starts'] })}>
            <option value="auto">Automatic (apart when possible)</option>
            <option value="separate">Each player on a separate landmass</option>
            <option value="together">All players on the same landmass</option>
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
        </>}
        {preview && <MapPreview map={preview.map} starts={preview.starts} colors={preview.colors} />}
        <label>Players{' '}
          <select value={world.players} onChange={(e) => setPlayers(Number((e.target as HTMLSelectElement).value))}>
            {[2, 3, 4, 5, 6, 7, 8].filter((n) => n <= mostPlayers).map((n) => <option value={n}>{n}</option>)}
          </select>
        </label>
        <table class="seats">
          <tbody>
          {seats.map((s, i) => (
            <Fragment key={i}>
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
            <tr>
              <td />
              <td colSpan={2}>
                <label>Team{' '}
                  <select aria-label={`Team of ${s.name}`} title="Players on the same team are allies" value={s.team ?? ''}
                    onChange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      setSeats(seats.map((x, j) => {
                        if (j !== i) return x;
                        const { team: _old, ...rest } = x;
                        return v === '' ? rest : { ...rest, team: Number(v) };
                      }));
                    }}>
                    <option value="">Alone</option>
                    {TEAM_NUMBERS.map((n) => <option value={n}>Team {n}</option>)}
                  </select>
                </label>
                {theater && (
                  <label>{' '}Country{' '}
                    <select aria-label={`Country of ${s.name}`} value={picks[i] ?? ''} onChange={(e) => pickNation(i, (e.target as HTMLSelectElement).value)}>
                      <option value="">Random</option>
                      {theater.nations.filter((n) => n === picks[i] || !picks.slice(0, world.players).includes(n)).map((n) => <option value={n}>{n}</option>)}
                    </select>
                  </label>
                )}
                {s.kind === 'ai' && (
                  <label>{' '}Difficulty{' '}
                    <select aria-label={`Difficulty of ${s.name}`} value={s.difficulty ?? DEFAULT_DIFFICULTY}
                      onChange={(e) => updateSeat(i, { difficulty: (e.target as HTMLSelectElement).value as Difficulty })}>
                      {DIFFICULTIES.map((d) => <option value={d}>{DIFFICULTY_LABELS[d]}</option>)}
                    </select>
                  </label>
                )}
              </td>
            </tr>
            </Fragment>
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
        {!theater && <>
        <label>City names{' '}
          <select value={world.nameRegion} onChange={(e) => setWorld({ ...world, nameRegion: (e.target as HTMLSelectElement).value as WorldOptions['nameRegion'] })}>
            {REGION_OPTIONS.map((r) => <option value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label>Seed{' '}
          <input type="number" value={seed} onInput={(e) => setSeed(Number((e.target as HTMLInputElement).value) | 0)} />
        </label>
        </>}
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
      {manualOpen && <ManualDialog onClose={() => setManualOpen(false)} />}
    </main>
  );
}

