import { useEffect, useState } from 'preact/hooks';

/** A 250 ms on/off toggle. Only the component that calls this re-renders on each tick. */
export function useBlink(active = true): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setOn((b) => !b), 250);
    return () => window.clearInterval(id);
  }, [active]);
  return on;
}
