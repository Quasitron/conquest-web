import { useState } from 'preact/hooks';
import { GameSession } from '../app/session';
import { IndexedDbSaveStore } from '../storage';
import { TitleScreen } from './TitleScreen';
import { GameScreen } from './GameScreen';

const store = new IndexedDbSaveStore();

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  return session ? (
    <GameScreen session={session} store={store} onQuit={() => setSession(null)} />
  ) : (
    <TitleScreen store={store} onStart={setSession} />
  );
}
