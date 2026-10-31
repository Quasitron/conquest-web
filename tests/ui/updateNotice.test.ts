import { describe, it, expect, beforeEach, vi } from 'vitest';
import { entryScript, isUpdateReady, markUpdateReady, onUpdateReady, resetUpdateReady } from '../../src/ui/updateNotice';

beforeEach(() => resetUpdateReady());

describe('update notice', () => {
  it('starts with no update waiting, then tells every listener once an update has arrived', () => {
    const a = vi.fn();
    const b = vi.fn();
    onUpdateReady(a);
    onUpdateReady(b);
    expect(isUpdateReady()).toBe(false);
    markUpdateReady();
    expect(isUpdateReady()).toBe(true);
    expect(a).toHaveBeenCalledWith(true);
    expect(b).toHaveBeenCalledWith(true);
  });

  it('finds the game\'s own script in a page, ignoring analytics scripts, so two builds can be told apart', () => {
    const page = (name: string) => `<head><script type="module" crossorigin src="/assets/index-${name}.js"></script>
      <script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{}'></script></head>`;
    expect(entryScript(page('CpPl3hEy'))).toBe('/assets/index-CpPl3hEy.js');
    expect(entryScript(page('CpPl3hEy'))).toBe(entryScript(page('CpPl3hEy')));
    expect(entryScript(page('CpPl3hEy'))).not.toBe(entryScript(page('D5p69Gxw')));
    expect(entryScript('<head><script src="https://example.com/a.js"></script></head>')).toBeNull();
    expect(entryScript('')).toBeNull();
  });

  it('stops telling a listener that has unsubscribed', () => {
    const a = vi.fn();
    const off = onUpdateReady(a);
    off();
    markUpdateReady();
    expect(a).not.toHaveBeenCalled();
  });
});
