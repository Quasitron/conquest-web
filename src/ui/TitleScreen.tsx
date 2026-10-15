import { useEffect, useState } from 'preact/hooks';
import { GameSession } from '../app/session';
import { validateMapSize } from '../engine';
import { DEFAULT_WORLD, SIZE_PRESETS, type CityDensity, type Landmass, type SizePreset, type WorldOptions } from '../mapgen';
import { parseSave, type SaveStore, type SaveSummary, type SeatConfig } from '../storage';
import { PLAYER_COLORS } from './colors';
import { pickFileText } from './exportFile';

interface Props {
  store: SaveStore;
  onStart: (s: GameSession) => void;
}

const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);
const defaultSeats = (n: number, prev: SeatConfig[]): SeatConfig[] =>
  Array.from({ length: n }, (_, i) =>
    prev[i] ?? { name: i === 0 ? 'Player 1' : `Player ${i + 1}`, kind: i === 0 ? 'human' : 'idle', color: PLAYER_COLORS[i] },
  );

export function TitleScreen({ store, onStart }: Props) {
  const [world, setWorld] = useState<WorldOptions>({ ...DEFAULT_WORLD });
  const [seats, setSeats] = useState<SeatConfig[]>(defaultSeats(2, []));
  const [seed, setSeed] = useState(randomSeed());
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      onStart(GameSession.create({ world, seed, seats }, store));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const load = async (name: string) => {
    const save = await store.get(name);
    if (save) onStart(GameSession.fromSave(save, store));
  };
  const importFile = async () => {
    const text = await pickFileText();
    if (text === null) return;
    const r = parseSave(text);
    if (!r.ok) return setError(r.error);
    onStart(GameSession.fromSave(r.save, store));
  };

  const autosave = saves.find((s) => s.name === 'autosave');
  const named = saves.filter((s) => s.name !== 'autosave');

  return (
    <main class="title">
      <h1>Conquest Web</h1>
      {autosave && (
        <button class="primary" onClick={() => load('autosave')}>Continue (turn {autosave.turn})</button>
      )}
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
          {seats.map((s, i) => (
            <tr>
              <td><span class="swatch" style={{ background: s.color }} /></td>
              <td><input value={s.name} onInput={(e) => updateSeat(i, { name: (e.target as HTMLInputElement).value })} /></td>
              <td>
                <select value={s.kind} onChange={(e) => updateSeat(i, { kind: (e.target as HTMLSelectElement).value as SeatConfig['kind'] })}>
                  <option value="human">Human</option>
                  <option value="idle">Idle</option>
                </select>
              </td>
            </tr>
          ))}
        </table>
        <label>Seed{' '}
          <input type="number" value={seed} onInput={(e) => setSeed(Number((e.target as HTMLInputElement).value) | 0)} />
        </label>
        <button class="primary" onClick={start}>Start</button>
      </section>
      <section>
        <h2>Saved games</h2>
        {named.length === 0 && <p>No saved games yet.</p>}
        <ul>
          {named.map((s) => (
            <li><button onClick={() => load(s.name)}>{s.name}</button> turn {s.turn} · {new Date(s.savedAt).toLocaleString()}</li>
          ))}
        </ul>
        <button onClick={importFile}>Import save file…</button>
      </section>
      {error && <p class="error" role="alert">{error}</p>}
    </main>
  );
}
