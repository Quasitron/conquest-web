import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/app/session';
import { RULES_VERSION, unitDisplayName } from '../../src/engine';
import { describeEvent } from '../../src/ui/describe';
import { unloadAndLand } from '../../src/app/unloadAndLand';
import { addUnit, makeGame } from '../helpers';
import { hashState } from '../../src/engine/hash';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen';
import { MemorySaveStore, parseSave, serializeSave, type SeatConfig } from '../../src/storage';

const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.small };
const human = (name: string): SeatConfig => ({ name, kind: 'human', color: '#d7263d' });
const idle = (name: string): SeatConfig => ({ name, kind: 'idle', color: '#1b98e0' });

describe('GameSession', () => {
  it('plays Idle seats automatically and returns to the human', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, null);
    expect(s.phase).toBe('playing');
    expect(s.state.currentPlayer).toBe(0);
    expect(s.act({ type: 'endTurn' })).toBeNull();
    expect(s.state.currentPlayer).toBe(0);
    expect(s.state.turn).toBe(2);
    expect(s.phase).toBe('playing');
  });

  it('runs a hotseat hand-off between humans and blocks commands during it', () => {
    const s = GameSession.create({ world: { ...world, players: 2 }, seed: 5, seats: [human('Ann'), human('Ben')] }, null);
    expect(s.phase).toBe('handoff');
    expect(s.act({ type: 'endTurn' })).toMatch(/not accepting/);
    s.confirmHandoff();
    expect(s.phase).toBe('playing');
    expect(s.act({ type: 'endTurn' })).toBeNull();
    expect(s.phase).toBe('handoff');
    expect(s.viewer).toBe(1);
  });

  it('does not show the previous player events after a hand-off', () => {
    const s = GameSession.create({ world: { ...world, players: 2 }, seed: 5, seats: [human('Ann'), human('Ben')] }, null);
    s.confirmHandoff();
    expect(s.act({ type: 'endTurn' })).toBeNull();
    expect(s.phase).toBe('handoff');
    expect(s.lastEvents).toEqual([]);
    s.confirmHandoff();
    expect(s.lastEvents).toEqual([]);
  });

  it('reports a failed autosave without an unhandled rejection, and clears it after a good save', async () => {
    class FlakyStore extends MemorySaveStore {
      failing = true;
      override async put(save: Parameters<MemorySaveStore['put']>[0]): Promise<void> {
        if (this.failing) throw new Error('quota exceeded');
        return super.put(save);
      }
    }
    const store = new FlakyStore();
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, store);
    const tick = () => new Promise((r) => setTimeout(r, 0));
    await tick();
    expect(s.saveError).toBe('autosave failed: quota exceeded');
    store.failing = false;
    expect(s.act({ type: 'endTurn' })).toBeNull();
    await tick();
    expect(s.saveError).toBeNull();
  });

  it('a loaded hotseat game starts at the hand-off screen', () => {
    const store = new MemorySaveStore();
    const s = GameSession.create({ world: { ...world, players: 2 }, seed: 5, seats: [human('Ann'), human('Ben')] }, store);
    const parsed = parseSave(serializeSave(s.toSave('slot')));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(GameSession.fromSave(parsed.save, store).phase).toBe('handoff');
  });

  it('a computer seat plays at its own difficulty, and the difficulty is kept in a save', () => {
    const ai = (difficulty: 'easy' | 'hard'): SeatConfig => ({ name: 'Bot', kind: 'ai', color: '#1b98e0', difficulty });
    const play = (difficulty: 'easy' | 'hard') => {
      const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), ai(difficulty)] }, null);
      for (let i = 0; i < 40; i++) s.act({ type: 'endTurn' });
      return s;
    };
    const easy = play('easy');
    const hard = play('hard');
    expect(hashState(easy.state)).not.toBe(hashState(hard.state)); // the same world, played differently
    const parsed = parseSave(serializeSave(hard.toSave('slot')));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.save.seats[1].difficulty).toBe('hard');
    // A save whose seat has a difficulty that does not exist is refused.
    const bad = JSON.parse(serializeSave(hard.toSave('slot')));
    bad.seats[1].difficulty = 'impossible';
    expect(parseSave(JSON.stringify(bad)).ok).toBe(false);
  });

  it('keeps each player log private', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, null);
    for (let i = 0; i < 9; i++) expect(s.act({ type: 'endTurn' })).toBeNull();
    const botUnits = new Set(s.state.units.filter((u) => u.owner === 1).map((u) => u.id));
    expect(botUnits.size).toBeGreaterThan(0);
    const leaked = s.log(0).filter((e) => e.event.type === 'unitProduced' && botUnits.has(e.event.unitId));
    expect(leaked).toEqual([]);
    expect(s.log(0).some((e) => e.event.type === 'unitProduced')).toBe(true);
  });

  it('autosaves on every turn change, and saves load back identically', async () => {
    const store = new MemorySaveStore();
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, store);
    s.act({ type: 'endTurn' });
    await s.autosave();
    const saved = await store.get('autosave');
    expect(saved).toBeDefined();
    expect(hashState(saved!.snapshot)).toBe(hashState(s.state));
    const parsed = parseSave(serializeSave(saved!));
    if (!parsed.ok) throw new Error(parsed.error);
    const loaded = GameSession.fromSave(parsed.save, store);
    expect(hashState(loaded.state)).toBe(hashState(s.state));
    expect(loaded.phase).toBe('playing');
  });

  it('an autosave remembers the game name, and continuing it restores that name', async () => {
    const store = new MemorySaveStore();
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, store);
    await s.autosave();
    expect((await store.get('autosave'))!.gameName).toBeUndefined();
    await s.saveAs('Rob Test');
    // Saving under a name refreshes the autosave at once, with no turn change needed.
    const auto = (await store.get('autosave'))!;
    expect(auto.gameName).toBe('Rob Test');
    expect(GameSession.fromSave(auto, store).name).toBe('Rob Test');
    // A named save keeps its own name and carries no gameName.
    const named = (await store.get('Rob Test'))!;
    expect(named.gameName).toBeUndefined();
    expect(GameSession.fromSave(named, store).name).toBe('Rob Test');
  });

  it('toSave does not alias the live command log', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, null);
    s.act({ type: 'endTurn' });
    const save = s.toSave('slot');
    const before = save.commands.length;
    expect(s.act({ type: 'endTurn' })).toBeNull();
    expect(save.commands.length).toBe(before);
  });

  it('passes house rules through to the game', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')], rules: { easierNeutralCities: true } }, null);
    expect(s.view().rules.easierNeutralCities).toBe(true);
    expect(s.view().rules.fairFirstTurn).toBe(false);
    expect(s.view().rules.sentriedStayAsGarrison).toBe(false);
  });

  it('validates seats', () => {
    expect(() => GameSession.create({ world, seed: 1, seats: [human('Ann')] }, null)).toThrow(/seat/);
    expect(() => GameSession.create({ world, seed: 1, seats: [idle('A'), idle('B')] }, null)).toThrow(/human/);
  });

  it('notifies subscribers and reports engine errors', () => {
    const s = GameSession.create({ world, seed: 5, seats: [human('Ann'), idle('Bot')] }, null);
    let calls = 0;
    const off = s.subscribe(() => calls++);
    expect(s.act({ type: 'move', unitId: 999, dir: 0 })).toMatch(/no such unit/);
    expect(s.act({ type: 'endTurn' })).toBeNull();
    off();
    s.act({ type: 'endTurn' });
    expect(calls).toBe(1);
  });
});

describe('GameSession unit roster', () => {
  function duel() {
    const g = makeGame(['*#*', '###']);
    const a = addUnit(g, 'army', 0, 0, 1);
    const b = addUnit(g, 'army', 1, 1, 1);
    const seats = [human('Ann'), human('Ben')];
    const s = GameSession.fromSave(
      { format: 3, rulesVersion: RULES_VERSION, savedAt: '', name: 't', seats, initial: g, commands: [], snapshot: g },
      null,
    );
    s.confirmHandoff();
    return { s, a, b };
  }

  it('never lets one player see another player custom unit name', () => {
    const { s, a, b } = duel();
    expect(s.act({ type: 'renameUnit', unitId: a.id, name: 'Secret' })).toBeNull();
    expect(s.unitInfo(0, a.id)).toEqual({ type: 'army', name: 'Secret' });
    expect(s.unitInfo(1, a.id)).toBeUndefined();
    expect(s.unitInfo(1, b.id)).toEqual({ type: 'army', name: unitDisplayName(b) });
    const lookup = { unit: (id: number) => s.unitInfo(1, id), city: () => undefined };
    const lines = s.log(1).map((e) => describeEvent(e.event, 1, ['Ann', 'Ben'], lookup) ?? '');
    expect(lines.join('\n')).not.toContain('Secret');
  });

  it('still resolves the name of a unit destroyed in combat for its owner', () => {
    const { s, a, b } = duel();
    s.act({ type: 'renameUnit', unitId: a.id, name: 'Secret' });
    expect(s.act({ type: 'move', unitId: a.id, dir: 2 })).toBeNull();
    const survivors = s.state.units.map((u) => u.id);
    expect(survivors.length).toBe(1);
    expect(s.unitInfo(0, a.id)?.name).toBe('Secret');
    expect(s.unitInfo(1, b.id)?.type).toBe('army');
    expect(s.unitInfo(1, a.id)).toBeUndefined();
  });
});
describe('unloadAndLand', () => {
  function setup(at: { x: number; y: number }) {
    const g = makeGame(['*#.#.', '.....', '....*']);
    const t = addUnit(g, 'transport', 0, at.x, at.y, { orders: { kind: 'goto', target: { x: 4, y: 1 } } });
    const armies = [1, 2, 3].map(() => addUnit(g, 'army', 0, at.x, at.y, { carriedBy: t.id, orders: { kind: 'sentry' } }));
    const seats = [human('Ann'), human('Ben')];
    const s = GameSession.fromSave(
      { format: 3, rulesVersion: RULES_VERSION, savedAt: '', name: 't', seats, initial: g, commands: [], snapshot: g },
      null,
    );
    s.confirmHandoff();
    return { s, t, armies };
  }

  it('at sea clears the orders, lands what fits ashore and leaves the rest aboard awake', () => {
    const { s, t, armies } = setup({ x: 2, y: 1 });
    expect(unloadAndLand(s, t.id, null)).toEqual({ landed: 2, aboard: 1 });
    const units = s.view().myUnits;
    expect(units.find((u) => u.id === t.id)!.orders).toBeNull();
    const landed = armies.map((a) => units.find((u) => u.id === a.id)!).filter((u) => u.carriedBy === null);
    expect(landed).toHaveLength(2);
    expect(landed.every((u) => [1, 3].includes(u.x) && u.y === 0)).toBe(true);
    const left = units.filter((u) => u.carriedBy === t.id);
    expect(left).toHaveLength(1);
    expect(left[0].orders).toBeNull();
  });

  it('only lands the chosen armies', () => {
    const { s, t, armies } = setup({ x: 2, y: 1 });
    expect(unloadAndLand(s, t.id, [armies[2].id])).toEqual({ landed: 1, aboard: 2 });
  });

  it('in an own city behaves like a plain unload and clears the orders', () => {
    const { s, t, armies } = setup({ x: 0, y: 0 });
    expect(unloadAndLand(s, t.id, null)).toEqual({ landed: 3, aboard: 0 });
    const units = s.view().myUnits;
    expect(units.find((u) => u.id === t.id)!.orders).toBeNull();
    for (const a of armies) {
      const u = units.find((x) => x.id === a.id)!;
      expect(u.carriedBy).toBeNull();
      expect([u.x, u.y]).toEqual([0, 0]);
    }
  });

  it('returns the engine error for a unit that is not aboard', () => {
    const { s, t } = setup({ x: 2, y: 1 });
    expect(unloadAndLand(s, t.id, [9999])).toBe('nothing to unload');
  });
});
describe('cargo seen by the UI after a transport leaves a city', () => {
  it('the very next view shows the army that auto-loaded aboard, at the new square', () => {
    const g = makeGame(['*..', '...', '..*']);
    const t = addUnit(g, 'transport', 0, 0, 0);
    const a = addUnit(g, 'army', 0, 0, 0);
    const seats = [human('Ann'), human('Ben')];
    const s = GameSession.fromSave(
      { format: 3, rulesVersion: RULES_VERSION, savedAt: '', name: 't', seats, initial: g, commands: [], snapshot: g },
      null,
    );
    s.confirmHandoff();
    expect(s.view().myUnits.filter((u) => u.carriedBy === t.id)).toHaveLength(0);
    expect(s.act({ type: 'move', unitId: t.id, dir: 2 })).toBeNull();
    const units = s.view().myUnits;
    const army = units.find((u) => u.id === a.id)!;
    expect(army.carriedBy).toBe(t.id);
    expect([army.x, army.y]).toEqual([1, 0]);
    expect(units.filter((u) => u.carriedBy === t.id)).toHaveLength(1);
  });
});
describe('cargo seen after a transport with orders leaves a city', () => {
  function setup(withOrders: boolean) {
    const g = makeGame(['*.........', '..........', '.........*']);
    const t = addUnit(g, 'transport', 0, 0, 0, withOrders ? { orders: { kind: 'goto', target: { x: 1, y: 0 } } } : {});
    const a = addUnit(g, 'army', 0, 0, 0);
    const seats = [human('Ann'), idle('Bot')];
    const s = GameSession.fromSave(
      { format: 3, rulesVersion: RULES_VERSION, savedAt: '', name: 't', seats, initial: g, commands: [], snapshot: g },
      null,
    );
    return { s, t, a };
  }
  const aboard = (s: GameSession, tid: number) => s.view().myUnits.filter((u) => u.carriedBy === tid);

  it('a go-to given with setOrders shows the loaded army in the next view', () => {
    const { s, t, a } = setup(false);
    expect(s.act({ type: 'setOrders', unitId: t.id, orders: { kind: 'goto', target: { x: 1, y: 0 } } })).toBeNull();
    const view = s.view();
    const tr = view.myUnits.find((u) => u.id === t.id)!;
    expect(tr.x).toBeGreaterThan(0);
    const cargo = aboard(s, t.id);
    expect(cargo.map((c) => c.id)).toEqual([a.id]);
    expect([cargo[0].x, cargo[0].y]).toEqual([tr.x, tr.y]);
  });

  it('a standing go-to executed at turn start shows the loaded army in the next view', () => {
    const { s, t, a } = setup(true);
    expect(s.act({ type: 'endTurn' })).toBeNull();
    const tr = s.view().myUnits.find((u) => u.id === t.id)!;
    expect(tr.x).toBeGreaterThan(0);
    const cargo = aboard(s, t.id);
    expect(cargo.map((c) => c.id)).toEqual([a.id]);
    expect([cargo[0].x, cargo[0].y]).toEqual([tr.x, tr.y]);
  });
});