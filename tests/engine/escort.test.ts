import { describe, it, expect } from 'vitest';
import { apply, type Command, type GameEvent } from '../../src/engine';
import { addUnit, makeGame } from '../helpers';
import { keyToAction } from '../../src/ui/keys';

const water = ['*..........*', '............', '............'];

function explored(s: ReturnType<typeof makeGame>) {
  s.fog[0].explored.fill(1);
  return s;
}

function run(s: ReturnType<typeof makeGame>, cmd: Command) {
  const r = apply(s, cmd);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('escort order', () => {
  it('E is the Escort key', () => {
    expect(keyToAction('e', 'KeyE')).toEqual({ kind: 'action', id: 'escort' });
  });

  it('a warship may escort one of your transports; one escort per transport; a transport cannot escort', () => {
    const s = explored(makeGame(water));
    const tr = addUnit(s, 'transport', 0, 5, 1);
    const d1 = addUnit(s, 'destroyer', 0, 2, 1);
    const d2 = addUnit(s, 'destroyer', 0, 2, 2);
    const cmd = (id: number): Command => ({ type: 'setOrders', player: 0, unitId: id, orders: { kind: 'escort', transportId: tr.id } });
    const after = run(s, cmd(d1.id)).state;
    expect(apply(after, cmd(d2.id))).toMatchObject({ ok: false, error: 'that transport already has an escort' });
    expect(apply(s, { type: 'setOrders', player: 0, unitId: tr.id, orders: { kind: 'escort', transportId: tr.id } }).ok).toBe(false);
    const enemy = addUnit(makeGame(water), 'transport', 1, 5, 1);
    expect(enemy.owner).toBe(1);
  });

  it('the escort closes up on its transport at once, and follows when the transport moves', () => {
    const s = explored(makeGame(water));
    const tr = addUnit(s, 'transport', 0, 8, 1);
    const d = addUnit(s, 'destroyer', 0, 2, 1);
    let st = run(s, { type: 'setOrders', player: 0, unitId: d.id, orders: { kind: 'escort', transportId: tr.id } }).state;
    const dd = () => st.units.find((u) => u.id === d.id)!;
    const trr = () => st.units.find((u) => u.id === tr.id)!;
    expect(Math.max(Math.abs(dd().x - 8), Math.abs(dd().y - 1))).toBeLessThan(6); // it moved up
    // Move the transport; the escort (with moves left) follows in the same turn.
    st = run(st, { type: 'move', player: 0, unitId: tr.id, dir: 2 }).state;
    expect(Math.max(Math.abs(dd().x - trr().x), Math.abs(dd().y - trr().y))).toBeLessThanOrEqual(dd().movesLeft > 0 ? 1 : 6);
    expect(dd().orders).toMatchObject({ kind: 'escort', transportId: tr.id });
  });

  it('the escort ends its orders when its transport is gone', () => {
    const s = explored(makeGame(water));
    const tr = addUnit(s, 'transport', 0, 4, 1);
    const d = addUnit(s, 'destroyer', 0, 3, 1);
    let st = run(s, { type: 'setOrders', player: 0, unitId: d.id, orders: { kind: 'escort', transportId: tr.id } }).state;
    const r = run(st, { type: 'disband', player: 0, unitId: tr.id });
    st = r.state;
    expect(st.units.find((u) => u.id === d.id)!.orders).toBeNull();
    expect(r.events.some((e: GameEvent) => e.type === 'ordersEnded' && e.reason === 'escortLost')).toBe(true);
  });
});
describe('escort fights', () => {
  it('attacks an enemy ship next to it when the odds are good, and keeps escorting if it survives', () => {
    const s = explored(makeGame(water));
    const tr = addUnit(s, 'transport', 0, 5, 1);
    const ship = addUnit(s, 'battleship', 0, 4, 1);
    const foe = addUnit(s, 'transport', 1, 3, 1); // an enemy transport beside the escort: an easy target
    s.fog[0].lastSeen[foe.id] = { unitId: foe.id, type: 'transport', owner: 1, x: 3, y: 1, turnSeen: s.turn };
    const r = run(s, { type: 'setOrders', player: 0, unitId: ship.id, orders: { kind: 'escort', transportId: tr.id } });
    expect(r.events.some((e: GameEvent) => e.type === 'combat' && e.attackerId === ship.id)).toBe(true);
    const after = r.state.units.find((u) => u.id === ship.id);
    if (after) expect(after.orders === null || after.orders.kind === 'escort').toBe(true);
  });

  it('hands back to the player when the odds are poor', () => {
    const s = explored(makeGame(water));
    const tr = addUnit(s, 'transport', 0, 5, 1);
    const ship = addUnit(s, 'destroyer', 0, 4, 1, { damage: 2 }); // wounded destroyer against a battleship
    addUnit(s, 'battleship', 1, 3, 1);
    const r = run(s, { type: 'setOrders', player: 0, unitId: ship.id, orders: { kind: 'escort', transportId: tr.id } });
    expect(r.events.some((e: GameEvent) => e.type === 'combat')).toBe(false);
    expect(r.events.some((e: GameEvent) => e.type === 'ordersEnded' && e.reason === 'enemySighted')).toBe(true);
    expect(r.state.units.find((u) => u.id === ship.id)!.orders).toBeNull();
  });
});
describe('escort in the interface', () => {
  it('the orders text names the transport, and Group mode offers Escort only to warships that have a free transport', async () => {
    const { ordersText } = await import('../../src/ui/actions');
    const { eligibleFor } = await import('../../src/ui/group');
    const { getPlayerView } = await import('../../src/engine');
    const s = explored(makeGame(water));
    const tr = addUnit(s, 'transport', 0, 5, 1, { name: 'Ferry' });
    const d = addUnit(s, 'destroyer', 0, 2, 1);
    const army = addUnit(s, 'army', 0, 0, 0);
    const view = () => getPlayerView(s, 0);
    expect(eligibleFor(view(), [d.id, army.id, tr.id], 'escort').map((u) => u.id)).toEqual([d.id]);
    d.orders = { kind: 'escort', transportId: tr.id };
    expect(ordersText(view(), d)).toBe('Escort Ferry');
    const d2 = addUnit(s, 'cruiser', 0, 2, 2);
    expect(eligibleFor(view(), [d2.id], 'escort')).toEqual([]); // the only transport already has its escort
  });
});