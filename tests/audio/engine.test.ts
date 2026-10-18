import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, play, playAll, resetAudio, setSettings, SETTINGS_KEY } from '../../src/audio/engine';
import { SOUND_NAMES, SYNTH } from '../../src/audio/sounds';

const g = globalThis as unknown as Record<string, unknown>;

/** A Web Audio stand-in that records the nodes created and started. */
class FakeContext {
  static made: FakeContext[] = [];
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  nodes: string[] = [];
  started = 0;
  masterGain = { value: -1 };
  constructor() { FakeContext.made.push(this); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  private param = () => ({
    value: 0,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
  });
  private node<T extends object>(kind: string, extra: T): { connect(): void } & T {
    this.nodes.push(kind);
    return { connect() {}, ...extra };
  }
  createGain() {
    const n = this.node('gain', { gain: this.param() });
    if (this.nodes.filter((k) => k === 'gain').length === 1) this.masterGain = n.gain;
    return n;
  }
  createOscillator() {
    return this.node('osc', { type: 'sine', frequency: this.param(), start: () => { this.started++; }, stop() {} });
  }
  createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
  createBufferSource() { return this.node('src', { start: () => { this.started++; } }); }
  createBiquadFilter() { return this.node('filter', { Q: { value: 0 }, frequency: this.param() }); }
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

beforeEach(() => {
  resetAudio();
  FakeContext.made = [];
  g.localStorage = memoryStorage();
  g.AudioContext = FakeContext;
});
afterEach(() => {
  delete g.AudioContext;
  delete g.webkitAudioContext;
  delete g.localStorage;
  resetAudio();
});

describe('sound settings', () => {
  it('default to on at a moderate volume', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toEqual({ enabled: true, volume: 0.6 });
  });

  it('persist across a reload', () => {
    setSettings({ enabled: false, volume: 0.25 });
    resetAudio();
    expect(getSettings()).toEqual({ enabled: false, volume: 0.25 });
  });

  it('clamp the volume', () => {
    expect(setSettings({ volume: 7 }).volume).toBe(1);
    expect(setSettings({ volume: -1 }).volume).toBe(0);
  });

  it('ignore junk in storage', () => {
    (g.localStorage as ReturnType<typeof memoryStorage>).setItem(SETTINGS_KEY, '{"enabled":"yes","volume":"loud"}');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    resetAudio();
    (g.localStorage as ReturnType<typeof memoryStorage>).setItem(SETTINGS_KEY, 'not json');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('work when storage throws', () => {
    const boom = () => { throw new Error('blocked'); };
    g.localStorage = { getItem: boom, setItem: boom };
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(setSettings({ volume: 0.3 }).volume).toBe(0.3);
    expect(getSettings().volume).toBe(0.3);
  });

  it('work when there is no storage at all', () => {
    delete g.localStorage;
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => setSettings({ enabled: false })).not.toThrow();
  });
});

describe('play', () => {
  it('schedules sound when enabled', () => {
    play('explosion');
    expect(FakeContext.made).toHaveLength(1);
    expect(FakeContext.made[0].started).toBeGreaterThan(0);
  });

  it('applies the volume to the master gain', () => {
    setSettings({ volume: 0.4 });
    play('click');
    expect(FakeContext.made[0].masterGain.value).toBe(0.4);
    setSettings({ volume: 0.9 });
    expect(FakeContext.made[0].masterGain.value).toBe(0.9);
  });

  it('does nothing when muted, without even creating the audio context', () => {
    setSettings({ enabled: false });
    play('shot');
    playAll(['shot', 'explosion']);
    expect(FakeContext.made).toHaveLength(0);
  });

  it('does nothing when the browser has no Web Audio', () => {
    delete g.AudioContext;
    expect(() => play('shot')).not.toThrow();
  });

  it('survives an audio context that cannot be created', () => {
    g.AudioContext = class { constructor() { throw new Error('no'); } };
    expect(() => play('shot')).not.toThrow();
  });

  it('resumes a suspended context (iOS)', () => {
    play('click');
    const c = FakeContext.made[0];
    c.state = 'suspended';
    play('click');
    expect(c.state).toBe('running');
  });

  it('every effect schedules at least one sound', () => {
    for (const name of SOUND_NAMES) {
      resetAudio();
      FakeContext.made = [];
      play(name);
      expect(FakeContext.made[0].started, name).toBeGreaterThan(0);
    }
    expect(Object.keys(SYNTH).sort()).toEqual([...SOUND_NAMES].sort());
  });
});
