import { defaultCityName } from '../engine';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Format-1 (2a) states had no house rules; those games were played with a fair first turn. */
export function migrateState1to2(st: Record<string, unknown>): Record<string, unknown> {
  const units = Array.isArray(st.units)
    ? st.units.map((u) => (isObj(u) ? { ...u, orders: null, unloadNextTurn: false } : u))
    : st.units;
  return {
    ...st,
    version: 2,
    rules: { easierNeutralCities: false, fairFirstTurn: true, sentriedStayAsGarrison: false },
    units,
  };
}

function migrateSave1to2(raw: Record<string, unknown>): Record<string, unknown> {
  const step = (v: unknown) => (isObj(v) ? migrateState1to2(v) : v);
  return { ...raw, format: 2, rulesVersion: 1, initial: step(raw.initial), snapshot: step(raw.snapshot) };
}

/** Format-2 (2b) states had no names; cities get deterministic default names, units start unnamed and unblocked. */
export function migrateState2to3(st: Record<string, unknown>): Record<string, unknown> {
  const cities = Array.isArray(st.cities)
    ? st.cities.map((c, i) => {
        if (!isObj(c) || typeof c.name === 'string') return c;
        return { ...c, name: defaultCityName(typeof c.id === 'number' && Number.isInteger(c.id) ? c.id : i) };
      })
    : st.cities;
  const units = Array.isArray(st.units)
    ? st.units.map((u) => {
        if (!isObj(u)) return u;
        const blocked = typeof u.blockedTurns === 'number' && Number.isInteger(u.blockedTurns) && u.blockedTurns >= 0;
        return {
          ...u,
          name: typeof u.name === 'string' ? u.name : null,
          blockedTurns: blocked ? u.blockedTurns : 0,
        };
      })
    : st.units;
  return { ...st, version: 3, cities, units };
}

function migrateSave2to3(raw: Record<string, unknown>): Record<string, unknown> {
  const step = (v: unknown) => (isObj(v) ? migrateState2to3(v) : v);
  return { ...raw, format: 3, initial: step(raw.initial), snapshot: step(raw.snapshot) };
}

/** Upgrades a raw save to the current format, one step at a time. */
export function migrateSave(raw: Record<string, unknown>): { ok: true; save: Record<string, unknown> } | { ok: false; error: string } {
  let save = raw;
  if (save.format === 1) save = migrateSave1to2(save);
  if (save.format === 2) save = migrateSave2to3(save);
  if (save.format !== 3) return { ok: false, error: 'unsupported save format' };
  return { ok: true, save };
}
