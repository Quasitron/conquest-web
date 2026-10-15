import { describe, it, expect } from 'vitest';
import { GameSession } from '../../src/app/session';
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
    expect(s.lastEvents.length).toBeGreaterThan(0);
    s.confirmHandoff();
    expect(s.lastEvents).toEqual([]);
  });

  it('a loaded hotseat game starts at the hand-off screen', () => {
    const store = new MemorySaveStore();
    const s = GameSession.create({ world: { ...world, players: 2 }, seed: 5, seats: [human('Ann'), human('Ben')] }, store);
    const parsed = parseSave(serializeSave(s.toSave('slot')));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(GameSession.fromSave(parsed.save, store).phase).toBe('handoff');
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
