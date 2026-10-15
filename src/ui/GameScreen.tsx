import { useEffect, useMemo, useState } from 'preact/hooks';
import type { GameSession, SessionCommand } from '../app/session';
import type { Pos } from '../engine';
import type { SaveStore } from '../storage';
import { centerOn, clampCamera, pan, type Camera } from './camera';
import { describeEvent } from './describe';
import { downloadSave } from './exportFile';
import { keyToAction } from './keys';
import { MapCanvas } from './MapCanvas';
import { drawMinimap } from './render';
import { SidePanel, type Selection } from './SidePanel';
import { dirTo, stepTargets } from './targets';

interface Props {
  session: GameSession;
  store: SaveStore;
  onQuit: () => void;
}

export function GameScreen({ session, onQuit }: Props) {
  const [, setTick] = useState(0);
  useEffect(() => session.subscribe(() => setTick((t) => t + 1)), [session]);

  const [revealed, setRevealed] = useState(false);
  const view = revealed ? session.revealedView() : session.view();
  const colors = session.seats.map((s) => s.color);
  const names = view.players.map((p) => p.name);
  const [cam, setCamRaw] = useState<Camera>({ x: 0, y: 0, tile: 28 });
  const [selection, setSelection] = useState<Selection>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const viewport = () => {
    const el = document.querySelector('canvas.map') as HTMLCanvasElement | null;
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
  };
  const setCam = (c: Camera) => {
    const { w, h } = viewport();
    setCamRaw(clampCamera(c, view.width, view.height, w, h, view.wrap));
  };
  const focus = (p: Pos) => {
    const { w, h } = viewport();
    setCam(centerOn(cam, p.x, p.y, w, h));
  };

  const selectedUnit = selection?.kind === 'unit' ? view.myUnits.find((u) => u.id === selection.id) ?? null : null;
  const selectedPos: Pos | null =
    selectedUnit ?? (selection?.kind === 'city' ? view.knownCities.find((c) => c.id === selection.id) ?? null : null);
  const targets = useMemo(
    () => (selectedUnit && session.phase === 'playing' ? stepTargets(view, selectedUnit) : []),
    [selectedUnit, view, session.phase],
  );

  const ready = () =>
    view.myUnits.filter((u) => u.movesLeft > 0 && !skipped.has(u.id)).sort((a, b) => a.id - b.id);
  const selectNext = () => {
    const list = ready();
    if (list.length === 0) {
      setSelection(null);
      setMessage('All units have moved. Press Enter to end your turn.');
      return;
    }
    const after = list.find((u) => selectedUnit === null || u.id > selectedUnit.id) ?? list[0];
    setSelection({ kind: 'unit', id: after.id });
    focus(after);
  };

  // New turn for the viewing player: reset skips and pick the first unit.
  const turnKey = `${view.turn}:${view.currentPlayer}:${session.phase}`;
  useEffect(() => {
    setSelection(null);
    if (session.phase !== 'playing') return;
    setSkipped(new Set());
    const first = view.myUnits.filter((u) => u.movesLeft > 0).sort((a, b) => a.id - b.id)[0];
    if (first) {
      setSelection({ kind: 'unit', id: first.id });
      focus(first);
    } else if (view.myCities[0]) {
      focus(view.myCities[0]);
    }
  }, [turnKey]);

  const act = (cmd: SessionCommand): boolean => {
    const err = session.act(cmd);
    if (err) {
      setMessage(err);
      const stuck = /(\d+) cannot end its turn/.exec(err);
      if (stuck) {
        const id = Number(stuck[1]);
        setSelection({ kind: 'unit', id });
        const unit = view.myUnits.find((u) => u.id === id);
        if (unit) focus(unit);
      }
      return false;
    }
    setMessage(null);
    const captured = session.lastEvents.find((e) => e.type === 'cityCaptured' && e.by === view.me);
    if (captured && captured.type === 'cityCaptured') setSelection({ kind: 'city', id: captured.cityId });
    return true;
  };

  const moveSelected = (dir: number) => {
    if (!selectedUnit) return;
    if (act({ type: 'move', unitId: selectedUnit.id, dir: dir as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 })) {
      const still = session.view().myUnits.find((u) => u.id === selectedUnit.id);
      if (still) focus(still);
    }
  };

  const onSquare = (p: Pos) => {
    if (session.phase !== 'playing') return;
    if (selectedUnit) {
      const dir = dirTo(view, selectedUnit, p);
      if (dir !== null) return moveSelected(dir);
    }
    const city = view.knownCities.find((c) => c.x === p.x && c.y === p.y);
    if (city) return setSelection({ kind: 'city', id: city.id });
    const unit = view.myUnits.find((u) => u.x === p.x && u.y === p.y && u.carriedBy === null);
    if (unit) return setSelection({ kind: 'unit', id: unit.id });
    setSelection(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      // Keys typed into form controls or focused buttons keep their native behavior.
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
      const a = keyToAction(e.key, e.code);
      if (!a) return;
      if (a.kind === 'pan') {
        e.preventDefault();
        return setCam(pan(cam, -a.dx * cam.tile, -a.dy * cam.tile));
      }
      if (session.phase !== 'playing') return;
      if (a.kind === 'move' && selectedUnit) {
        e.preventDefault();
        moveSelected(a.dir);
      } else if (a.kind === 'next') {
        e.preventDefault();
        selectNext();
      } else if (a.kind === 'skip' && selectedUnit) {
        e.preventDefault();
        setSkipped(new Set(skipped).add(selectedUnit.id));
        selectNext();
      } else if (a.kind === 'endTurn') {
        e.preventDefault();
        act({ type: 'endTurn' });
      } else if (a.kind === 'center' && selectedPos) {
        e.preventDefault();
        focus(selectedPos);
      } else if (a.kind === 'deselect') {
        e.preventDefault();
        setSelection(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Minimap.
  useEffect(() => {
    const c = document.querySelector('canvas.minimap') as HTMLCanvasElement | null;
    if (!c) return;
    const { w, h } = viewport();
    drawMinimap(c.getContext('2d')!, view, colors, c.width, c.height, cam, w, h);
  });

  const log = session.log(view.me)
    .map((entry) => describeEvent(entry.event, view.me, names))
    .filter((t): t is string => t !== null)
    .slice(-40)
    .reverse();
  const current = view.players[view.currentPlayer];

  return (
    <div class="game">
      <header class="topbar">
        <span>Turn {view.turn}</span>
        <span><span class="swatch" style={{ background: colors[view.currentPlayer] }} /> {current.name}</span>
        <button class="primary" onClick={() => act({ type: 'endTurn' })} disabled={session.phase !== 'playing'}>End Turn</button>
        <button onClick={() => {
          const name = window.prompt('Save name?', session.name === 'autosave' ? 'My game' : session.name);
          if (name) {
            session.saveAs(name)
              .then(() => setMessage(`Saved as "${name}".`))
              .catch((e) => setMessage(`Save failed: ${(e as Error).message}`));
          }
        }}>Save</button>
        <button onClick={() => downloadSave(session.toSave())}>Export</button>
        <button onClick={onQuit}>Quit</button>
        {message && <span class="message" role="status">{message}</span>}
        {session.saveError && <span class="error" role="alert">{session.saveError}</span>}
      </header>
      <MapCanvas
        view={view} cam={cam} setCam={setCamRaw} selected={selectedPos} targets={targets} colors={colors}
        onSquare={onSquare} onDeselect={() => setSelection(null)}
      />
      <div class="side">
        <canvas class="minimap" width={200} height={140} onClick={(e) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * view.width);
          const y = Math.floor(((e.clientY - r.top) / r.height) * view.height);
          focus({ x, y });
        }} />
        <SidePanel
          view={view}
          selection={selection}
          onSelectUnit={(id) => setSelection({ kind: 'unit', id })}
          onProduction={(cityId, unitType) => act({ type: 'setProduction', cityId, unitType })}
          onDisband={(id) => { if (window.confirm('Disband this unit?')) act({ type: 'disband', unitId: id }); }}
        />
        <ol class="log">{log.map((line) => <li>{line}</li>)}</ol>
      </div>
      {session.phase === 'handoff' && (
        <div class="overlay handoff">
          <div class="card">
            <h2>Pass to {session.seats[view.currentPlayer].name}</h2>
            <button class="primary" onClick={() => session.confirmHandoff()}>I'm ready</button>
          </div>
        </div>
      )}
      {session.phase === 'over' && !revealed && (
        <div class="overlay">
          <div class="card">
            <h2>{view.winner === null ? 'Game over: no survivors' : `${names[view.winner]} wins!`}</h2>
            <button class="primary" onClick={onQuit}>New game</button>
            <button onClick={() => setRevealed(true)}>View map</button>
          </div>
        </div>
      )}
    </div>
  );
}
