import { UNIT_TYPES, type PlayerView, type UnitType } from '../engine';
import { turnsToComplete } from './labels';

export interface StatusRow {
  type: UnitType;
  /** Cities of yours building this type. */
  underConstruction: number;
  /** Turns until the next one is finished, or null when none is being built. */
  soonest: number | null;
  /** Units of this type you own right now. */
  inService: number;
  /** Enemy units of this type you have destroyed. */
  killed: number;
  /** Your units of this type that were destroyed. */
  lost: number;
}

export interface StatusSummary {
  citiesCaptured: number;
  citiesKnown: number;
  /** Percent of the map you have explored, to one decimal. */
  worldExplored: number;
  rows: StatusRow[];
}

/** The numbers on the status report, from the viewer's own information only. */
export function statusSummary(view: PlayerView): StatusSummary {
  const explored = view.terrain.filter((t) => t !== null).length;
  const rows = UNIT_TYPES.map((type): StatusRow => {
    const building = view.myCities.filter((c) => c.production === type);
    return {
      type,
      underConstruction: building.length,
      soonest: building.length > 0 ? Math.min(...building.map((c) => turnsToComplete(c, type))) : null,
      inService: view.myUnits.filter((u) => u.type === type).length,
      killed: view.stats.killed[type] ?? 0,
      lost: view.stats.lost[type] ?? 0,
    };
  });
  return {
    citiesCaptured: view.myCities.length,
    citiesKnown: view.knownCities.length,
    worldExplored: view.terrain.length === 0 ? 0 : Math.round((explored / view.terrain.length) * 1000) / 10,
    rows,
  };
}
