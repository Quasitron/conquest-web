/** How fights are shown: played out on the map, listed in the Combat report, or not announced at all. */
export type CombatMode = 'animated' | 'reports' | 'off';

export const COMBAT_MODES: readonly CombatMode[] = ['animated', 'reports', 'off'];
export const COMBAT_MODE_KEY = 'conquest.combat';
export const DEFAULT_COMBAT_MODE: CombatMode = 'animated';

let mode: CombatMode | null = null;

function load(): CombatMode {
  try {
    const raw = globalThis.localStorage?.getItem(COMBAT_MODE_KEY);
    if (raw && (COMBAT_MODES as readonly string[]).includes(raw)) return raw as CombatMode;
  } catch { /* storage blocked or unreadable: use the default */ }
  return DEFAULT_COMBAT_MODE;
}

export function getCombatMode(): CombatMode {
  return (mode ??= load());
}

export function setCombatMode(next: CombatMode): CombatMode {
  mode = (COMBAT_MODES as readonly string[]).includes(next) ? next : DEFAULT_COMBAT_MODE;
  try {
    globalThis.localStorage?.setItem(COMBAT_MODE_KEY, mode);
  } catch { /* storage blocked: the choice lasts until the page is closed */ }
  return mode;
}

/** Forgets the cached choice (for tests). */
export function resetCombatMode(): void {
  mode = null;
}
