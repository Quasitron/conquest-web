import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { GameSession } from '../../src/app/session';
import { newMemo, nextAction, portCity, wantedProduction } from '../../src/ai/basic';
import { tuningFor, type Difficulty } from '../../src/ai/difficulty';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen';
import type { SeatConfig } from '../../src/storage';
import { addUnit, makeGame } from '../helpers';

/** Player 1 plays; the whole map is explored so it can plan freely. */
function game(rows: string[], opts: Parameters<typeof makeGame>[1] = {}): GameState {
  const s = makeGame(rows, { ...opts });
  s.currentPlayer = 1;
  for (const c of s.cities) c.production = c.owner === null ? null : 'army';
  s.fog[1].explored.fill(1);
  return s;
}

const view = (s: GameState) => getPlayerView(s, 1);
const next = (s: GameState) => nextAction(view(s), newMemo());

describe('AI production', () => {
  it('a city with nothing in production is set to build armies', () => {
    const s = game(['*###*']);
    s.cities[1].production = null;
    expect(next(s)).toEqual({ type: 'setProduction', cityId: s.cities[1].id, unitType: 'army' });
  });

  it('the port builds a transport only once an army is idle in a city, other cities keep to armies', () => {
    const s = game(['..*##*..']);
    const port0 = portCity(view(s))!;
    expect(wantedProduction(view(s), port0, port0)).toBe('army');
    addUnit(s, 'army', 1, port0.x, port0.y, { orders: { kind: 'sentry' } });
    const v = view(s);
    const port = portCity(v)!;
    expect(wantedProduction(v, port, port)).toBe('transport');
    expect(wantedProduction(v, { ...port, id: port.id + 99 }, port)).toBe('army');
  });
});

describe('AI armies', () => {
  it('attacks a neutral city next to it', () => {
    const s = game(['**#']);
    s.cities[0].owner = null;
    s.cities[0].production = null;
    s.cities[1].owner = 1;
    const a = addUnit(s, 'army', 1, 2, 0);
    // The army stands beside the city at x=1 (its own); a neutral city sits at x=0 two squares away: march on it.
    const cmd = next(s);
    expect(cmd).toMatchObject({ type: 'setOrders', unitId: a.id, orders: { kind: 'goto' } });
  });

  it('steps into a foreign city that is right beside it', () => {
    const s = game(['*#*']);
    s.cities[0].owner = 1;
    s.cities[1].owner = null;
    s.fog[1].knownCityOwner[s.cities[1].id] = null;
    const a = addUnit(s, 'army', 1, 1, 0);
    expect(next(s)).toMatchObject({ type: 'move', unitId: a.id, dir: 2 });
  });

  it('explores when there is unknown ground to reach', () => {
    const s = game(['*####*']);
    s.cities[0].owner = 1;
    s.cities[1].owner = 0;
    s.fog[1].explored = s.fog[1].explored.map((_, i) => (i <= 1 ? 1 : 0));
    const a = addUnit(s, 'army', 1, 0, 0);
    expect(next(s)).toMatchObject({ type: 'setOrders', unitId: a.id, orders: { kind: 'explore' } });
  });

  it('does nothing for a unit it has no plan for', () => {
    const s = game(['*#*']);
    s.cities[0].owner = 1;
    s.cities[1].owner = 0;
    addUnit(s, 'fighter', 1, 0, 0);
    expect(next(s)).toBeNull();
  });
});

describe('AI transports', () => {
  it('stays in port until enough armies are waiting, then sails exploring', () => {
    const s = game(['*..*', '####']);
    s.cities[0].owner = 1;
    s.cities[1].owner = 0;
    s.turn = 10;
    const t = addUnit(s, 'transport', 1, 0, 0);
    for (let i = 0; i < 2; i++) addUnit(s, 'army', 1, 0, 0, { orders: { kind: 'sentry' } });
    expect(next(s)).toBeNull();
    addUnit(s, 'army', 1, 0, 0, { orders: { kind: 'sentry' } });
    expect(next(s)).toMatchObject({ type: 'setOrders', unitId: t.id, orders: { kind: 'explore' } });
  });
});

describe('AI land tactics', () => {
  /** Our city at x=0, a held enemy city at x=6 (player 0), open land between. */
  function front() {
    const s = game(['*#####*']);
    s.cities[0].owner = 1;
    s.cities[1].owner = 0;
    s.fog[1].knownCityOwner[s.cities[1].id] = 0;
    return s;
  }

  const prod = (s: GameState) => { for (const c of s.cities) c.production = c.owner === 1 ? 'army' : null; return s; };

  it('a lone army waits beside a held city instead of assaulting; with enough armies near it attacks', () => {
    const s = front();
    const a = addUnit(s, 'army', 1, 5, 0);
    addUnit(s, 'army', 1, 1, 0, { orders: { kind: 'sentry' } });
    addUnit(s, 'army', 1, 1, 0, { orders: { kind: 'sentry' } });
    expect(next(prod(s))).toBeNull();
    addUnit(s, 'army', 1, 4, 0, { orders: { kind: 'sentry' } });
    addUnit(s, 'army', 1, 4, 1, { orders: { kind: 'sentry' } });
    expect(next(prod(s))).toMatchObject({ type: 'move', unitId: a.id, dir: 2 });
  });

  it('Easy masses more armies before assaulting a held city, Hard needs fewer than Normal', () => {
    const run = (d: Difficulty, near: number) => {
      const s = front();
      const a = addUnit(s, 'army', 1, 5, 0);
      addUnit(s, 'army', 1, 1, 0, { orders: { kind: 'sentry' } });
      addUnit(s, 'army', 1, 1, 0, { orders: { kind: 'sentry' } });
      for (let i = 1; i < near; i++) addUnit(s, 'army', 1, 4, i - 1, { orders: { kind: 'sentry' } });
      // Easy leaves a unit idle on some turns, so look over several turns for one on which it attacks.
      for (let turn = 1; turn <= 20; turn++) {
        s.turn = turn;
        const cmd = nextAction(view(prod(s)), newMemo(d));
        if (cmd !== null && cmd.type === 'move' && cmd.unitId === a.id) return true;
      }
      return false;
    };
    // Three armies beside the city: Normal and Hard attack, Easy (needs five) waits.
    expect([run('easy', 3), run('normal', 3), run('hard', 3)]).toEqual([false, true, true]);
    // Two beside it: only Hard (needs two) attacks.
    expect([run('easy', 2), run('normal', 2), run('hard', 2)]).toEqual([false, false, true]);
    // Five: everyone attacks.
    expect([run('easy', 5), run('normal', 5), run('hard', 5)]).toEqual([true, true, true]);
  });

  it('Easy leaves a unit alone on a quarter of the turns, Normal and Hard never do', () => {
    const acts = (d: Difficulty) => {
      let n = 0;
      for (let turn = 1; turn <= 200; turn++) {
        const s = front();
        s.cities[1].owner = null;
        s.fog[1].knownCityOwner[s.cities[1].id] = null;
        addUnit(s, 'army', 1, 5, 0);
        s.turn = turn;
        if (nextAction(view(prod(s)), newMemo(d)) !== null) n++;
      }
      return n;
    };
    expect(acts('normal')).toBe(200);
    expect(acts('hard')).toBe(200);
    expect(acts('easy')).toBeGreaterThan(110);
    expect(acts('easy')).toBeLessThan(180);
  });
  it('attacks a neutral city alone', () => {
    const s = front();
    s.cities[1].owner = null;
    s.fog[1].knownCityOwner[s.cities[1].id] = null;
    const a = addUnit(s, 'army', 1, 5, 0);
    addUnit(s, 'army', 1, 1, 0, { orders: { kind: 'sentry' } });
    addUnit(s, 'army', 1, 1, 0, { orders: { kind: 'sentry' } });
    expect(next(prod(s))).toMatchObject({ type: 'move', unitId: a.id });
  });

  it('the last two defenders stay in a city with an enemy army in sight, a third may leave', () => {
    const s = front();
    const e = addUnit(s, 'army', 0, 1, 0);
    s.fog[1].lastSeen[e.id] = { unitId: e.id, type: 'army', owner: 0, x: 1, y: 0, turnSeen: s.turn };
    addUnit(s, 'army', 1, 0, 0);
    addUnit(s, 'army', 1, 0, 0);
    expect(next(prod(s))).toBeNull();
    const third = addUnit(s, 'army', 1, 0, 0);
    // Only the surplus army acts (the first two, by id, are kept home).
    expect(next(prod(s))).toMatchObject({ unitId: third.id });
  });

  it('armies march on a city where others are massing rather than on a slightly nearer one', () => {
    const s = game(['##*#########*']);
    s.cities[0].owner = 0;
    s.cities[1].owner = 0;
    for (const c of s.cities) s.fog[1].knownCityOwner[c.id] = 0;
    const a = addUnit(s, 'army', 1, 6, 0);
    addUnit(s, 'army', 1, 11, 0, { orders: { kind: 'sentry' } });
    addUnit(s, 'army', 1, 11, 0, { orders: { kind: 'sentry' } });
    const cmd = next(prod(s)) as { orders: { target: { x: number } }; unitId: number };
    expect(cmd.unitId).toBe(a.id);
    expect(cmd.orders.target.x).toBe(11);
  });

  it('prefers an enemy-held city near its own cities (a lost city) over a nearer neutral one', () => {
    const s = game(['*##*#####*']);
    s.cities[0].owner = 1;
    s.cities[1].owner = 0; // lost city, near ours
    s.cities[2].owner = null;
    s.fog[1].knownCityOwner[s.cities[1].id] = 0;
    s.fog[1].knownCityOwner[s.cities[2].id] = null;
    const a = addUnit(s, 'army', 1, 6, 0);
    const cmd = next(prod(s)) as { orders: { target: { x: number } }; unitId: number };
    expect(cmd.unitId).toBe(a.id);
    expect(cmd.orders.target.x).toBe(4);
  });
});

describe('AI seats in a session', () => {
  const seats: SeatConfig[] = [
    { name: 'You', kind: 'human', color: '#d7263d' },
    { name: 'Computer', kind: 'ai', color: '#1b98e0' },
  ];
  const world = { ...DEFAULT_WORLD, ...SIZE_PRESETS.small };

  it('plays a whole game of turns against a player who only ends turns, without errors or stalls', () => {
    const s = GameSession.create({ world, seed: 5, seats }, null);
    const citiesOf = (pid: number) => s.state.cities.filter((c) => c.owner === pid).length;
    const start = citiesOf(1);
    for (let i = 0; i < 80 && s.phase === 'playing'; i++) {
      expect(s.act({ type: 'endTurn' })).toBeNull();
    }
    expect(s.state.turn).toBeGreaterThan(40);
    // It has built and moved units, and taken some cities beyond its capital.
    expect(s.state.units.some((u) => u.owner === 1)).toBe(true);
    expect(citiesOf(1)).toBeGreaterThan(start + 2);
  }, 60_000);
});

describe('AI warships', () => {
  /** A strip of sea between two cities of player 1 (the AI) and one of player 0. */
  function sea() {
    const s = game(['*..............*..*']);
    s.cities[0].owner = 1;
    s.cities[1].owner = 1;
    s.cities[2].owner = 0;
    for (const c of s.cities) c.production = 'army';
    return s;
  }
  const enemyAt = (s: GameState, type: 'destroyer' | 'transport', x: number) => {
    const e = addUnit(s, type, 0, x, 0);
    s.fog[1].lastSeen[e.id] = { unitId: e.id, type, owner: 0, x, y: 0, turnSeen: s.turn };
    return e;
  };

  it('coastal cities other than the port build warships once the fleet is due, the port only after a transport', () => {
    const s = sea();
    s.turn = 20;
    enemyAt(s, 'transport', 9);
    const v = view(s);
    const port = portCity(v)!;
    const other = v.myCities.find((c) => c.id !== port.id)!;
    expect(wantedProduction(v, other, port)).toBe('destroyer');
    expect(wantedProduction(v, port, port)).toBe('army');
    addUnit(s, 'transport', 1, port.x, port.y);
    expect(wantedProduction(view(s), port, port)).toBe('destroyer');
    s.turn = 5;
    expect(wantedProduction(view(s), other, port)).toBe('army');
  });

  it('builds no warships while the sea is quiet, but does once armies sit idle in a city or a ship was sighted', () => {
    const s = sea();
    s.turn = 30;
    const v = view(s);
    const port = portCity(v)!;
    const other = v.myCities.find((c) => c.id !== port.id)!;
    expect(wantedProduction(v, other, port)).toBe('army');
    addUnit(s, 'army', 1, other.x, other.y, { orders: { kind: 'sentry' } });
    expect(wantedProduction(view(s), other, port)).toBe('destroyer');
    s.units = s.units.filter((u) => u.type !== 'army');
    const e = enemyAt(s, 'destroyer', 9);
    expect(wantedProduction(view(s), other, port)).toBe('destroyer');
    // A sighting from long ago no longer counts.
    s.fog[1].lastSeen[e.id].turnSeen = 5;
    expect(wantedProduction(view(s), other, port)).toBe('army');
  });

  it('Hard builds its fleet earlier than Normal, Easy later', () => {
    const want = (d: Difficulty, turn: number) => {
      const s = sea();
      s.turn = turn;
      enemyAt(s, 'transport', 9);
      const v = view(s);
      const port = portCity(v)!;
      const other = v.myCities.find((c) => c.id !== port.id)!;
      return wantedProduction(v, other, port, tuningFor(d));
    };
    expect([want('easy', 10), want('normal', 10), want('hard', 10)]).toEqual(['army', 'army', 'destroyer']);
    expect([want('easy', 20), want('normal', 20), want('hard', 20)]).toEqual(['army', 'destroyer', 'destroyer']);
    expect([want('easy', 30), want('normal', 30), want('hard', 30)]).toEqual(['destroyer', 'destroyer', 'destroyer']);
  });

  it('Easy only attacks a ship it is sure to beat', () => {
    const s = sea();
    const d = addUnit(s, 'destroyer', 1, 5, 0);
    enemyAt(s, 'destroyer', 6); // an even fight
    const attack = (diff: Difficulty) => {
      for (let turn = 1; turn <= 20; turn++) {
        s.turn = turn;
        const cmd = nextAction(view(s), newMemo(diff));
        if (cmd !== null && cmd.type === 'move' && cmd.unitId === d.id) return true;
      }
      return false;
    };
    expect([attack('easy'), attack('normal'), attack('hard')]).toEqual([false, true, true]);
  });
  it('attacks an enemy ship right beside it', () => {
    const s = sea();
    const d = addUnit(s, 'destroyer', 1, 5, 0);
    enemyAt(s, 'destroyer', 6);
    expect(next(s)).toMatchObject({ type: 'move', unitId: d.id, dir: 2 });
  });

  it('sails toward an enemy ship seen lately', () => {
    const s = sea();
    const d = addUnit(s, 'destroyer', 1, 3, 0);
    enemyAt(s, 'transport', 9);
    const cmd = next(s);
    expect(cmd).toMatchObject({ type: 'setOrders', unitId: d.id, orders: { kind: 'goto' } });
    const target = (cmd as { orders: { target: { x: number } } }).orders.target;
    expect(Math.abs(target.x - 9)).toBe(1);
  });

  it('a hurt ship goes home to repair, and in port sleeps on repair orders', () => {
    const s = sea();
    const d = addUnit(s, 'destroyer', 1, 5, 0, { damage: 1 });
    expect(next(s)).toMatchObject({ type: 'goHome', unitId: d.id, repair: true });
    const home = s.cities[0];
    d.x = home.x;
    d.y = home.y;
    expect(next(s)).toMatchObject({ type: 'setOrders', unitId: d.id, orders: { kind: 'repair' } });
  });

  it('with nothing to hunt, patrols out to sea toward the enemy city', () => {
    const s = sea();
    const d = addUnit(s, 'destroyer', 1, 1, 0);
    const cmd = next(s);
    expect(cmd).toMatchObject({ type: 'setOrders', unitId: d.id, orders: { kind: 'patrol', a: { x: 1, y: 0 } } });
    const end = (cmd as { orders: { b: { x: number } } }).orders.b.x;
    expect(end - 1).toBeGreaterThanOrEqual(4);
    expect(end - 1).toBeLessThanOrEqual(8);
  });
});


