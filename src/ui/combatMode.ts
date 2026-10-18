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
  pace = null;
  reportAfter = null;
}

/** How fast the turn-start replay moves from one fight to the next. Manual waits for the player to tap Next. */
export type ReplayPace = 'manual' | 'slow' | 'normal' | 'fast';

export const REPLAY_PACES: readonly ReplayPace[] = ['manual', 'slow', 'normal', 'fast'];
export const REPLAY_PACE_KEY = 'conquest.replayPace';
export const DEFAULT_REPLAY_PACE: ReplayPace = 'normal';
/** Whether the Combat report opens when the replay ends, so every outcome can be read at leisure. */
export const REPORT_AFTER_KEY = 'conquest.reportAfterReplay';

let pace: ReplayPace | null = null;
let reportAfter: boolean | null = null;

export function getReplayPace(): ReplayPace {
  if (pace) return pace;
  try {
    const raw = globalThis.localStorage?.getItem(REPLAY_PACE_KEY);
    if (raw && (REPLAY_PACES as readonly string[]).includes(raw)) return (pace = raw as ReplayPace);
  } catch { /* storage blocked or unreadable: use the default */ }
  return (pace = DEFAULT_REPLAY_PACE);
}

export function setReplayPace(next: ReplayPace): ReplayPace {
  pace = (REPLAY_PACES as readonly string[]).includes(next) ? next : DEFAULT_REPLAY_PACE;
  try {
    globalThis.localStorage?.setItem(REPLAY_PACE_KEY, pace);
  } catch { /* storage blocked: the choice lasts until the page is closed */ }
  return pace;
}

export function getReportAfter(): boolean {
  if (reportAfter !== null) return reportAfter;
  try {
    const raw = globalThis.localStorage?.getItem(REPORT_AFTER_KEY);
    if (raw === 'true' || raw === 'false') return (reportAfter = raw === 'true');
  } catch { /* storage blocked or unreadable: use the default */ }
  return (reportAfter = true);
}

export function setReportAfter(next: boolean): boolean {
  reportAfter = next;
  try {
    globalThis.localStorage?.setItem(REPORT_AFTER_KEY, String(next));
  } catch { /* storage blocked: the choice lasts until the page is closed */ }
  return next;
}

/** Forgets the cached pace and report choice (for tests). */
export function resetReplaySettings(): void {
  pace = null;
  reportAfter = null;
}
