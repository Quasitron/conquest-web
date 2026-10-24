import { context, getSettings, onSettingsChange } from './engine';
import { MUSIC, MUSIC_ROTATION, type MusicName } from './sounds';

let audio: HTMLAudioElement | null = null;
let gain: GainNode | null = null;
let wanted: MusicName | null = null;
let fade: number | undefined;
let hold: number | undefined;
let retryArmed = false;
let settingsHooked = false;

const target = () => {
  const s = getSettings();
  return s.enabled && s.music ? s.musicVolume : 0;
};

function setLevel(v: number): void {
  if (gain) gain.gain.value = v;
  else if (audio) audio.volume = v;
}

/** Browsers refuse to start audio before a tap or key press: try again at the first one. */
function armRetry(): void {
  if (retryArmed || typeof document === 'undefined') return;
  retryArmed = true;
  const go = () => {
    document.removeEventListener('pointerdown', go, true);
    document.removeEventListener('keydown', go, true);
    retryArmed = false;
    if (wanted) void begin();
  };
  document.addEventListener('pointerdown', go, true);
  document.addEventListener('keydown', go, true);
}

async function begin(): Promise<void> {
  if (!wanted || !audio) return;
  if (target() === 0) { audio.pause(); return; }
  try {
    const c = context();
    if (c && c.state === 'suspended') await c.resume();
    setLevel(target());
    await audio.play();
  } catch {
    armRetry();
  }
}

const ROTATION_KEY = 'toc.musicTurn';

/** The track to play: MUSIC's own, or the next of the rotation it belongs to (remembered between visits, so themes alternate). */
function chooseTrack(name: MusicName): string | undefined {
  const url = MUSIC[name];
  const list = MUSIC_ROTATION[name];
  if (!url || !list || list.length < 2 || !list.includes(url)) return url;
  let turn = 0;
  try {
    turn = Number(localStorage.getItem(ROTATION_KEY)) || 0;
    localStorage.setItem(ROTATION_KEY, String(turn + 1));
  } catch { /* no storage: always the first theme */ }
  return list[turn % list.length];
}

/** Starts looping the named track, if one is set in MUSIC and music is on; otherwise does nothing. */
export function startMusic(name: MusicName): void {
  const url = chooseTrack(name);
  if (!url || typeof Audio === 'undefined') return;
  clearInterval(fade);
  clearTimeout(hold);
  wanted = name;
  if (!settingsHooked) {
    settingsHooked = true;
    onSettingsChange(() => {
      if (!wanted || !audio) return;
      setLevel(target());
      if (target() === 0) audio.pause();
      else if (audio.paused) void begin();
    });
  }
  if (!audio) {
    try {
      audio = new Audio(url);
      audio.loop = true;
      // Route through Web Audio so the volume works on iPad, where the element's own volume is ignored.
      const c = context();
      if (c) {
        gain = c.createGain();
        c.createMediaElementSource(audio).connect(gain);
        gain.connect(c.destination);
      }
    } catch {
      gain = null;
    }
  }
  void begin();
}

/** When a game starts, the title music plays on this long, then fades out over the next (so the change is not abrupt). */
export const GAME_MUSIC_HOLD_MS = 2000;
export const GAME_MUSIC_FADE_MS = 2000;

/** Lets the music play on for `holdMs`, then fades it out over `ms` and stops it. Starting music again cancels it. */
export function stopMusic(ms = 1200, holdMs = 0): void {
  wanted = null;
  const a = audio;
  if (!a) return;
  clearInterval(fade);
  clearTimeout(hold);
  const done = () => {
    a.pause();
    if (audio === a) { audio = null; gain = null; }
  };
  const start = target();
  const fadeOut = () => {
    if (ms <= 0) { done(); return; }
    const t0 = Date.now();
    fade = setInterval(() => {
      const k = 1 - (Date.now() - t0) / ms;
      if (k <= 0) { clearInterval(fade); done(); } else setLevel(start * k);
    }, 50);
  };
  if (start === 0) done();
  else if (holdMs > 0) hold = setTimeout(fadeOut, holdMs);
  else fadeOut();
}
