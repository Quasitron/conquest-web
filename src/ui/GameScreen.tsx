import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { GameSession, SessionCommand } from '../app/session';
import {
  UNIT_STATS, aircraftCanReach, arrivalTurn, cargoCapacity, findPath, pathMapFromView,
  type Dir, type Orders, type Pos, type Unit,
} from '../engine';
import type { SaveStore } from '../storage';
import { availableActions, loadCandidates } from './actions';
import { centerOn, clampCamera, pan, type Camera } from './camera';
import { builtThisTurn, readyUnits } from './cycle';
import { describeEvent } from './describe';
import { downloadSave } from './exportFile';
import { keyToAction, type ActionId } from './keys';
import { pathLabel } from './labels';
import { MapCanvas } from './MapCanvas';
import { OrdersMenu } from './OrdersMenu';
import { drawMinimap } from './render';
import { SidePanel, type Selection } from './SidePanel';
import { dirTo, stepTargets } from './targets';
import { UnitPicker } from './UnitPicker';

interface Props {
  session: GameSession;
  store: SaveStore;
  onQuit: () => void;
}

type TargetMode = null | 'moveTo' | 'patrol';

// After a pointer click, release focus so Space/Enter/arrows go to the game, not the button.
const blur = (e: Event) => (e.currentTarget as HTMLElement).blur();

// Rough size of the context menu, used to keep it on screen.
const MENU_W = 220;
const MENU_H = 400;

export function GameScreen({ session, onQuit }: Props) {
  const [tick, setTick] = useState(0);
  useEffect(() => session.subscribe(() => setTick((t) => t + 1)), [session]);

  const [revealed, setRevealed] = useState(false);
  // One view per session change, so the memos below hold between blink ticks and hovers.
  const view = useMemo(
    () => (revealed ? session.revealedView() : session.view()),
    [session, revealed, tick, session.phase],
  );
  const colors = session.seats.map((s) => s.color);
  const names = view.players.map((p) => p.name);
  const [cam, setCamRaw] = useState<Camera>({ x: 0, y: 0, tile: 28 });
  const [selection, setSelection] = useState<Selection>(null);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<number[]>([]);
  const [target, setTarget] = useState<TargetMode>(null);
  const [hover, setHover] = useState<Pos | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<null | 'load' | 'unload'>(null);
  const [blinkOn, setBlinkOn] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  // Show a one-off load notice (e.g. an older save) when the game opens.
  useEffect(() => {
    if (session.notice) setMessage(session.notice);
  }, [session]);

  useEffect(() => {
    if (session.phase !== 'playing') return;
    const id = window.setInterval(() => setBlinkOn((b) => !b), 250);
    return () => window.clearInterval(id);
  }, [session.phase]);

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
  const playing = session.phase === 'playing';
  const targets = useMemo(
    () => (selectedUnit && playing ? stepTargets(view, selectedUnit) : []),
    [selectedUnit, view, playing],
  );

  // Path preview under the pointer.
  const preview = useMemo(() => {
    if (!selectedUnit || !hover || !playing) return null;
    if (hover.x === selectedUnit.x && hover.y === selectedUnit.y) return null;
    const map = pathMapFromView(view);
    const path = findPath(map, selectedUnit, hover);
    const arrival = path ? arrivalTurn(selectedUnit, path.length, view.turn) : null;
    const fuel = selectedUnit.fuel;
    // Aircraft keep a unit of fuel in hand unless they end at a refuel point.
    const reach = fuel === null || !path || aircraftCanReach(map, path.length, fuel, hover);
    const fuelLeft = fuel === null || !path ? null : reach ? fuel - path.length : -1;
    return {
      path,
      ok: path !== null && (fuelLeft === null || fuelLeft >= 0),
      label: pathLabel(view.turn, arrival, fuelLeft),
    };
  }, [selectedUnit?.id, hover, view]);

  /** The unit cycle for the current state of the game (not the last render). */
  const readyNow = (h: ReadonlySet<number> = held, s: readonly number[] = skipped): Unit[] => {
    const v = session.view();
    return readyUnits(v.myUnits, builtThisTurn(session.log(v.me), v.turn), h, s);
  };
  const ready = readyUnits(view.myUnits, builtThisTurn(session.log(view.me), view.turn), held, skipped);

  const selectUnit = (u: Pos & { id: number }) => {
    setSelection({ kind: 'unit', id: u.id });
    focus(u);
  };
  /** First unit of `fresh` after `id` in the order of `pre`, wrapping round, never `id` itself. */
  const nextAfter = (id: number, pre: readonly Unit[], fresh: readonly Unit[]): Unit | null => {
    const i = pre.findIndex((u) => u.id === id);
    const order = i < 0 ? pre : [...pre.slice(i + 1), ...pre.slice(0, i)];
    for (const u of order) {
      const f = fresh.find((x) => x.id === u.id);
      if (f && f.id !== id) return f;
    }
    return null;
  };
  /** After a command on `id`: stay if it is still ready, otherwise move on to the next ready unit. */
  const settle = (id: number, pre: readonly Unit[]) => {
    const fresh = readyNow();
    if (fresh.some((u) => u.id === id)) return;
    const next = nextAfter(id, pre, fresh) ?? fresh[0];
    if (next) selectUnit(next);
    else setSelection(null);
  };

  // New turn for the viewing player: reset held/skipped and pick the first ready unit.
  const turnKey = `${view.turn}:${view.currentPlayer}:${session.phase}`;
  useEffect(() => {
    setSelection(null);
    setTarget(null);
    setMenu(null);
    setPicker(null);
    if (session.phase !== 'playing') return;
    setHeld(new Set());
    setSkipped([]);
    const first = readyUnits(view.myUnits, builtThisTurn(session.log(view.me), view.turn), new Set(), [])[0];
    if (first) selectUnit(first);
    else if (view.myCities[0]) focus(view.myCities[0]);
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

  /** Issues an order command for `u`, then moves the cycle on if `u` is no longer ready. */
  const order = (u: Unit, cmd: SessionCommand) => {
    const pre = ready;
    if (act(cmd)) settle(u.id, pre);
  };
  const setOrders = (u: Unit, orders: Orders | null) => order(u, { type: 'setOrders', unitId: u.id, orders });

  const moveSelected = (dir: number) => {
    if (!selectedUnit) return;
    if (act({ type: 'move', unitId: selectedUnit.id, dir: dir as Dir })) {
      const still = session.view().myUnits.find((u) => u.id === selectedUnit.id);
      if (still) focus(still);
    }
  };

  const doAction = (id: ActionId) => {
    if (!playing) return;
    if (id === 'endTurn') {
      act({ type: 'endTurn' });
      return;
    }
    if (id === 'next') {
      const cur = selectedUnit && ready.some((u) => u.id === selectedUnit.id) ? selectedUnit : null;
      const next = (cur && nextAfter(cur.id, ready, ready)) ?? (cur ? cur : ready[0]);
      if (next) selectUnit(next);
      return;
    }
    if (id === 'center') {
      if (selectedPos) focus(selectedPos);
      return;
    }
    const u = selectedUnit;
    if (!u) return;
    if (!availableActions(view, u)[id]) {
      setMessage('That is not available for this unit.');
      return;
    }
    switch (id) {
      case 'skip': {
        const next = [...skipped.filter((x) => x !== u.id), u.id];
        const other = nextAfter(u.id, ready, readyNow(held, next));
        setSkipped(next);
        if (other) selectUnit(other);
        return;
      }
      case 'hold': {
        const nextHeld = new Set(held).add(u.id);
        const other = nextAfter(u.id, ready, readyNow(nextHeld, skipped));
        setHeld(nextHeld);
        if (other) selectUnit(other);
        else setSelection(null);
        return;
      }
      case 'sentry': return setOrders(u, { kind: 'sentry' });
      case 'explore': return setOrders(u, { kind: 'explore' });
      case 'clearOrders': return setOrders(u, null);
      case 'goHome': return order(u, { type: 'goHome', unitId: u.id });
      case 'disband':
        if (window.confirm('Disband this unit?')) order(u, { type: 'disband', unitId: u.id });
        return;
      case 'moveTo':
      case 'patrol':
        setTarget(id);
        setMessage(null);
        return;
      case 'load':
      case 'unload':
        setPicker(id);
        return;
    }
  };

  const onSquare = (p: Pos) => {
    if (!playing) return;
    const explored = view.terrain[p.y * view.width + p.x] !== null;
    if (target && selectedUnit) {
      if (!explored) {
        setMessage('That square has not been explored.');
        return;
      }
      const mode = target;
      setTarget(null);
      if (mode === 'moveTo') setOrders(selectedUnit, { kind: 'goto', target: p });
      else setOrders(selectedUnit, { kind: 'patrol', a: { x: selectedUnit.x, y: selectedUnit.y }, b: p, toB: true });
      return;
    }
    if (selectedUnit && targets.some((t) => t.x === p.x && t.y === p.y)) {
      const dir = dirTo(view, selectedUnit, p);
      if (dir !== null) return moveSelected(dir);
    }
    const city = view.knownCities.find((c) => c.x === p.x && c.y === p.y);
    if (city) return setSelection({ kind: 'city', id: city.id });
    const unit = view.myUnits.find((u) => u.x === p.x && u.y === p.y && u.carriedBy === null);
    if (unit) return setSelection({ kind: 'unit', id: unit.id });
    if (selectedUnit && explored) return setOrders(selectedUnit, { kind: 'goto', target: p });
    setSelection(null);
  };

  const onContext = (_p: Pos, client: { x: number; y: number }) => {
    if (!playing) return;
    if (target) {
      setTarget(null);
      return;
    }
    if (!selectedUnit) return;
    setMenu({
      x: Math.max(0, Math.min(client.x, window.innerWidth - MENU_W)),
      y: Math.max(0, Math.min(client.y, window.innerHeight - MENU_H)),
    });
  };

  const onHover = (p: Pos | null) => setHover((prev) => (prev?.x === p?.x && prev?.y === p?.y ? prev : p));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      // Keys typed into form controls or focused buttons keep their native behavior.
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
      const a = keyToAction(e.key, e.code);
      if (!a) return;
      if (a.kind === 'escape') {
        e.preventDefault();
        if (menu) setMenu(null);
        else if (picker) setPicker(null);
        else if (target) setTarget(null);
        else setSelection(null);
        return;
      }
      if (picker) return; // the picker is modal
      if (a.kind === 'arrow' && selectedUnit && playing) {
        e.preventDefault();
        moveSelected(a.dir);
        return;
      }
      if (a.kind === 'arrow') {
        e.preventDefault();
        return setCam(pan(cam, -a.dx * cam.tile, -a.dy * cam.tile));
      }
      if (!playing) return;
      if (a.kind === 'move') {
        if (selectedUnit) {
          e.preventDefault();
          moveSelected(a.dir);
        }
      } else if (a.kind === 'action') {
        // Space and Tab would otherwise scroll or move focus.
        e.preventDefault();
        // An action key dismisses an open menu and cancels target mode before acting.
        setMenu(null);
        setTarget(null);
        doAction(a.id);
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

  const lookup = {
    unit: (id: number) => session.unitInfo(view.me, id),
    city: (id: number) =>
      view.myCities.find((c) => c.id === id)?.name ?? view.knownCities.find((c) => c.id === id)?.name,
  };
  const lines = session.log(view.me)
    .map((entry) => ({ turn: entry.turn, text: describeEvent(entry.event, view.me, names, lookup) }))
    .filter((l): l is { turn: number; text: string } => l.text !== null)
    .slice(-40)
    .reverse();
  const logItems: JSX.Element[] = [];
  let lastTurn: number | null = null;
  lines.forEach((l, i) => {
    if (l.turn !== lastTurn) logItems.push(<li class="turn-divider" key={`t${l.turn}-${i}`}>Turn {l.turn}</li>);
    lastTurn = l.turn;
    logItems.push(<li key={`l${i}`}>{l.text}</li>);
  });
  const current = view.players[view.currentPlayer];
  const nothingLeft = view.myUnits.length === 0 && view.myCities.length === 0;
  const allMoved = playing && ready.length === 0 && !nothingLeft;
  const endTurnBlinks = playing && ready.length === 0;

  const pickerUnit = picker && selectedUnit ? selectedUnit : null;
  const cargo = pickerUnit ? view.myUnits.filter((c) => c.carriedBy === pickerUnit.id).sort((a, b) => a.id - b.id) : [];

  return (
    <div class="game">
      <header class="topbar">
        <span>Turn {view.turn}</span>
        <span><span class="swatch" style={{ background: colors[view.currentPlayer] }} /> {current.name}</span>
        <button class={endTurnBlinks ?'primary blink' : 'primary'} onClick={(e) => { blur(e); act({ type: 'endTurn' }); }} disabled={!playing}>End Turn</button>
        <OrdersMenu view={view} unit={playing ? selectedUnit : null} at={null} onAction={doAction} onClose={() => {}} />
        <button onClick={(e) => {
          blur(e);
          const name = window.prompt('Save name?', session.name === 'autosave' ? 'My game' : session.name);
          if (name) {
            session.saveAs(name)
              .then(() => setMessage(`Saved as "${name}".`))
              .catch((e) => setMessage(`Save failed: ${(e as Error).message}`));
          }
        }}>Save</button>
        <button onClick={(e) => { blur(e); downloadSave(session.toSave()); }}>Export</button>
        <button onClick={(e) => { blur(e); onQuit(); }}>Quit</button>
        {target && <span class="message" role="status">{target === 'moveTo' ? 'Move to' : 'Patrol to'}: click a square (Esc cancels).</span>}
        {!target && message && <span class="message" role="status">{message}</span>}
        {!target && !message && playing && nothingLeft && <span class="message" role="status">You have no cities or units left.</span>}
        {!target && !message && allMoved && <span class="message" role="status">All units have moved. Press Enter or click End Turn.</span>}
        {session.saveError && <span class="error" role="alert">{session.saveError}</span>}
      </header>
      <MapCanvas
        view={view} cam={cam} setCam={setCamRaw} selected={selectedPos} targets={targets} colors={colors}
        onSquare={onSquare} onHover={onHover} onContext={onContext}
        activeId={playing ? selectedUnit?.id ?? null : null} blinkOn={blinkOn}
        path={preview?.path ?? null} pathOk={preview?.ok ?? true} pathLabel={preview?.label ?? null} pathTarget={preview ? hover : null}
        route={null} routeLabel={null} attack={null}
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
          onAction={doAction}
        />
        <ul class="log">{logItems}</ul>
      </div>
      {menu && selectedUnit && (
        <OrdersMenu view={view} unit={selectedUnit} at={menu} onAction={doAction} onClose={() => setMenu(null)} />
      )}
      {pickerUnit && picker === 'load' && (
        <div class="overlay">
          <UnitPicker
            title={`Load onto ${UNIT_STATS[pickerUnit.type].name} #${pickerUnit.id}`}
            units={loadCandidates(view, pickerUnit)}
            max={Math.max(0, cargoCapacity(pickerUnit) - cargo.length)}
            onCancel={() => setPicker(null)}
            onConfirm={(ids) => {
              if (ids.length === 0) return;
              setPicker(null);
              act({ type: 'load', transportId: pickerUnit.id, unitIds: ids });
            }}
          />
        </div>
      )}
      {pickerUnit && picker === 'unload' && (
        <div class="overlay">
          <UnitPicker
            title={`Unload from ${UNIT_STATS[pickerUnit.type].name} #${pickerUnit.id}`}
            units={cargo}
            onCancel={() => setPicker(null)}
            onConfirm={(ids) => {
              if (ids.length === 0) return;
              setPicker(null);
              act({ type: 'unload', transportId: pickerUnit.id, unitIds: ids.length === cargo.length ? null : ids });
            }}
          />
        </div>
      )}
      {session.phase === 'handoff' && (
        <div class="overlay handoff">
          <div class="card">
            <h2>Pass to {session.seats[view.currentPlayer].name}</h2>
            <button class="primary" onClick={(e) => { blur(e); session.confirmHandoff(); }}>I'm ready</button>
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
