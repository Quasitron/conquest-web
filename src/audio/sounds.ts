export type SoundName =
  | 'click' | 'turn' | 'chime' | 'shot' | 'explosion' | 'crash'
  | 'capture' | 'lost' | 'alert' | 'unload' | 'win' | 'lose'
  | 'produce-army' | 'produce-armor' | 'produce-fighter' | 'produce-transport' | 'produce-destroyer'
  | 'produce-submarine' | 'produce-cruiser' | 'produce-battleship' | 'produce-carrier';

export const SOUND_NAMES: SoundName[] = [
  'click', 'turn', 'chime', 'shot', 'explosion', 'crash', 'capture', 'lost', 'alert', 'unload', 'win', 'lose',
  'produce-army', 'produce-armor', 'produce-fighter', 'produce-transport', 'produce-destroyer',
  'produce-submarine', 'produce-cruiser', 'produce-battleship', 'produce-carrier',
];

/**
 * Recorded replacements. To swap a sound for a real recording, put the file in public/sounds/ and add a line here,
 * e.g.  OVERRIDES.explosion = '/sounds/explosion.mp3'  (or write `explosion: '/sounds/explosion.mp3'` below).
 * Any format the browser can decode works (mp3, ogg, wav, m4a). A sound with no entry uses the built-in synth.
 * If a file fails to load, the synth plays instead.
 */
export const OVERRIDES: Partial<Record<SoundName, string>> = {
  // Jet flyby, seconds 4 to 7 of the original recording, trimmed and faded in public/sounds/.
  'produce-fighter': '/sounds/produce-fighter.mp3',
  // Ship horn, seconds 16.7 to 19.2 of the original recording.
  'produce-transport': '/sounds/produce-transport.mp3',
  // Destroyer, seconds 13.2 to 15 of the original recording.
  'produce-destroyer': '/sounds/produce-destroyer.mp3',
  // Submarine, the first 2.5 seconds of the original recording.
  'produce-submarine': '/sounds/produce-submarine.mp3',
  // Cruiser, seconds 2.5 to 4.5 of the original recording.
  'produce-cruiser': '/sounds/produce-cruiser.mp3',
  // Battleship, the first 1.7 seconds of the original recording.
  'produce-battleship': '/sounds/produce-battleship.mp3',
  // Carrier: 13 s to 18 s of a US Navy video of F/A-18 launches (public domain, see docs/sounds.md).
  'produce-carrier': '/sounds/produce-carrier.mp3',
  // Armor (not in the game yet), the first 4 seconds of the original recording.
  'produce-armor': '/sounds/produce-armor.mp3',
  // Explosion, seconds 1.5 to 2.5 of the original recording; short enough to repeat for a combat animation.
  explosion: '/sounds/explosion.mp3',
};

export type MusicName = 'title';

/**
 * Music tracks. There is no synth for music: with no entry here, nothing plays. To add the title-screen theme, put
 * the file in public/music/ (e.g. public/music/title.mp3) and set  title: '/music/title.mp3'  below.
 * Use a track that loops cleanly or is a minute or two long; it loops until a game starts.
 */
export const MUSIC: Partial<Record<MusicName, string>> = {
  // Battle Theme A (OpenGameArt), about 1:36, loops.
  title: '/music/battleThemeA.mp3',
};

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
  o: { gain?: number; from?: number; to?: number; q?: number; filter?: BiquadFilterType } = {},
): void {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter ?? 'lowpass';
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

/** A brass chord: detuned sawtooth voices through a lowpass filter, with a little vibrato. */
function brass(ctx: AudioContext, out: AudioNode, t: number, freqs: number[], dur: number, gain: number): void {
  const g = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(700, t);
  filter.frequency.linearRampToValueAtTime(2400, t + Math.min(0.12, dur / 2));
  filter.frequency.exponentialRampToValueAtTime(900, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain / Math.sqrt(freqs.length), t + 0.04);
  g.gain.setValueAtTime(gain / Math.sqrt(freqs.length), t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  filter.connect(g);
  g.connect(out);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.setValueAtTime(5.5, t);
  lfoGain.gain.setValueAtTime(8, t);
  lfo.connect(lfoGain);
  lfo.start(t);
  lfo.stop(t + dur + 0.02);
  for (const f of freqs) {
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.detune.setValueAtTime(detune, t);
      lfoGain.connect(osc.detune);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }
}

/** A ship's horn: two slightly detuned low square/saw tones with a soft attack, lowpassed. */
function horn(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number, gain: number): void {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, t);
  filter.connect(out);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.06);
  g.gain.setValueAtTime(gain, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(filter);
  for (const [mult, type] of [[1, 'sawtooth'], [1.005, 'square']] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, t);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

/** A short brass fanfare: three rising notes ending on a held chord, with a soft cymbal-like tail (~1.3 s). */
const fanfare: SynthFn = (c, o, t) => {
  brass(c, o, t, [392], 0.16, 0.2);
  brass(c, o, t + 0.17, [523], 0.16, 0.2);
  brass(c, o, t + 0.34, [392, 494, 587, 784], 0.95, 0.2);
  noise(c, o, t + 0.34, 1.0, { gain: 0.07, from: 9000, to: 5000, filter: 'highpass' });
};

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
  // A city is yours: a short brass fanfare, three rising notes ending on a held chord, with a cymbal-like tail.
  capture: fanfare,
  // Army: a quick snare-like drum roll, a slight crescendo.
  'produce-army': (c, o, t) => {
    [0, 0.07, 0.13, 0.18, 0.22, 0.32].forEach((d, i) => {
      noise(c, o, t + d, 0.07, { gain: 0.14 + i * 0.03, from: 7000, to: 1500, q: 0.5 });
      tone(c, o, t + d, 190, 0.06, { type: 'triangle', gain: 0.1, endFreq: 140 });
    });
  },
  // Armor (for when that unit arrives): a low engine rumble with clanking tracks.
  'produce-armor': (c, o, t) => {
    tone(c, o, t, 55, 0.9, { type: 'sawtooth', gain: 0.18, endFreq: 70 });
    noise(c, o, t, 0.9, { gain: 0.14, from: 500, to: 200, q: 2 });
    [0.15, 0.4, 0.65].forEach((d) => tone(c, o, t + d, 420, 0.05, { type: 'square', gain: 0.06, endFreq: 300 }));
  },
  // Fighter: a jet whoosh, a filtered noise sweep rising then fading.
  'produce-fighter': (c, o, t) => {
    noise(c, o, t, 0.7, { gain: 0.3, from: 400, to: 5000, q: 3, filter: 'bandpass' });
  },
  // Transport: one short low ship-horn blip.
  'produce-transport': (c, o, t) => horn(c, o, t, 98, 0.45, 0.2),
  // Destroyer: a bosun's-pipe style high glissando.
  'produce-destroyer': (c, o, t) => {
    tone(c, o, t, 1500, 0.3, { gain: 0.14, endFreq: 2600, attack: 0.05 });
    tone(c, o, t + 0.3, 2600, 0.3, { gain: 0.12, endFreq: 2100 });
  },
  // Submarine: a sonar ping with an echo.
  'produce-submarine': (c, o, t) => {
    tone(c, o, t, 1000, 0.7, { gain: 0.25 });
    tone(c, o, t + 0.28, 1000, 0.5, { gain: 0.09 });
  },
  // Cruiser: a double horn.
  'produce-cruiser': (c, o, t) => {
    horn(c, o, t, 131, 0.25, 0.18);
    horn(c, o, t + 0.32, 131, 0.35, 0.18);
  },
  // Battleship: a deep horn over a low rumble.
  'produce-battleship': (c, o, t) => {
    horn(c, o, t, 65, 0.75, 0.3);
    noise(c, o, t, 0.75, { gain: 0.2, from: 300, to: 60 });
  },
  // Carrier: a two-tone flight-deck klaxon.
  'produce-carrier': (c, o, t) => {
    [740, 520, 740, 520].forEach((f, i) => tone(c, o, t + i * 0.16, f, 0.15, { type: 'square', gain: 0.08 }));
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





