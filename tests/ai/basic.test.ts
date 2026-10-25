import { describe, it, expect } from 'vitest';
import { getPlayerView } from '../../src/engine';
import type { GameState } from '../../src/engine';
import { GameSession } from '../../src/app/session';
import { newMemo, nextAction, portCity, wantedProduction } from '../../src/ai/basic';
import { tuningFor, type Difficulty } from '../../src/ai/difficulty';
import { DEFAULT_WORLD, SIZE_PRESETS } from '../../src/mapgen';
import type { SeatConfig } from '../../src/storage';
import { addUnit, makeGame } from '../helpers';
import { unitAttackChance } from '../../src/ui/plans';

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



describe('AI bombardment (city strength rule)', () => {
  it('a healthy battleship beside an enemy city fires on it, but not once it is worn down, nor with the rule off', () => {
    const run = (rules: object, damage = 0) => {
      const s = game(['*..*'], { rules });
      const enemyCity = s.cities.find((c) => c.owner === 0)!;
      enemyCity.damage = damage;
      s.fog[1].knownCityOwner[enemyCity.id] = 0; // the AI has seen whose city it is
      const ship = addUnit(s, 'battleship', 1, enemyCity.x + 1, enemyCity.y);
      return { cmd: next(s), ship };
    };
    const on = run({ cityStrength: true });
    expect(on.cmd).toEqual({ type: 'move', unitId: on.ship.id, dir: 6 });
    expect(run({ cityStrength: true }, 2).cmd).not.toEqual({ type: 'move', unitId: expect.anything(), dir: 6 });
    expect(run({}).cmd).not.toEqual({ type: 'move', unitId: expect.anything(), dir: 6 });
  });
});
describe('ranks in the odds', () => {
  it('an Elite foe is harder to beat and an Elite ship fights better, in the AI and in your attack label', () => {
    const s = game(['*..*']);
    const ship = addUnit(s, 'destroyer', 1, 1, 0);
    const base = unitAttackChance(ship, 'destroyer', 0);
    expect(unitAttackChance(ship, 'destroyer', 3)).toBeLessThan(base);
    ship.wins = 5;
    expect(unitAttackChance(ship, 'destroyer', 0)).toBeGreaterThan(base);
  });
});
describe('AI hunting cities (city strength rule)', () => {
  it('a bombarding ship with nothing else to do sails to the square beside a worn-down-able enemy city', () => {
    const run = (rules: object, damage = 0) => {
      const s = game(['*.....*'], { rules });
      const enemyCity = s.cities.find((c) => c.owner === 0)!;
      enemyCity.damage = damage;
      s.fog[1].knownCityOwner[enemyCity.id] = 0;
      addUnit(s, 'cruiser', 1, 4, 0);
      return next(s);
    };
    expect(run({ cityStrength: true })).toMatchObject({ orders: { kind: 'goto', target: { x: 1, y: 0 } } });
    expect(run({ cityStrength: true }, 2)).not.toMatchObject({ orders: { kind: 'goto', target: { x: 1, y: 0 } } });
    expect(run({})).not.toMatchObject({ orders: { kind: 'goto', target: { x: 1, y: 0 } } });
  });
});
describe('AI escorts (Hard)', () => {
  const setup = (shipX: number) => {
    const s = game(['*.......*']);
    const tr = addUnit(s, 'transport', 1, 5, 0, { orders: { kind: 'sentry' } });
    addUnit(s, 'army', 1, 5, 0, { carriedBy: tr.id, orders: { kind: 'sentry' } });
    const ship = addUnit(s, 'destroyer', 1, shipX, 0);
    return { s, ship };
  };
  const act = (s: GameState, d: Difficulty) => nextAction(view(s), newMemo(d));

  it('on Hard a free warship sails beside a loaded transport at sea; Normal does not', () => {
    const { s } = setup(1);
    expect(act(s, 'hard')).toMatchObject({ type: 'setOrders', orders: { kind: 'goto', target: { x: 4, y: 0 } } });
    expect(act(s, 'normal')).not.toMatchObject({ orders: { kind: 'goto', target: { x: 4, y: 0 } } });
  });

  it('a warship already beside the transport stays on escort duty instead of patrolling off', () => {
    const { s } = setup(4);
    expect(act(s, 'hard')).toBeNull();
  });

  it('a second warship goes to the transport only when it has no escort yet', () => {
    const { s } = setup(4); // already escorted by this one
    addUnit(s, 'cruiser', 1, 1, 0);
    const cmd = act(s, 'hard');
    expect(cmd === null || !(cmd as { orders?: { target?: { x: number } } }).orders?.target || (cmd as { orders: { target: { x: number } } }).orders.target.x !== 4).toBe(true);
  });
});
describe('AI transports wait for an escort (Hard)', () => {
  const portGame = () => {
    const s = game(['*..*..']);
    const port = s.cities.find((c) => c.owner === 1)!;
    const tr = addUnit(s, 'transport', 1, port.x, port.y);
    for (let i = 0; i < 3; i++) addUnit(s, 'army', 1, port.x, port.y, { orders: { kind: 'sentry' } });
    s.turn = 20;
    return { s, port, tr };
  };
  /** Whether the transport is sent sailing; production commands that are not applied here are skipped over. */
  const sails = (s: GameState, id: number, d: Difficulty) => {
    const memo = newMemo(d);
    for (let i = 0; i < 20; i++) {
      const cmd = nextAction(view(s), memo);
      if (cmd === null) return false;
      if (cmd.type === 'setOrders' && cmd.unitId === id && cmd.orders?.kind === 'explore') return true;
    }
    return false;
  };

  it('Normal sails at once; Hard waits while a warship is being built, and sails when one is beside it', () => {
    const { s, port, tr } = portGame();
    const other = s.cities.find((c) => c.owner === 1 && c.id !== port.id) ?? port;
    other.production = 'cruiser';
    expect(sails(s, tr.id, 'normal')).toBe(true);
    expect(sails(s, tr.id, 'hard')).toBe(false);
    other.production = 'army';
    expect(sails(s, tr.id, 'hard')).toBe(true); // nothing is coming: sail alone
    addUnit(s, 'destroyer', 1, port.x, port.y);
    expect(sails(s, tr.id, 'hard')).toBe(true); // an escort is in port
  });
});
describe('AI transports avoid patrols (Hard)', () => {
  const rows = [
    '*...........',
    '............',
    '............',
    '............',
    '............',
    '............',
    '............',
    '..........*.',
  ];
  const setup = () => {
    const s = game(rows);
    s.cities[0].owner = 1; // the city in the corner is ours, the far one is the enemy's
    s.cities[1].owner = 0;
    for (const c of s.cities) c.production = c.owner === null ? null : 'army';
    const enemy = s.cities[1];
    s.fog[1].knownCityOwner[enemy.id] = 0;
    const tr = addUnit(s, 'transport', 1, 2, 3);
    addUnit(s, 'army', 1, 2, 3, { carriedBy: tr.id, orders: { kind: 'sentry' } });
    const cruiser = addUnit(s, 'cruiser', 0, 6, 1);
    s.fog[1].lastSeen[cruiser.id] = { unitId: cruiser.id, type: 'cruiser', owner: 0, x: 6, y: 1, turnSeen: s.turn };
    return { s, tr, cruiser };
  };
  const target = (cmd: unknown) => (cmd as { orders?: { target?: { x: number; y: number } } } | null)?.orders?.target ?? null;
  const first = (s: GameState, d: Difficulty, id: number) => {
    const memo = newMemo(d);
    for (let i = 0; i < 20; i++) {
      const cmd = nextAction(view(s), memo);
      if (cmd === null) return null;
      if (cmd.type === 'setOrders' && cmd.unitId === id) return cmd;
    }
    return null;
  };

  it('Hard takes the next leg around the danger; Normal heads for the city as before', () => {
    const { s, tr } = setup();
    const hard = target(first(s, 'hard', tr.id));
    const normal = target(first(s, 'normal', tr.id));
    expect(normal).not.toBeNull();
    expect(Math.max(Math.abs(normal!.x - 2), Math.abs(normal!.y - 3))).toBeGreaterThan(2); // straight to the far approach
    expect(hard).not.toBeNull();
    expect(Math.max(Math.abs(hard!.x - 2), Math.abs(hard!.y - 3))).toBeLessThanOrEqual(2); // one short leg
    expect(Math.max(Math.abs(hard!.x - 6), Math.abs(hard!.y - 1))).toBeGreaterThan(3); // outside the cruiser's reach
  });

  it('Hard holds when the enemy sits across every way in', () => {
    const { s, tr, cruiser } = setup();
    cruiser.x = 10; cruiser.y = 6; // right beside the only city
    s.fog[1].lastSeen[cruiser.id] = { unitId: cruiser.id, type: 'cruiser', owner: 0, x: 10, y: 6, turnSeen: s.turn };
    expect(first(s, 'hard', tr.id)).toBeNull();
  });
});