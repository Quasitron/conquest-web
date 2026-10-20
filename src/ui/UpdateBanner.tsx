import { useState } from 'preact/hooks';
import { useUpdateReady } from './updateNotice';

/** A small bar offering to reload into the new version that has finished downloading. */
export function UpdateBanner() {
  const ready = useUpdateReady();
  const [later, setLater] = useState(false);
  if (!ready || later) return null;
  return (
    <div class="update-banner" role="status">
      <span>A new version is ready.</span>
      <button class="primary" onClick={() => location.reload()}>Reload</button>
      <button onClick={() => setLater(true)}>Later</button>
    </div>
  );
}
