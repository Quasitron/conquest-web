import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isUpdateReady, markUpdateReady, onUpdateReady, resetUpdateReady } from '../../src/ui/updateNotice';

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

  it('stops telling a listener that has unsubscribed', () => {
    const a = vi.fn();
    const off = onUpdateReady(a);
    off();
    markUpdateReady();
    expect(a).not.toHaveBeenCalled();
  });
});
