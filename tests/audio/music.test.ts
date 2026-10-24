import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const realTitle = MUSIC.title;
const store = new Map<string, string>();

beforeEach(() => {
  resetAudio();
  FakeAudio.made = [];
  store.clear();
  g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  g.Audio = FakeAudio;
});
afterEach(() => {
  MUSIC.title = realTitle;
  delete g.Audio;
  delete g.localStorage;
  stopMusic(0);
  resetAudio();
});

describe('music', () => {
  it('does nothing when no track is set', () => {
    delete MUSIC.title;
    startMusic('title');
    expect(FakeAudio.made).toHaveLength(0);
  });

  it('takes turns between the themes of the rotation each time the title music starts', () => {
    const played: string[] = [];
    for (let i = 0; i < 3; i++) {
      startMusic('title');
      played.push(FakeAudio.made[i].src);
      stopMusic(0);
    }
    expect(played[0]).toBe(MUSIC.title);
    expect(played[1]).not.toBe(played[0]);
    expect(played[2]).toBe(played[0]);
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

  it('can play on for a while into the game before fading out, and starting again cancels that', () => {
    vi.useFakeTimers();
    try {
      MUSIC.title = '/music/title.mp3';
      setSettings({ musicVolume: 0.4 });
      startMusic('title');
      const a = FakeAudio.made[0];
      stopMusic(1000, 2000);
      vi.advanceTimersByTime(1900);
      expect(a.paused).toBe(false); // still playing, at full volume, during the hold
      expect(a.volume).toBe(0.4);
      vi.advanceTimersByTime(600); // the fade has begun
      expect(a.volume).toBeLessThan(0.4);
      expect(a.paused).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(a.paused).toBe(true); // faded out and stopped
      // Returning to the title during the hold keeps the music going.
      startMusic('title');
      const b = FakeAudio.made[1];
      stopMusic(1000, 2000);
      vi.advanceTimersByTime(1000);
      startMusic('title');
      vi.advanceTimersByTime(5000);
      expect(b.paused).toBe(false);
      expect(b.volume).toBe(0.4);
    } finally {
      vi.useRealTimers();
    }
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
