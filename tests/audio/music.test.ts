import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetAudio, setSettings } from '../../src/audio/engine';
import { startMusic, stopMusic } from '../../src/audio/music';
import { MUSIC } from '../../src/audio/sounds';

const g = globalThis as unknown as Record<string, unknown>;

class FakeAudio {
  static made: FakeAudio[] = [];
  loop = false;
  volume = 1;
  paused = true;
  plays = 0;
  constructor(public src: string) { FakeAudio.made.push(this); }
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; }
}

const store = new Map<string, string>();

beforeEach(() => {
  resetAudio();
  FakeAudio.made = [];
  store.clear();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  g.Audio = FakeAudio;
});
afterEach(() => {
  delete MUSIC.title;
  delete g.Audio;
  delete g.localStorage;
  stopMusic(0);
  resetAudio();
});

describe('music', () => {
  it('does nothing when no track is set', () => {
    startMusic('title');
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('plays a configured track on a loop at the music volume, and stops it', () => {
    MUSIC.title = '/music/title.mp3';
    setSettings({ musicVolume: 0.4 });
    startMusic('title');
    const a = FakeAudio.made[0];
    expect(a.src).toBe('/music/title.mp3');
    expect(a.loop).toBe(true);
    expect(a.volume).toBe(0.4);
    expect(a.paused).toBe(false);
    stopMusic(0);
    expect(a.paused).toBe(true);
  });

  it('stays silent when music or sound is off, and starts when turned on', () => {
    MUSIC.title = '/music/title.mp3';
    setSettings({ music: false });
    startMusic('title');
    expect(FakeAudio.made[0].paused).toBe(true);
    setSettings({ music: true });
    expect(FakeAudio.made[0].paused).toBe(false);
    setSettings({ enabled: false });
    expect(FakeAudio.made[0].paused).toBe(true);
  });
});
