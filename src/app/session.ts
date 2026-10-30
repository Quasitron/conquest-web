import {
  apply, createGame, eventsFor, getPlayerView,
  RULES_VERSION, UNIT_STATS, unitDisplayName,
  type Command, type Dir, type GameEvent, type GameState, type HouseRules, type PlayerId, type PlayerView, type UnitType,
} from '../engine';
import { playAiTurn } from '../ai/play';
import { generateWorld, type WorldOptions } from '../mapgen';
import type { SaveFile, SaveStore, SeatConfig } from '../storage';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** A command without `player`; the session fills in the current player. */
export type SessionCommand = DistributiveOmit<Command, 'player'>;
export type SessionPhase = 'playing' | 'handoff' | 'over';

export interface LogEntry {
  turn: number;
  event: GameEvent;
}

export interface NewSessionOptions {
  world: WorldOptions;
  seed: number;
  seats: SeatConfig[];
  rules?: Partial<HouseRules>;
}

const IDLE_GUARD = 10_000;

export class GameSession {
  phase: SessionPhase = 'playing';
  /** Events from the last successful act, filtered for the player who acted. */
  lastEvents: GameEvent[] = [];
  /** Set when the last turn-change autosave failed; cleared by the next successful autosave. */
  saveError: string | null = null;
  /** A one-off message about how this game was loaded (e.g. from an older version). */
  notice: string | null = null;
  private logs: LogEntry[][];
  /** Per player: type and display name of each unit they have ever owned. Never holds another player's units. */
  private roster: Map<number, { type: UnitType; name: string }>[];
  private listeners = new Set<() => void>();
  private lastHuman: PlayerId;

  private constructor(
    readonly seats: SeatConfig[],
    readonly initial: GameState,
    public state: GameState,
    readonly commands: Command[],
    private store: SaveStore | null,
    public name: string,
  ) {
    this.logs = seats.map(() => []);
    this.roster = seats.map(() => new Map());
    this.recordRoster(state);
    this.lastHuman = seats.findIndex((s) => s.kind === 'human');
  }

  static create(o: NewSessionOptions, store: SaveStore | null): GameSession {
    if (o.seats.length !== o.world.players) throw new Error('seat count must match the number of players');
    if (!o.seats.some((s) => s.kind === 'human')) throw new Error('at least one seat must be human');
    const world = generateWorld(o.world, o.seed, !!o.rules?.advancedUnits);
    const initial = createGame({
      map: world.map,
      wrap: o.world.wrap,
      players: o.seats.map((s) => ({ name: s.name, kind: s.kind === 'human' ? 'human' : 'ai' })),
      startCityIndices: world.startCityIndices,
      seed: world.seedUsed,
      cityNames: world.cityNames,
      rules: o.rules,
    });
    const session = new GameSession(o.seats, initial, initial, [], store, 'autosave');
    session.afterTurnChange();
    return session;
  }

  static fromSave(save: SaveFile, store: SaveStore | null, note?: string): GameSession {
    // An autosave carries the name of the game it came from, so Save keeps writing to that name.
    const name = save.name === 'autosave' && save.gameName ? save.gameName : save.name;
    const session = new GameSession(save.seats, save.initial, save.snapshot, [...save.commands], store, name);
    session.notice = note ?? null;
    if (save.snapshot.over) {
      session.phase = 'over';
    } else {
      session.lastHuman = save.snapshot.currentPlayer;
      // A loaded hotseat game shows the hand-off screen first, so the next player is not shown a view unannounced.
      const humans = save.seats.filter((s) => s.kind === 'human').length;
      session.phase = humans > 1 ? 'handoff' : 'playing';
    }
    return session;
  }

  /** The human whose view the UI shows. */
  get viewer(): PlayerId {
    if (this.state.over) return this.lastHuman;
    return this.state.currentPlayer;
  }

  view(): PlayerView {
    return getPlayerView(this.state, this.viewer);
  }

  /** The viewer's view with the whole map explored (game-over "View Map"). */
  revealedView(): PlayerView {
    const s = structuredClone(this.state);
    s.fog[this.viewer].explored.fill(1);
    return getPlayerView(s, this.viewer);
  }

  /** A unit the player owns or has owned, for naming it in their log even after it is gone. */
  unitInfo(pid: PlayerId, id: number): { type: UnitType; name: string } | undefined {
    return this.roster[pid]?.get(id);
  }

  log(pid: PlayerId): readonly LogEntry[] {
    return this.logs[pid];
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  act(cmd: SessionCommand): string | null {
    if (this.phase !== 'playing') return 'not accepting commands now';
    const actor = this.state.currentPlayer;
    const full = { ...cmd, player: actor } as Command;
    const result = this.applyCommand(full);
    if (typeof result === 'string') return result;
    this.lastEvents = eventsFor(this.state, result, actor);
    if (full.type === 'endTurn' || full.type === 'resign') this.afterTurnChange();
    else if (this.state.over) this.phase = 'over';
    this.emit();
    return null;
  }

  confirmHandoff(): void {
    if (this.phase !== 'handoff') return;
    this.phase = 'playing';
    // The previous player's events must not be shown to the next player.
    this.lastEvents = [];
    this.emit();
  }

  toSave(name: string = this.name): SaveFile {
    return {
      format: 3,
      rulesVersion: RULES_VERSION,
      savedAt: new Date().toISOString(),
      name,
      ...(name === 'autosave' && this.name !== 'autosave' ? { gameName: this.name } : {}),
      seats: this.seats,
      initial: this.initial,
      commands: [...this.commands],
      snapshot: this.state,
    };
  }

  async saveAs(name: string): Promise<void> {
    if (this.store) await this.store.put(this.toSave(name));
    this.name = name;
    // Refresh the autosave now, so Continue shows (and restores) the new name without waiting for a turn change.
    await this.autosave().catch(() => {});
  }

  async autosave(): Promise<void> {
    if (this.store) await this.store.put(this.toSave('autosave'));
  }

  /** Applies a full command; returns its raw events, or an error message. */
  private applyCommand(cmd: Command): GameEvent[] | string {
    this.recordRoster(this.state);
    const r = apply(this.state, cmd);
    if (!r.ok) return r.error;
    this.state = r.state;
    this.recordRoster(r.state);
    this.commands.push(cmd);
    this.seats.forEach((_, pid) => {
      for (const event of eventsFor(r.state, r.events, pid)) this.logs[pid].push({ turn: r.state.turn, event });
    });
    return r.events;
  }

  private afterTurnChange(): void {
    let guard = 0;
    while (!this.state.over && this.seats[this.state.currentPlayer].kind !== 'human') {
      const pid = this.state.currentPlayer;
      if (this.seats[pid].kind === 'ai') this.runAi(pid);
      if (this.state.over) break;
      this.clearStuckAircraft(pid);
      const r = this.applyCommand({ type: 'endTurn', player: pid });
      if (typeof r === 'string') this.applyCommand({ type: 'resign', player: pid });
      if (++guard > IDLE_GUARD) throw new Error('idle players did not finish');
    }
    if (this.state.over) {
      this.phase = 'over';
    } else {
      this.lastHuman = this.state.currentPlayer;
      const humans = this.seats.filter((s) => s.kind === 'human').length;
      this.phase = humans > 1 ? 'handoff' : 'playing';
      // Entering a hand-off hides the previous player's events from the next player.
      if (this.phase === 'handoff') this.lastEvents = [];
    }
    this.autosave().then(
      () => this.setSaveError(null),
      (e: unknown) => this.setSaveError(`autosave failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  }

  /** Lets the computer player `pid` make all its moves for the turn (the caller then ends the turn). */
  /**
   * A computer player's aircraft may be left sharing a square outside a city (say a Bomber on its way to an Airbase), which
   * the engine will not let a turn end on. Moves such a unit to a free neighbouring square, so the player does not have to
   * resign for it.
   */
  private clearStuckAircraft(pid: PlayerId): void {
    for (let guard = 0; guard < 16; guard++) {
      const s = this.state;
      const stuck = s.units.find((u) =>
        u.owner === pid && UNIT_STATS[u.type].domain === 'air' && u.carriedBy === null
        && !s.cities.some((c) => c.x === u.x && c.y === u.y)
        && s.units.some((o) => o !== u && o.carriedBy === null && o.x === u.x && o.y === u.y));
      if (!stuck) return;
      let best: { dir: Dir; free: boolean } | null = null;
      for (const dir of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
        const r = apply(s, { type: 'move', unitId: stuck.id, dir, player: pid });
        if (!r.ok) continue;
        const moved = r.state.units.find((u) => u.id === stuck.id);
        const free = !!moved && (r.state.cities.some((c) => c.x === moved.x && c.y === moved.y)
          || !r.state.units.some((o) => o !== moved && o.carriedBy === null && o.x === moved.x && o.y === moved.y));
        if (!best || (free && !best.free)) best = { dir, free };
        if (free) break;
      }
      if (!best || typeof this.applyCommand({ type: 'move', unitId: stuck.id, dir: best.dir, player: pid } as Command) === 'string') return;
    }
  }

  private runAi(pid: PlayerId): void {
    try {
      playAiTurn({
        view: () => getPlayerView(this.state, pid),
        act: (cmd) => {
          const r = this.applyCommand({ ...cmd, player: pid } as Command);
          return typeof r === 'string' ? r : null;
        },
      }, this.seats[pid]?.difficulty);
    } catch {
      // A bug in the AI must never freeze the game: it simply ends its turn with what it has done.
    }
  }

  private recordRoster(s: GameState): void {
    for (const unit of s.units) this.roster[unit.owner].set(unit.id, { type: unit.type, name: unitDisplayName(unit) });
  }

  private setSaveError(message: string | null): void {
    if (this.saveError === message) return;
    this.saveError = message;
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
