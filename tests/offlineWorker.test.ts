import { describe, it, expect } from 'vitest';
import { cacheVersion, precacheList, serviceWorkerSource } from '../tools/offlineWorker';

describe('offline worker', () => {
  it('saves the page and every file of the build, but not the share image or itself', () => {
    const list = precacheList(['index.html', 'assets/a.js', 'og-image.jpg', 'sw.js', 'sounds/x.mp3']);
    expect(list).toEqual(['/', '/assets/a.js', '/index.html', '/sounds/x.mp3']);
  });

  it('gets a new cache name when a file is added, removed or changes size, and the same one otherwise', () => {
    const a = cacheVersion(['a.js:10', 'b.mp3:20']);
    expect(cacheVersion(['b.mp3:20', 'a.js:10'])).toBe(a);
    expect(cacheVersion(['a.js:10', 'b.mp3:21'])).not.toBe(a);
    expect(cacheVersion(['a.js:10'])).not.toBe(a);
  });

  it('writes a script that parses, names its cache for the build and lists the files', () => {
    const src = serviceWorkerSource(['assets/a.js', 'sounds/x.mp3'], 'abc123');
    expect(() => new Function(src)).not.toThrow(); // valid JavaScript (the worker globals are only used when it runs)
    expect(src).toContain("const CACHE = 'toc-abc123';");
    expect(src).toContain('"/sounds/x.mp3"');
    // Module scripts must find their saved copy even when the server sends 'Vary: Origin'.
    expect(src).toContain('ignoreVary: true');
  });
});
