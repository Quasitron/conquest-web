import type { JSX } from 'preact';
import { memo } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameSession, SessionCommand } from '../app/session';
import { unloadAndLand } from '../app/unloadAndLand';
import {
  UNIT_STATS, aircraftCanReach, arrivalTurn, cargoCapacity, chebyshev, findPath, pathMapFromView, unitDisplayName,
  type Dir, type MapLike, type Orders, type PlayerView, type Pos, type Unit, type UnitType,
} from '../engine';
import type { SaveStore } from '../storage';
import { availableActions, loadCandidates } from './actions';
import { autoFit, centerOn, clampCamera, exploredBox, keepInViewWrap, pan, type Camera } from './camera';
import { CityScreen } from './CityScreen';
import { installAudioUnlock, play, playAll } from '../audio/engine';
import { produceSound, SOUND_GAP_MS, soundsForEvents } from '../audio/fromEvents';
import { SettingsDialog } from './SettingsDialog';
import { UnitList } from './UnitList';
import { GroupDialog } from './GroupDialog';
import { eligibleFor, GROUP_ORDERS, unitsInBox, type GroupBox, type GroupOrderId } from './group';
import { Reports, type ReportTab } from './Reports';
import { battlesAgainstMe, newEliminations, recentSightings } from './reportLines';
import { EliminationNotice } from './EliminationNotice';
import { unitsHeadingLeft } from './unitIcons';
import { builtThisTurn, nextReadyAfter, readyUnits, reportQueue, type ProductionReportItem } from './cycle';
import { describeEvent } from './describe';
import { downloadSave } from './exportFile';
import { keyToAction, type ActionId } from './keys';
import { pathLabel, pluralUnit } from './labels';
import { cityScreenPoint } from './placement';
import { approachSquare, attackLabel, bombardLabel, cityAttackChance, cityBombardChance, unitAttackChance, visibleGarrison } from './plans';
import { ProductionReport } from './ProductionReport';
import { MapCanvas, type ActiveFx } from './MapCanvas';
import { getCombatMode, getReplayPace, getReportAfter, type ReplayPace } from './combatMode';
import { fightsFromEvents, placeNote, replayFights, stepDuration, FIGHT_MS, SHOT_SHARE, type Fight } from './fights';
import { OrdersMenu } from './OrdersMenu';
import { drawMinimap } from './render';
import { SidePanel, type Selection } from './SidePanel';
import { StatusLine } from './StatusLine';
import { dirTo, stepTargets } from './targets';
import { UnitInfo } from './UnitInfo';
import { UnitPicker } from './UnitPicker';
import { blur } from './blur';

interface Props {
  session: GameSession;
  store: SaveStore;
  onQuit: () => void;
}

type TargetMode = null | 'moveTo' | 'patrol';

// Rough size of the context menu, used to keep it on screen.
const MENU_W = 220;
const MENU_H = 400;
// How long a newly given Move To / Patrol route stays on screen before the cycle moves on.
const ROUTE_PAUSE_MS = 700;
/** After an attack, how long the battle stays on screen before the cycle moves on to the next unit. */
const BATTLE_PAUSE_MS = 1000;
/** The replay zooms in to at least this tile size so each fight is easy to see. */
const REPLAY_TILE = 36;
/** Each replayed fight opens at no closer than this tile size, so you can see where on the map it is. */
const WIDE_TILE = 10;
/** How long that wide view is held before zooming in, and the longest a fight's own animation runs. */
const WIDE_MS = 650;
const REPLAY_FX_MS = 1500;

/** Group mode: waiting for a box, choosing the order for the units it caught, or waiting for a Move To square. */
type GroupState = null | { step: 'box' } | { step: 'order'; ids: number[] } | { step: 'target'; ids: number[] };

interface LogLine { turn: number; text: string }

/** The event log; memoised on `lines`, which only changes with the game view. */
const GameLog = memo(function GameLog({ lines }: { lines: LogLine[] }) {
  const items: JSX.Element[] = [];
  let lastTurn: number | null = null;
  lines.forEach((l, i) => {
    if (l.turn !== lastTurn) items.push(<li class="turn-divider" key={`t${l.turn}-${i}`}>Turn {l.turn}</li>);
    lastTurn = l.turn;
    items.push(<li key={`l${i}`}>{l.text}</li>);
  });
  return <ul class="log">{items}</ul>;
});

/** Path, reachability and label from `u` to `to` (fuel-aware for aircraft). */
function planPath(view: PlayerView, u: Unit, to: Pos): { path: Pos[] | null; ok: boolean; label: string } {
  const map = pathMapFromView(view);
  const path = findPath(map, u, to);
  const arrival = path ? arrivalTurn(u, path.length, view.turn) : null;
  const fuel = u.fuel;
  // Aircraft keep a unit of fuel in hand unless they end at a refuel point.
  const reach = fuel === null || !path || aircraftCanReach(map, path.length, fuel, to);
  const fuelLeft = fuel === null || !path ? null : reach ? fuel - path.length : -1;
  return {
    path,
    ok: path !== null && (fuelLeft === null || fuelLeft >= 0),
    label: pathLabel(view.turn, arrival, fuelLeft),
  };
}

const exploredCount = (v: PlayerView) => v.terrain.reduce((n, t) => (t === null ? n : n + 1), 0);
const samePos = (a: Pos | null, b: Pos | null) => a?.x === b?.x && a?.y === b?.y;

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
  const [selection, setSelectionRaw] = useState<Selection>(null);
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<number[]>([]);
  const [target, setTarget] = useState<TargetMode>(null);
  const [group, setGroup] = useState<GroupState>(null);
  const [groupBox, setGroupBox] = useState<GroupBox | null>(null);
  const [prodMap, setProdMap] = useState(false);
  const [routesMap, setRoutesMap] = useState(false);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  // Fights playing out on the map, and the turn-start replay of what the other players did (null when none).
  const [fx, setFx] = useState<ActiveFx[]>([]);
  const [replay, setReplay] = useState<{ steps: Fight[]; more: number; index: number } | null>(null);
  const fxTimer = useRef<number | undefined>(undefined);
  const [replayPaused, setReplayPaused] = useState(false);
  // The last replay step whose fight has started playing (-1 before any); later steps' units still stand as they were.
  const [playedStep, setPlayedStep] = useState(-1);
  const [reportTab, setReportTab] = useState<ReportTab | null>(null);
  // Players knocked out since your last turn, announced once at the start of the turn.
  const [eliminated, setEliminated] = useState<number[]>([]);
  // A square flashing on the map after a report line's Show button.
  const [flash, setFlash] = useState<Pos | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const [hover, setHover] = useState<Pos | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [picker, setPicker] = useState<null | 'load' | 'unload'>(null);
  const [infoId, setInfoId] = useState<number | null>(null);
  // The square whose hover preview is frozen after an order was given there, until the pointer leaves it.
  const [frozen, setFrozen] = useState<Pos | null>(null);
  // A far city click that found no way there: shown as a red "no known path" preview on that square.
  const [noPath, setNoPath] = useState<Pos | null>(null);
  // Auto-fit state per seat, and the explored-square count at the last fit check.
  const fits = useRef(new Map<number, { auto: boolean; ceiling: number | null }>());
  const exploredAt = useRef(new Map<number, number>());
  const fitOf = (me: number) => {
    let f = fits.current.get(me);
    if (!f) fits.current.set(me, f = { auto: true, ceiling: null });
    return f;
  };
  const [message, setMessage] = useState<string | null>(null);
  // Errors from commands issued inside a dialog; the top bar is hidden behind it, so they show there.
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Bumped when the map is resized, so dialog anchors and leader lines are recomputed.
  const [, setResizes] = useState(0);
  // The city screen (by city id) and the turn-start production reports still to be acknowledged.
  const [cityOpen, setCityOpen] = useState<number | null>(null);
  const [reports, setReports] = useState<ProductionReportItem[]>([]);
  const [reportIdx, setReportIdx] = useState(0);

  // Show a one-off load notice (e.g. an older save) when the game opens.
  useEffect(() => {
    if (session.notice) setMessage(session.notice);
  }, [session]);

  const viewport = () => {
    const el = document.querySelector('canvas.map') as HTMLCanvasElement | null;
    return { w: el?.clientWidth ?? 800, h: el?.clientHeight ?? 600 };
  };
  // The camera as last set, ahead of the next render, so chained camera moves compose.
  const camNow = useRef(cam);
  camNow.current = cam;
  const setCam = (c: Camera, v: PlayerView = view) => {
    const { w, h } = viewport();
    const next = clampCamera(c, v.width, v.height, w, h, v.wrap);
    camNow.current = next;
    setCamRaw(next);
  };
  const focus = (p: Pos) => {
    const { w, h } = viewport();
    setCam(centerOn(camNow.current, p.x, p.y, w, h));
  };
  /** Pans the least needed to keep `p` inside the viewport, the short way round on wrapping maps. */
  const keepVisible = (p: Pos, v: PlayerView = view) => {
    const { w, h } = viewport();
    setCam(keepInViewWrap(camNow.current, p, w, h, v.width, v.wrap), v);
  };
  /** Fits the explored area (never zooming in past an earlier fit) when auto-fit is on, then keeps `at` in view. */
  const applyAutoFit = (v: PlayerView, at: Pos | null) => {
    const f = fitOf(v.me);
    if (!f.auto) return;
    const box = exploredBox(v.terrain, v.width, v.height, v.wrap);
    if (!box) return;
    const { w, h } = viewport();
    const r = autoFit(box, w, h, f.ceiling);
    f.ceiling = r.ceiling;
    setCam(r.cam, v);
    if (at) keepVisible(at, v);
  };
  // A pending "move on after showing the route" timer; the callback reads the latest render through a ref.
  const advanceTimer = useRef<number | undefined>(undefined);
  const advanceNow = useRef<() => void>(() => {});
  const cancelAdvance = () => {
    window.clearTimeout(advanceTimer.current);
    advanceTimer.current = undefined;
  };
  useEffect(() => cancelAdvance, []);

  const setSelection = (s: Selection) => {
    // Any change of selection (by the player or the cycle) replaces a pending move-on.
    cancelAdvance();
    // The info dialog belongs to one unit: any change of selection drops it.
    if (!(s && selection && s.kind === selection.kind && s.id === selection.id)) setInfoId(null);
    setSelectionRaw(s);
  };

  const selectedUnit = selection?.kind === 'unit' ? view.myUnits.find((u) => u.id === selection.id) ?? null : null;
  const selectedPos: Pos | null =
    selectedUnit ?? (selection?.kind === 'city' ? view.knownCities.find((c) => c.id === selection.id) ?? null : null);
  const playing = session.phase === 'playing';
  const openCityObj = playing && cityOpen !== null ? view.myCities.find((c) => c.id === cityOpen) ?? null : null;
  const report = playing && !openCityObj ? reports[reportIdx] ?? null : null;
  const reportCity = report ? view.myCities.find((c) => c.id === report.cityId) ?? null : null;
  const dialogOpen = openCityObj !== null || reportCity !== null || unitsOpen || reportTab !== null || soundOpen || replay !== null;
  // A dialog error belongs to one dialog: clear it whenever a dialog opens, changes or closes.
  const dialogKey = `${openCityObj?.id ?? ''}:${report?.unitId ?? ''}`;
  useEffect(() => setDialogError(null), [dialogKey]);

  // Re-fit (auto-fit on) or re-clamp (off) the camera when the map canvas changes size, once per frame.
  const onResize = useRef<() => void>(() => {});
  onResize.current = () => {
    if (session.phase !== 'playing') return;
    const v = session.view();
    const f = fitOf(v.me);
    if (f.auto) {
      f.ceiling = null;
      const sel = selection?.kind === 'unit' ? v.myUnits.find((u) => u.id === selection.id) ?? null : null;
      applyAutoFit(v, sel);
    } else setCam(camNow.current, v);
    setResizes((n) => n + 1);
  };
  useEffect(() => {
    const el = document.querySelector('canvas.map');
    if (!el || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) { first = false; return; } // the initial report is not a resize
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; onResize.current(); });
    });
    ro.observe(el);
    return () => { ro.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  /** Screen position of a city's center, for the leader line; null when it is off the visible map. */
  const anchorFor = (c: Pos | null) => {
    const el = document.querySelector('canvas.map');
    if (!c || !el) return null;
    const r = el.getBoundingClientRect();
    return cityScreenPoint(cam, c, view.width, view.wrap, { left: r.left, top: r.top, w: r.width, h: r.height });
  };
  // The info dialog belongs to one unit: it closes when the selection moves elsewhere.
  const info = infoId !== null && infoId === selectedUnit?.id;
  const targets = useMemo(
    () => (selectedUnit && playing ? stepTargets(view, selectedUnit) : []),
    [selectedUnit, view, playing],
  );

  // Attack hover: a crosshair and the odds instead of the path preview.
  const attack = useMemo(() => {
    if (!selectedUnit || !hover || !playing) return null;
    if (!targets.some((t) => t.attack && t.x === hover.x && t.y === hover.y)) return null;
    const city = view.knownCities.find((c) => c.x === hover.x && c.y === hover.y && c.owner !== view.me);
    if (city && UNIT_STATS[selectedUnit.type].domain === 'sea') {
      return { at: hover, label: bombardLabel(cityBombardChance(view, selectedUnit, city.damage, visibleGarrison(view, city, city.owner))) };
    }
    if (city) return { at: hover, label: attackLabel(cityAttackChance(view, selectedUnit, city.owner, city.damage, visibleGarrison(view, city, city.owner))) };
    // A unit: odds against the first enemy seen on the square (the one that defends), its damage assumed none.
    const foe = view.enemies.find((e) => e.visibleNow && e.x === hover.x && e.y === hover.y);
    return { at: hover, label: attackLabel(foe ? unitAttackChance(selectedUnit, foe.type) : null, true) };
  }, [selectedUnit, hover, targets, view, playing]);

  // Path preview under the pointer; held back right after an order was given on that square.
  const preview = useMemo(() => {
    if (!selectedUnit || !hover || !playing || attack) return null;
    if (hover.x === selectedUnit.x && hover.y === selectedUnit.y) return null;
    if (samePos(frozen, hover)) return null;
    if (samePos(noPath, hover)) return { path: null, ok: false, label: 'no known path' };
    return planPath(view, selectedUnit, hover);
  }, [selectedUnit?.id, hover, view, frozen, noPath, attack]);

  // The committed route of the selected unit's go-to or patrol, from where it stands to its current target.
  const route = useMemo(() => {
    const o = selectedUnit?.orders;
    if (!selectedUnit || !playing || !o || (o.kind !== 'goto' && o.kind !== 'patrol')) return null;
    const to = o.kind === 'goto' ? o.target : o.toB ? o.b : o.a;
    const r = planPath(view, selectedUnit, to);
    return r.path && r.path.length > 0 ? r : null;
  }, [selectedUnit, view, playing]);

  // The Routes view: one arrow per city route, from the city to its destination city.
  const cityRoutes = useMemo(() => {
    if (!routesMap) return undefined;
    return view.myCities.flatMap((c) => {
      const dest = c.route ? view.myCities.find((d) => d.id === c.route!.destId) : undefined;
      return c.route && dest
        ? [{ from: { x: c.x, y: c.y }, to: { x: dest.x, y: dest.y }, types: c.route.types }]
        : [];
    });
  }, [routesMap, view]);

  // While choosing a patrol destination, the player's other patrols, so covered stretches are visible.
  const patrols = useMemo(() => {
    if (target !== 'patrol') return undefined;
    return view.myUnits.flatMap((u): [Pos, Pos][] =>
      u.orders?.kind === 'patrol' && u.id !== selectedUnit?.id ? [[u.orders.a, u.orders.b]] : []);
  }, [target, view, selectedUnit?.id]);

  /** The unit cycle for the current state of the game (not the last render). */
  const readyNow = (h: ReadonlySet<number> = held, s: readonly number[] = skipped): Unit[] => {
    const v = session.view();
    return readyUnits(v.myUnits, builtThisTurn(session.log(v.me), v.turn), h, s);
  };
  // Depends on view (rebuilt per session change), held and skipped only, so hover and zoom reuse it.
  const ready = useMemo(
    () => readyUnits(view.myUnits, builtThisTurn(session.log(view.me), view.turn), held, skipped),
    [view, held, skipped],
  );

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
  /** Runs `fn` now, or after BATTLE_PAUSE_MS if the last command was an attack by this player, so its result can be seen. */
  const afterBattle = (fn: () => void) => {
    if (!session.lastEvents.some((e) => e.type === 'combat' && e.attackerOwner === view.me)) return fn();
    cancelAdvance();
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = undefined;
      fn();
    }, BATTLE_PAUSE_MS);
  };
  /** After a command on `id`: stay if it is still ready, otherwise move on to the next ready unit. */
  const settle = (id: number, pre: readonly Unit[]) => {
    const fresh = readyNow();
    if (fresh.some((u) => u.id === id)) return;
    const next = nextAfter(id, pre, fresh) ?? fresh[0];
    if (next) selectUnit(next);
    else setSelection(null);
  };

  // Sounds for the viewer's new log entries. A loaded save, or a different viewer in hotseat, is synced silently.
  const soundSeen = useRef<{ me: number; count: number } | null>(null);
  // When the sounds just played for a batch should have finished, so a production sound can wait for them.
  const soundsEnd = useRef(0);
  useEffect(installAudioUnlock, []);
  useEffect(() => {
    const log = session.log(view.me);
    const seen = soundSeen.current;
    if (seen && seen.me === view.me && log.length > seen.count) {
      let sounds = soundsForEvents(log.slice(seen.count).map((l) => l.event), view.me);
      // The turn ping is only for a quiet turn start: a production screen or the Combat report opening says it already.
      if (sounds.includes('turn') && (
        battlesAgainstMe(log, view.me, names, lookup).length > 0
        || reportQueue(log, view.turn, view.me, view.myCities).some((r) => view.myUnits.some((u) => u.id === r.unitId))
      )) sounds = sounds.filter((x) => x !== 'turn');
      playAll(sounds);
      if (sounds.length > 0) soundsEnd.current = Date.now() + (sounds.length - 1) * SOUND_GAP_MS + 1300;
    }
    soundSeen.current = { me: view.me, count: log.length };
  }, [view]);

  // Each unit's production report opens with that unit type's sound.
  useEffect(() => {
    if (!report) return;
    const type = report.unitType;
    const wait = soundsEnd.current - Date.now();
    if (wait <= 0) { play(produceSound(type)); return; }
    const timer = window.setTimeout(() => play(produceSound(type)), wait);
    return () => window.clearTimeout(timer);
  }, [report?.unitId]);

  // New turn for the viewing player: reset held/skipped and pick the first ready unit.
  const turnKey = `${view.turn}:${view.currentPlayer}:${session.phase}`;
  useEffect(() => {
    cancelAdvance();
    setSelection(null);
    setTarget(null);
    setGroup(null);
    setGroupBox(null);
    setMenu(null);
    setPicker(null);
    setInfoId(null);
    setFrozen(null);
    setNoPath(null);
    setCityOpen(null);
    setUnitsOpen(false);
    setReportTab(null);
    setEliminated([]);
    setReports([]);
    setReportIdx(0);
    if (session.phase !== 'playing') return;
    setHeld(new Set());
    setSkipped([]);
    exploredAt.current.set(view.me, exploredCount(view));
    // Animated mode replays what the other players did since the last turn first; the turn proper begins after it.
    const rp = getCombatMode() === 'animated' ? replayFights(session.log(view.me), view.me, names, lookup) : null;
    if (rp && rp.steps.length > 0) {
      setReplayPaused(false);
      setPlayedStep(-1);
      setReplay({ ...rp, index: 0 });
    }
    else beginTurn();
  }, [turnKey]);

  /** The start of the turn proper: production reports come first; the unit cycle starts after the last one. */
  const beginTurn = () => {
    const queue = reportQueue(session.log(view.me), view.turn, view.me, view.myCities)
      .filter((r) => view.myUnits.some((u) => u.id === r.unitId));
    if (queue.length > 0) {
      applyAutoFit(view, null);
      setReports(queue);
    } else startCycle();
  };

  // The turn-start replay. Each fight starts with a wide view and a ring on the spot (so you can see where it is),
  // then zooms in and plays with its sounds; the result ring stays on the square until the replay moves on. It moves
  // on by itself at the chosen pace (important fights are held longer), or when you tap Next; Pause holds it.
  // (The batch sounds skip battles at turn start, and the sound of a captured city is already in that batch.)
  const finishReplay = () => {
    const rp = replay;
    window.clearTimeout(fxTimer.current);
    setFx([]);
    setFlash(null);
    setReplay(null);
    setReplayPaused(false);
    setPlayedStep(-1);
    if (replayCam.current) setCam(replayCam.current); // back to the view from before the replay
    replayCam.current = null;
    // The Combat report opens once the turn proper has begun (after any production reports), if wanted.
    if (rp && (rp.more > 0 || getReportAfter())) openCombatAfter.current = true;
    beginTurn();
  };
  const advanceReplay = () => {
    if (!replay) return;
    if (replay.index + 1 < replay.steps.length) setReplay({ ...replay, index: replay.index + 1 });
    else finishReplay();
  };
  const replayCam = useRef<Camera | null>(null);
  const stepStart = useRef(0);
  const openCombatAfter = useRef(false);
  const finishRef = useRef(finishReplay);
  finishRef.current = finishReplay;
  const advanceRef = useRef(advanceReplay);
  advanceRef.current = advanceReplay;
  const wideMsFor = (pace: ReplayPace) => (pace === 'fast' ? WIDE_MS / 2 : WIDE_MS);
  useEffect(() => {
    if (!replay) return;
    const step = replay.steps[replay.index];
    const pace = getReplayPace();
    const total = stepDuration(pace, step, view.me);
    const wideMs = wideMsFor(pace);
    const fxMs = Math.min(total ?? REPLAY_FX_MS, REPLAY_FX_MS);
    const { w, h } = viewport();
    replayCam.current ??= camNow.current;
    const base = replayCam.current;
    // 1. A wide view with a ring on the spot (never closer than the player's own zoom, never wider than WIDE_TILE).
    setCam(centerOn({ ...camNow.current, tile: Math.min(base.tile, WIDE_TILE) }, step.at.x, step.at.y, w, h));
    setFlash(step.at);
    stepStart.current = performance.now();
    // 2. Zoom in and play the fight with its sounds.
    const zoom = window.setTimeout(() => {
      setCam(centerOn({ ...camNow.current, tile: Math.max(base.tile, REPLAY_TILE) }, step.at.x, step.at.y, w, h));
      runFx([step], fxMs);
      setPlayedStep(replay.index);
      play('shot');
    }, wideMs);
    const boom = window.setTimeout(() => { if (step.destroyed || step.captured) play('explosion'); }, wideMs + fxMs * SHOT_SHARE);
    return () => { window.clearTimeout(zoom); window.clearTimeout(boom); };
  }, [replay?.index, replay !== null]);
  useEffect(() => {
    if (!replay || replayPaused) return;
    const pace = getReplayPace();
    const total = stepDuration(pace, replay.steps[replay.index], view.me);
    if (total === null) return; // manual: waits for Next
    const due = stepStart.current + wideMsFor(pace) + total + 150;
    const timer = window.setTimeout(() => advanceRef.current(), Math.max(400, due - performance.now()));
    return () => window.clearTimeout(timer);
  }, [replay?.index, replay !== null, replayPaused]);
  /** Selects the first ready unit of a fresh turn (built-this-turn first), else looks at a city. */
  const startCycle = () => {
    const first = readyNow(new Set(), [])[0];
    if (first) {
      if (fitOf(view.me).auto) {
        setSelection({ kind: 'unit', id: first.id });
        applyAutoFit(view, first);
      } else selectUnit(first);
    } else if (fitOf(view.me).auto) applyAutoFit(view, null);
    else if (view.myCities[0]) focus(view.myCities[0]);
    // Reports mode: if anything attacked you since your last turn, the Combat report opens on its own.
    const wantCombat = getCombatMode() === 'reports' || openCombatAfter.current;
    openCombatAfter.current = false;
    if (wantCombat && battlesAgainstMe(session.log(view.me), view.me, names, lookup).length > 0) setReportTab('combat');
    // Anyone knocked out while the others played is announced, so nobody has to find it in the Status report.
    const out = newEliminations(session.log(view.me), view.me);
    if (out.length > 0 && !view.over) setEliminated(out);
    // A player's very first turn (one city, no units): its production screen opens so the default can be changed,
    // as in the original. Last, so the city screen's focus wins over the camera moves above.
    if (view.turn === 1 && view.myUnits.length === 0 && view.myCities.length === 1) openCity(view.myCities[0].id);
  };
  const nextReport = () => {
    if (reportIdx + 1 < reports.length) {
      setReportIdx(reportIdx + 1);
      return;
    }
    setReports([]);
    setReportIdx(0);
    startCycle();
  };
  // Each report centers the map on its city.
  useEffect(() => {
    if (reportCity) focus(reportCity);
  }, [reportCity?.id, report?.unitId]);
  const openCity = (id: number) => {
    // Fresh from the session: a just-captured city is not in this render's view yet.
    const city = session.view().myCities.find((c) => c.id === id);
    if (!city) return;
    setMessage(null);
    setDialogError(null);
    setInfoId(null);
    setMenu(null);
    setPicker(null);
    setTarget(null);
    focus(city);
    setCityOpen(id);
  };

  const act = (cmd: SessionCommand, fromDialog = false): boolean => {
    const err = session.act(cmd);
    if (err) {
      if (fromDialog) setDialogError(err);
      else setMessage(err);
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
    setDialogError(null);
    if (cmd.type !== 'endTurn' && cmd.type !== 'resign') {
      afterOwnAct();
      showOwnFights();
    }
    return true;
  };

  /** Starts the fight effects for ights and clears them when the run is over. */
  const runFx = (fights: Fight[], duration: number) => {
    const start = performance.now();
    setFx(fights.map((fight) => ({ fight, start, duration })));
    window.clearTimeout(fxTimer.current);
    fxTimer.current = window.setTimeout(() => setFx([]), duration + 60);
  };
  /** Animated mode: the fights of the player's own last command play out on the map. */
  const showOwnFights = () => {
    if (getCombatMode() !== 'animated') return;
    const mine = fightsFromEvents(session.lastEvents, (e) => describeEvent(e, view.me, names, lookup))
      .filter((f) => f.attackerOwner === view.me);
    if (mine.length > 0) runFx(mine, FIGHT_MS);
  };

  /**
   * Housekeeping after one of the viewer's commands went through: recover from a selected unit that is gone
   * (a lost attack, a sunk transport), and re-fit the map when new squares were explored.
   */
  const afterOwnAct = () => {
    const ev = session.lastEvents.find((e) => e.type === 'cityCaptured' && e.by === view.me);
    const captured = ev && ev.type === 'cityCaptured' ? ev : null;
    // Last, so that the city screen's focus wins over any selection or auto-fit camera move.
    const finish = () => { if (captured) openCity(captured.cityId); };
    if (session.phase !== 'playing') return finish();
    const v = session.view();
    if (v.me !== view.me) return finish();
    let selId = selection?.kind === 'unit' ? selection.id : null;
    if (selId !== null && !v.myUnits.some((u) => u.id === selId)) {
      // The selected unit is gone. A capturing army is consumed as the garrison: recover without moving the
      // camera or showing combat text. Otherwise keep the combat result in the top bar (the log has it too).
      if (!captured) {
        const combat = session.lastEvents.find((e) => e.type === 'combat');
        const text = combat ? describeEvent(combat, v.me, names, lookup) : null;
        if (text) setMessage(text);
      }
      const lostId = selId;
      const moveOn = () => {
        const next = nextReadyAfter(readyNow(), lostId);
        if (next) {
          if (captured) setSelection({ kind: 'unit', id: next.id });
          else selectUnit(next);
        } else setSelection(null);
        refit(next ? next.id : null);
        finish();
      };
      // A lost attack stays on screen for a moment so the outcome can be seen, then the cycle moves on.
      if (captured) moveOn();
      else afterBattle(moveOn);
      return;
    }
    refit(selId);
    finish();
    function refit(id: number | null) {
      const n = exploredCount(v);
      if (n > (exploredAt.current.get(v.me) ?? 0)) {
        exploredAt.current.set(v.me, n);
        applyAutoFit(v, id !== null ? v.myUnits.find((u) => u.id === id) ?? null : null);
      }
    }
  };

  /** Issues an order command for `u`, then moves the cycle on if `u` is no longer ready. */
  const order = (u: Unit, cmd: SessionCommand) => {
    const pre = ready;
    // A unit that is gone has already been replaced in the selection by `act`.
    if (act(cmd) && session.view().myUnits.some((x) => x.id === u.id)) settle(u.id, pre);
  };
  const setOrders = (u: Unit, orders: Orders | null) => order(u, { type: 'setOrders', unitId: u.id, orders });

  /**
   * Go-to or patrol given by a click: the unit (having made any moves it could) stays selected with its route
   * showing for ROUTE_PAUSE_MS, then the cycle moves on to the next ready unit, as in the original game.
   */
  const giveRoute = (u: Unit, orders: Orders, at: Pos) => {
    if (!act({ type: 'setOrders', unitId: u.id, orders })) return;
    setFrozen(at);
    setNoPath(null);
    const still = session.view().myUnits.find((x) => x.id === u.id);
    if (still) keepVisible(still);
    cancelAdvance();
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = undefined;
      advanceNow.current();
    }, ROUTE_PAUSE_MS);
  };
  // Runs when the route pause ends; reads this render's state. Stays put while a dialog or target mode is open,
  // or when nothing else is ready (the top bar then shows the end-of-turn prompt).
  advanceNow.current = () => {
    if (!playing || target || picker || cityOpen !== null || reports.length > 0 || infoId !== null) return;
    if (selection?.kind !== 'unit') return;
    const next = nextReadyAfter(readyNow(), selection.id);
    if (next && next.id !== selection.id) selectUnit(next);
    else if (readyNow().length === 0) setSelection(null);
  };

  const cancelGroup = () => {
    setGroup(null);
    setGroupBox(null);
  };
  const toggleGroup = () => {
    if (group) return cancelGroup();
    if (!playing) return;
    setTarget(null);
    setMenu(null);
    setMessage(null);
    setGroup({ step: 'box' });
  };
  /** A box was released (in Group mode, or by Shift+drag): the units inside it become the group. */
  const onBoxDone = (box: GroupBox) => {
    if (!playing || dialogOpen || group?.step === 'order' || group?.step === 'target') return setGroupBox(null);
    const caught = unitsInBox(view, box);
    if (caught.length === 0) {
      setGroupBox(null);
      setMessage('No units of yours in that box.' + (group ? ' Drag again, or press Esc.' : ''));
      return;
    }
    setTarget(null);
    setMenu(null);
    setMessage(null);
    setGroupBox(box); // stays drawn while the order is chosen
    setGroup({ step: 'order', ids: caught.map((u) => u.id) });
  };
  const pickGroupOrder = (id: GroupOrderId) => {
    if (group?.step !== 'order') return;
    if (id === 'moveTo') setGroup({ step: 'target', ids: group.ids });
    else applyGroup(id, group.ids);
  };
  /** Gives one order to every unit of the group it is available for, then reports how many took it. */
  const applyGroup = (id: GroupOrderId, ids: number[], at?: Pos) => {
    const eligible = eligibleFor(session.view(), ids, id);
    const pre = ready;
    let nextHeld = held;
    let done = 0;
    for (const u of eligible) {
      if (id === 'hold') {
        if (nextHeld === held) nextHeld = new Set(held);
        nextHeld.add(u.id);
        done++;
        continue;
      }
      const cmd: SessionCommand =
        id === 'goHome' ? { type: 'goHome', unitId: u.id }
        : id === 'repair' ? { type: 'goHome', unitId: u.id, repair: true }
        : { type: 'setOrders', unitId: u.id, orders: id === 'sentry' ? { kind: 'sentry' } : id === 'explore' ? { kind: 'explore' } : id === 'moveTo' ? { kind: 'goto', target: at! } : null };
      if (act(cmd)) done++;
    }
    cancelGroup();
    if (nextHeld !== held) setHeld(nextHeld);
    // The selected unit may no longer need orders: move the cycle on.
    const selId = selection?.kind === 'unit' && ids.includes(selection.id) ? selection.id : null;
    if (selId !== null) {
      const fresh = readyNow(nextHeld);
      if (!fresh.some((u) => u.id === selId)) {
        const next = nextAfter(selId, pre, fresh) ?? fresh[0];
        if (next) selectUnit(next);
        else setSelection(null);
      }
    }
    const label = GROUP_ORDERS.find((o) => o.id === id)!.label;
    setMessage(`${label} given to ${done} of ${ids.length} ${ids.length === 1 ? 'unit' : 'units'}.`);
  };

  const moveSelected = (dir: number) => {
    if (!selectedUnit) return;
    if (act({ type: 'move', unitId: selectedUnit.id, dir: dir as Dir })) {
      const still = session.view().myUnits.find((u) => u.id === selectedUnit.id);
      if (still) {
        // A step that explored new ground has already re-fitted the map (when auto-fit is on).
        if (fitOf(view.me).auto) keepVisible(still);
        else focus(still);
        // Out of moves: move on to the next unit that needs orders, or deselect when none is left (the map
        // stays put) so only End Turn flashes.
        afterBattle(() => settle(still.id, ready));
      }
    }
  };

  /** The Fit button and Z: turns auto-fit back on, forgets the old zoom ceiling and fits now. */
  const requestFit = () => {
    const v = session.view();
    const f = fitOf(v.me);
    f.auto = true;
    f.ceiling = null;
    exploredAt.current.set(v.me, exploredCount(v));
    applyAutoFit(v, selectedUnit ? v.myUnits.find((u) => u.id === selectedUnit.id) ?? null : null);
  };

  const doAction = (id: ActionId) => {
    if (!playing) return;
    if (id !== 'info') setInfoId(null);
    if (id === 'endTurn') {
      act({ type: 'endTurn' });
      return;
    }
    // Space and Tab on a unit that has orders just move on, leaving its orders alone.
    if (id === 'next' || ((id === 'skip' || id === 'hold') && selectedUnit?.orders)) {
      const next = nextReadyAfter(ready, selectedUnit?.id ?? null);
      if (next) selectUnit(next);
      return;
    }
    if (id === 'fit') {
      requestFit();
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
        else if (readyNow(held, next).length === 0) setSelection(null);
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
      case 'repair': return order(u, { type: 'goHome', unitId: u.id, repair: true });
      case 'clearOrders': return setOrders(u, null);
      case 'goHome': return order(u, { type: 'goHome', unitId: u.id });
      case 'disband':
        if (window.confirm('Disband this unit?')) order(u, { type: 'disband', unitId: u.id });
        return;
      case 'info':
        setInfoId(u.id);
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
    if (!playing || dialogOpen) return;
    const explored = view.terrain[p.y * view.width + p.x] !== null;
    if (group) {
      // Group mode swallows clicks: only the Move To square is meaningful.
      if (group.step !== 'target') return;
      if (!explored) {
        setMessage('That square has not been explored.');
        return;
      }
      applyGroup('moveTo', group.ids, p);
      return;
    }
    if (target && selectedUnit) {
      if (!explored) {
        setMessage('That square has not been explored.');
        return;
      }
      const mode = target;
      setTarget(null);
      if (mode === 'moveTo') giveRoute(selectedUnit, { kind: 'goto', target: p }, p);
      else giveRoute(selectedUnit, { kind: 'patrol', a: { x: selectedUnit.x, y: selectedUnit.y }, b: p, toB: true }, p);
      return;
    }
    if (selectedUnit && targets.some((t) => t.x === p.x && t.y === p.y)) {
      const dir = dirTo(view, selectedUnit, p);
      if (dir !== null) return moveSelected(dir);
    }
    // Your own city opens its screen when nothing is selected, or when the selected unit stands in it.
    const own = view.myCities.find((c) => c.x === p.x && c.y === p.y);
    if (own && (!selectedUnit || (selectedUnit.x === own.x && selectedUnit.y === own.y))) {
      // With nothing selected the city is selected too, so the side panel shows its picture, strength and garrison.
      if (!selectedUnit) setSelection({ kind: 'city', id: own.id });
      return openCity(own.id);
    }
    const city = view.knownCities.find((c) => c.x === p.x && c.y === p.y);
    if (city && !selectedUnit) return setSelection({ kind: 'city', id: city.id });
    if (city && selectedUnit) {
      // A city click with a unit selected is an order: go into an own city, or move up to a hostile one.
      if (city.owner === view.me) return giveRoute(selectedUnit, { kind: 'goto', target: p }, p);
      if (dirTo(view, selectedUnit, p) !== null) {
        setMessage('That unit cannot attack this city now.');
        return;
      }
      const approach = approachSquare(view, selectedUnit, p);
      if (approach === null) {
        setNoPath(p);
        return;
      }
      return giveRoute(selectedUnit, { kind: 'goto', target: approach }, p);
    }
    const unit = view.myUnits.find((u) => u.x === p.x && u.y === p.y && u.carriedBy === null);
    // A host with room for the selected unit (a carrier for a fighter, a transport for an army) is a boarding
    // order, not a selection. Press Esc first to select the host itself.
    if (unit && selectedUnit && unit.id !== selectedUnit.id && explored
      && UNIT_STATS[unit.type].carries === selectedUnit.type
      && view.myUnits.filter((c) => c.carriedBy === unit.id).length < cargoCapacity(unit)) {
      return giveRoute(selectedUnit, { kind: 'goto', target: p }, p);
    }
    if (unit) return setSelection({ kind: 'unit', id: unit.id });
    // An enemy unit seen here: say what it is (with nothing selected the panel shows it; otherwise the click is still an order).
    const foe = view.enemies.filter((e) => e.x === p.x && e.y === p.y)
      .sort((a, b) => Number(b.visibleNow) - Number(a.visibleNow) || b.turnSeen - a.turnSeen)[0];
    if (foe && !selectedUnit) return setSelection({ kind: 'enemy', id: foe.markerId });
    if (foe) setMessage(`${UNIT_STATS[foe.type].name} of ${view.players[foe.owner].name}${foe.visibleNow ? '' : ' (last seen)'}`);
    if (selectedUnit && explored) return giveRoute(selectedUnit, { kind: 'goto', target: p }, p);
    setSelection(null);
  };

  /** Double-click on one of your units outside a city opens its info dialog. */
  const onDouble = (p: Pos) => {
    if (!playing || target || group || dialogOpen) return;
    if (view.knownCities.some((c) => c.x === p.x && c.y === p.y)) return;
    const unit = view.myUnits.find((u) => u.x === p.x && u.y === p.y && u.carriedBy === null);
    if (!unit) return;
    setSelection({ kind: 'unit', id: unit.id });
    setInfoId(unit.id); // after the selection change, which clears it
  };

  const onContext = (_p: Pos, client: { x: number; y: number }) => {
    if (!playing || dialogOpen) return;
    if (group) return cancelGroup();
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

  const onHover = (p: Pos | null) => {
    setHover((prev) => (prev?.x === p?.x && prev?.y === p?.y ? prev : p));
    // The preview held back after an order resumes once the pointer reaches another square.
    if (frozen && !samePos(frozen, p)) setFrozen(null);
    if (noPath && !samePos(noPath, p)) setNoPath(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (replay) {
        // During the replay only these keys do anything: Space and Enter go to the next fight, Esc ends the replay.
        if (e.key === 'Escape') {
          e.preventDefault();
          finishReplay();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          advanceReplay();
        }
        return;
      }
      if (dialogOpen) return; // the city screen and the reports take their own keys
      const tag = (e.target as HTMLElement).tagName;
      // Keys typed into form controls or focused buttons keep their native behavior.
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;
      const a = keyToAction(e.key, e.code);
      if (!a) return;
      if (a.kind === 'escape') {
        e.preventDefault();
        if (group) cancelGroup();
        else if (menu) setMenu(null);
        else if (info) setInfoId(null);
        else if (picker) setPicker(null);
        else if (target) setTarget(null);
        else setSelection(null);
        return;
      }
      if (picker || info) return; // the picker and the info dialog are modal
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
        cancelGroup();
        doAction(a.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Minimap, with the selected unit or city blinking on it so you can tell where in the world it is. The blink has its own
  // timer: only the minimap is redrawn, not the whole screen.
  const minimapMarker = playing ? selectedPos : null;
  useEffect(() => {
    const c = document.querySelector('canvas.minimap') as HTMLCanvasElement | null;
    if (!c) return;
    const { w, h } = viewport();
    const ping = replay ? replay.steps[replay.index].at : null;
    const draw = (on: boolean) => drawMinimap(c.getContext('2d')!, view, colors, c.width, c.height, cam, w, h, ping, on ? minimapMarker : null);
    draw(true);
    if (!minimapMarker) return;
    let on = true;
    const id = window.setInterval(() => { on = !on; draw(on); }, 400);
    return () => window.clearInterval(id);
  }, [view, cam.x, cam.y, cam.tile, replay?.index, replay !== null, minimapMarker?.x, minimapMarker?.y]);

  const lookup = {
    unit: (id: number) => session.unitInfo(view.me, id),
    city: (id: number) =>
      view.myCities.find((c) => c.id === id)?.name ?? view.knownCities.find((c) => c.id === id)?.name,
  };
  // Rebuilt only when the view changes, so the log component below skips blink-free re-renders.
  const logLines = useMemo(
    () => session.log(view.me)
      .map((entry) => ({ turn: entry.turn, text: describeEvent(entry.event, view.me, names, lookup) }))
      .filter((l): l is LogLine => l.text !== null)
      .slice(-40)
      .reverse(),
    [view],
  );

  // Reports: battles others started since your last turn (from the log), and recent enemy sightings (from fog).
  const battles = useMemo(() => battlesAgainstMe(session.log(view.me), view.me, names, lookup), [view]);
  const sightings = useMemo(() => recentSightings(view, names), [view]);
  // Which way each of your units last moved, so a ship or aircraft picture can face the way it is going.
  const headingLeft = useMemo(() => unitsHeadingLeft(session.log(view.me), view.width, view.wrap, view.me), [view]);
  /** Centers the map on a square from a report and flashes it for a few seconds. */
  const pendingFights = replay ? replay.steps.slice(replay.index + (playedStep >= replay.index ? 1 : 0)) : undefined;
  const showAt = (p: Pos, fight?: Fight) => {
    // The reports dialog sits mid-screen, so put the square in the left third instead of dead centre.
    const { w, h } = viewport();
    // A battle is zoomed in on and played out again (never zooming out), with its sounds.
    const tile = fight ? Math.max(camNow.current.tile, REPLAY_TILE) : camNow.current.tile;
    setCam(centerOn({ ...camNow.current, tile }, p.x + (w / tile) * 0.2, p.y, w, h));
    if (fight) {
      runFx([fight], REPLAY_FX_MS);
      play('shot');
      window.setTimeout(() => { if (fight.destroyed || fight.captured) play('explosion'); }, REPLAY_FX_MS * SHOT_SHARE);
    }
    setFlash(p);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3000);
  };
  // Stable handlers so the memoised side panel is not re-rendered by hover or camera changes.
  const latest = useRef({ doAction, act, openCity, select: (id: number) => setSelection({ kind: 'unit', id }) });
  latest.current = { doAction, act, openCity, select: (id: number) => setSelection({ kind: 'unit', id }) };
  const stable = useMemo(() => ({
    onAction: (id: ActionId) => latest.current.doAction(id),
    onSelectUnit: (id: number) => latest.current.select(id),
    onOpenCity: (id: number) => latest.current.openCity(id),
    onProduction: (cityId: number, unitType: UnitType | null) => { latest.current.act({ type: 'setProduction', cityId, unitType }); },
  }), []);
  const groupHint = !playing || !group ? null
    : group.step === 'box' ? message ?? 'Group: drag a box over your units (Esc cancels).'
    : group.step === 'target' ? `Move To for ${group.ids.length} ${group.ids.length === 1 ? 'unit' : 'units'}: click a square (Esc cancels).`
    : `${group.ids.length} ${group.ids.length === 1 ? 'unit' : 'units'} in the box.`;
  const nothingLeft =view.myUnits.length === 0 && view.myCities.length === 0;
  const allMoved = playing && ready.length === 0 && !nothingLeft;
  const endTurnBlinks = playing && ready.length === 0;
  const current = view.players[view.currentPlayer];

  const pickerUnit = picker && selectedUnit ? selectedUnit : null;
  const cargo = pickerUnit ? view.myUnits.filter((c) => c.carriedBy === pickerUnit.id).sort((a, b) => a.id - b.id) : [];

  /** Saves under the game's own name when it has one (and `keepName`), otherwise asks for a name first. */
  const save = (keepName: boolean) => {
    const name = keepName ? session.name : window.prompt('Save name?', session.name === 'autosave' ? 'My game' : session.name);
    if (!name) return;
    session.saveAs(name)
      .then(() => setMessage(`Saved as "${name}".`))
      .catch((e) => setMessage(`Save failed: ${(e as Error).message}`));
  };

  return (
    <div class={dialogOpen ? 'game modal' : 'game'}>
      <header class="topbar">
        <span title={view.wrap ? 'This map wraps east-west' : 'This map does not wrap'}>Turn {view.turn}</span>
        <span><span class="swatch" style={{ background: colors[view.currentPlayer] }} /> {current.name}</span>
        <OrdersMenu view={view} unit={playing ? selectedUnit : null} at={null} onAction={doAction} onClose={() => {}} />
        <button onClick={(e) => { blur(e); save(session.name !== 'autosave'); }}>Save</button>
        <button onClick={(e) => { blur(e); save(false); }}>Save As…</button>
        <button onClick={(e) => { blur(e); downloadSave(session.toSave()); }}>Export</button>
        <button onClick={(e) => { blur(e); setSoundOpen(true); }}>Settings</button>
        <button onClick={(e) => { blur(e); onQuit(); }}>Quit</button>
        <span class="topbar-right">
          {target && <span class="message" role="status">{target === 'moveTo' ? 'Move to' : 'Patrol to'}: click a square (Esc cancels).</span>}
          {!target && groupHint && <span class="message" role="status">{groupHint}</span>}
          {!target && !groupHint && message && <span class="message" role="status">{message}</span>}
          {!target && !groupHint && !message && playing && nothingLeft && <span class="message" role="status">You have no cities or units left.</span>}
          {!target && !groupHint && !message && allMoved && <span class="message" role="status">All units have moved. Press Enter or click End Turn.</span>}
          {session.saveError && <span class="error" role="alert">{session.saveError}</span>}
          <button class={endTurnBlinks ? 'primary blink' : 'primary'} onClick={(e) => { blur(e); play('click'); act({ type: 'endTurn' }); }} disabled={!playing}>End Turn</button>
        </span>
      </header>
      <div class="mapcol">
        <StatusLine
          unit={playing ? selectedUnit : null} onFit={requestFit} onCenter={() => { if (selectedPos) focus(selectedPos); }} prodMap={prodMap} onToggleProdMap={() => setProdMap(!prodMap)}
          routesMap={routesMap} onToggleRoutes={() => setRoutesMap(!routesMap)}
          onUnits={() => { setTarget(null); setMenu(null); setUnitsOpen(true); }}
          onReports={() => { setTarget(null); setMenu(null); setReportTab(battles.length > 0 ? 'combat' : 'status'); }}
          battleCount={battles.length}
          groupActive={group !== null} onGroup={toggleGroup}
          canDeselect={selection !== null} onDeselect={() => { setTarget(null); setSelection(null); }}
        />
        <MapCanvas
          view={view} cam={cam} setCam={setCamRaw} selected={selectedPos} targets={targets} colors={colors}
          onSquare={onSquare} onDouble={onDouble} onHover={onHover} onContext={onContext}
          activeId={playing ? selectedUnit?.id ?? null : null} blinkActive={playing}
          path={preview?.path ?? null} pathOk={preview?.ok ?? true} pathLabel={preview?.label ?? null} pathTarget={preview ? hover : null}
          route={route?.path ?? null} routeLabel={route?.label ?? null} patrols={patrols} productionMap={prodMap} flash={flash} fx={fx} pending={pendingFights} headingLeft={headingLeft} cityRoutes={cityRoutes} attack={attack}
          onZoom={() => { fitOf(view.me).auto = false; }}
          boxMode={playing && group?.step === 'box'} groupBox={groupBox} onBox={setGroupBox} onBoxDone={onBoxDone}
        />
        {replay && (
          <div class="replay-bar" role="status">
            <span class="replay-text">
              {replay.steps[replay.index].text}
              {(() => {
                const near = placeNote(replay.steps[replay.index].at, view.knownCities, (a, b) => chebyshev(view as unknown as MapLike, a, b));
                const at = replay.steps[replay.index].at;
                return <span class="muted"> {near ? `${near}, ` : ''}at {at.x},{at.y}</span>;
              })()}
            </span>
            <span class="muted">{replay.index + 1} of {replay.steps.length + replay.more}</span>
            {getReplayPace() !== 'manual' && (
              <button onClick={(e) => { blur(e); setReplayPaused(!replayPaused); }}>{replayPaused ? 'Resume' : 'Pause'}</button>
            )}
            <button class="primary" onClick={(e) => { blur(e); advanceReplay(); }}>{replay.index + 1 < replay.steps.length ? 'Next' : 'Done'}</button>
            <button onClick={(e) => { blur(e); finishReplay(); }}>Skip</button>
          </div>
        )}
      </div>
      <div class="side">
        <canvas class="minimap" width={200} height={140} onClick={(e) => {
          const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * view.width);
          const y = Math.floor(((e.clientY - r.top) / r.height) * view.height);
          focus({ x, y });
        }} />
        <SidePanel
          view={view}
          myColor={colors[view.me]}
          enemyColor={selection?.kind === 'enemy' ? colors[view.enemies.find((e) => e.markerId === selection.id)?.owner ?? view.me] : colors[view.me]}
          selection={selection}
          onSelectUnit={stable.onSelectUnit}
          onProduction={stable.onProduction}
          onAction={stable.onAction}
          onOpenCity={stable.onOpenCity}
          readyCount={ready.length}
        />
        <GameLog lines={logLines} />
      </div>
      {info && selectedUnit && playing && (
        <div class="overlay">
          <UnitInfo
            key={selectedUnit.id} view={view} unit={selectedUnit}
            onRename={(name) => { act({ type: 'renameUnit', unitId: selectedUnit.id, name: name.trim() === '' ? null : name.trim() }); }}
            onOrders={(at) => setMenu({
              x: Math.max(0, Math.min(at.x, window.innerWidth - MENU_W)),
              y: Math.max(0, Math.min(at.y, window.innerHeight - MENU_H)),
            })}
            onClose={() => setInfoId(null)}
          />
        </div>
      )}
      {menu && selectedUnit && (
        <OrdersMenu view={view} unit={selectedUnit} at={menu} onAction={doAction} onClose={() => setMenu(null)} />
      )}
      {playing && group?.step === 'order' && !dialogOpen && (
        <GroupDialog view={view} unitIds={group.ids} onPick={pickGroupOrder} onCancel={cancelGroup} />
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
              const r = unloadAndLand(session, pickerUnit.id, ids.length === cargo.length ? null : ids);
              // Same refresh as act(), also after a partial run (orders cleared, unload done, a later move failed).
              afterOwnAct();
              if (typeof r === 'string') {
                setMessage(r);
                return;
              }
              const cargoType = cargo.find((c) => ids.includes(c.id))?.type ?? 'army';
              if (UNIT_STATS[pickerUnit.type].carries === 'army') {
                const kind = pluralUnit(cargoType, r.landed);
                setMessage(`${unitDisplayName(pickerUnit)} landed ${r.landed} ${kind}${r.aboard > 0 ? `; ${r.aboard} still aboard` : ''}.`);
              } else {
                // Aircraft do not land anywhere: a carrier's cargo is just woken.
                setMessage(`${unitDisplayName(pickerUnit)} unloaded ${ids.length} ${pluralUnit(cargoType, ids.length)}.`);
              }
            }}
          />
        </div>
      )}
      {openCityObj && (
        <CityScreen
          key={openCityObj.id} view={view} city={openCityObj} anchor={anchorFor(openCityObj)} color={colors[view.me]} error={dialogError}
          onPick={(unitType) => { act({ type: 'setProduction', cityId: openCityObj.id, unitType }, true); }}
          onRename={(name) => { act({ type: 'renameCity', cityId: openCityObj.id, name }, true); }}
          onSetRoute={(route) => act({ type: 'setRoute', cityId: openCityObj.id, route }, true)}
          onSelectUnit={(id) => { const u = view.myUnits.find((x) => x.id === id); if (u) selectUnit(u); }}
          onClose={() => setCityOpen(null)}
        />
      )}
      {reportTab !== null && (
        <Reports
          view={view} colors={colors} tab={reportTab} battles={battles} sightings={sightings} onShow={showAt}
          onClose={() => setReportTab(null)}
        />
      )}
      {eliminated.length > 0 && <EliminationNotice view={view} ids={eliminated} onOk={() => setEliminated([])} />}
      {soundOpen && <SettingsDialog onClose={() => setSoundOpen(false)} />}
      {unitsOpen && (
        <UnitList
          view={view}
          onSelect={(id) => {
            const u = view.myUnits.find((x) => x.id === id);
            setUnitsOpen(false);
            if (u) selectUnit(u);
          }}
          onClose={() => setUnitsOpen(false)}
        />
      )}
      {report && reportCity && (
        <ProductionReport
          key={report.unitId} view={view} report={report} anchor={anchorFor(reportCity)} error={dialogError}
          onRename={(name) => { act({ type: 'renameUnit', unitId: report.unitId, name: name.trim() === '' ? null : name.trim() }, true); }}
          onProd={() => openCity(reportCity.id)}
          onOk={nextReport}
        />
      )}
      {session.phase === 'handoff' && (
        <div class="overlay handoff">
          <div class="card">
            <h2>Pass to {session.seats[view.currentPlayer].name}</h2>
            <button class="primary" onClick={(e) => { blur(e); session.confirmHandoff(); }}>I'm ready</button>
          </div>
        </div>
      )}
      {session.phase === 'over' && !revealed && view.winner !== null && (
        // A human win shows the Victory card, a computer win the Defeated one.
        <div class="overlay victory">
          <img
            src={session.seats[view.winner].kind === 'human' ? '/art/victory.webp' : '/art/defeat.webp'}
            alt={session.seats[view.winner].kind === 'human' ? 'Victory' : 'Defeated'}
          />
          <div class="victory-bar">
            <h2>{names[view.winner]} wins!</h2>
            <button class="primary" onClick={onQuit}>New game</button>
            <button onClick={() => setRevealed(true)}>View map</button>
          </div>
        </div>
      )}
      {session.phase === 'over' && !revealed && view.winner === null && (
        <div class="overlay">
          <div class="card">
            <h2>Game over: no survivors</h2>
            <button class="primary" onClick={onQuit}>New game</button>
            <button onClick={() => setRevealed(true)}>View map</button>
          </div>
        </div>
      )}
    </div>
  );
}




