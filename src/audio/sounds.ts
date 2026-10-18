export type SoundName =
  | 'click' | 'turn' | 'chime' | 'shot' | 'explosion' | 'crash'
  | 'capture' | 'lost' | 'alert' | 'unload' | 'win' | 'lose';

export const SOUND_NAMES: SoundName[] = [
  'click', 'turn', 'chime', 'shot', 'explosion', 'crash', 'capture', 'lost', 'alert', 'unload', 'win', 'lose',
];

/**
 * Recorded replacements. To swap a sound for a real recording, put the file in public/sounds/ and add a line here,
 * e.g.  OVERRIDES.explosion = '/sounds/explosion.mp3'  (or write `explosion: '/sounds/explosion.mp3'` below).
 * Any format the browser can decode works (mp3, ogg, wav, m4a). A sound with no entry uses the built-in synth.
 * If a file fails to load, the synth plays instead.
 */
export const OVERRIDES: Partial<Record<SoundName, string>> = {};

/** The synth effects write into `out` (the master gain), starting at time `t`. Each is under 1.2 seconds. */
export type SynthFn = (ctx: AudioContext, out: AudioNode, t: number) => void;

/** One enveloped oscillator note, optionally gliding from `freq` to `endFreq`. */
function tone(
  ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number,
  o: { type?: OscillatorType; gain?: number; endFreq?: number; attack?: number } = {},
): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t + dur);
  const peak = o.gain ?? 0.3;
  const attack = o.attack ?? 0.008;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A burst of filtered noise that fades out; the filter sweeps from `from` Hz down to `to` Hz. */
function noise(
  ctx: AudioContext, out: AudioNode, t: number, dur: number,
  o: { gain?: number; from?: number; to?: number; q?: number } = {},
): void {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = o.q ?? 0.7;
  filter.frequency.setValueAtTime(o.from ?? 3000, t);
  filter.frequency.exponentialRampToValueAtTime(o.to ?? 300, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(o.gain ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(out);
  src.start(t);
}

export const SYNTH: Record<SoundName, SynthFn> = {
  // A tiny tick.
  click: (c, o, t) => tone(c, o, t, 900, 0.05, { type: 'triangle', gain: 0.18, endFreq: 600 }),
  // A soft two-note ping: your turn.
  turn: (c, o, t) => {
    tone(c, o, t, 660, 0.18, { gain: 0.22 });
    tone(c, o, t + 0.09, 880, 0.3, { gain: 0.22 });
  },
  // Something was built.
  chime: (c, o, t) => {
    tone(c, o, t, 1047, 0.4, { gain: 0.2 });
    tone(c, o, t + 0.07, 1568, 0.5, { gain: 0.12 });
  },
  // A short crack.
  shot: (c, o, t) => {
    noise(c, o, t, 0.12, { gain: 0.35, from: 6000, to: 800 });
    tone(c, o, t, 220, 0.1, { type: 'square', gain: 0.1, endFreq: 80 });
  },
  // A low rumbling boom.
  explosion: (c, o, t) => {
    noise(c, o, t, 0.9, { gain: 0.6, from: 1800, to: 80, q: 1 });
    tone(c, o, t, 90, 0.7, { gain: 0.5, endFreq: 30 });
  },
  // An aircraft out of fuel: a falling whistle, then a thud.
  crash: (c, o, t) => {
    tone(c, o, t, 1200, 0.6, { type: 'sawtooth', gain: 0.1, endFreq: 150 });
    noise(c, o, t + 0.55, 0.5, { gain: 0.5, from: 1200, to: 60 });
    tone(c, o, t + 0.55, 70, 0.4, { gain: 0.4, endFreq: 30 });
  },
  // A city is yours: a rising three-note fanfare.
  capture: (c, o, t) => {
    [523, 659, 784].forEach((f, i) => tone(c, o, t + i * 0.11, f, 0.4, { type: 'triangle', gain: 0.22 }));
  },
  // A city is lost: two low alternating tones, like an alarm.
  lost: (c, o, t) => {
    [440, 330, 440, 330].forEach((f, i) => tone(c, o, t + i * 0.2, f, 0.22, { type: 'square', gain: 0.1 }));
  },
  // Enemy sighted: two quick high blips.
  alert: (c, o, t) => {
    tone(c, o, t, 1320, 0.09, { type: 'square', gain: 0.1 });
    tone(c, o, t + 0.14, 1320, 0.09, { type: 'square', gain: 0.1 });
  },
  // Troops off the boat: a short splash and a step.
  unload: (c, o, t) => {
    noise(c, o, t, 0.25, { gain: 0.2, from: 2500, to: 400 });
    tone(c, o, t + 0.1, 300, 0.12, { type: 'triangle', gain: 0.2, endFreq: 200 });
  },
  // Victory: a rising major arpeggio ending on a held chord.
  win: (c, o, t) => {
    [523, 659, 784].forEach((f, i) => tone(c, o, t + i * 0.13, f, 0.3, { type: 'triangle', gain: 0.2 }));
    [1047, 784, 659].forEach((f) => tone(c, o, t + 0.4, f, 0.7, { type: 'triangle', gain: 0.14 }));
  },
  // Defeat: a slow falling minor line.
  lose: (c, o, t) => {
    [392, 349, 311, 262].forEach((f, i) => tone(c, o, t + i * 0.2, f, 0.35, { type: 'sine', gain: 0.25 }));
  },
};
