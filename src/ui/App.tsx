import { useEffect, useState } from 'preact/hooks';
import { installAudioUnlock } from '../audio/engine';
import { startMusic, stopMusic } from '../audio/music';
import { GameSession } from '../app/session';
import { IndexedDbSaveStore } from '../storage';
import { TitleScreen } from './TitleScreen';
import { GameScreen } from './GameScreen';

const store = new IndexedDbSaveStore();

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  // The title theme plays on the title screen and fades out when a game starts.
  useEffect(installAudioUnlock, []);
  useEffect(() => {
    if (session) stopMusic();
    else startMusic('title');
  }, [session === null]);
  return session ? (
    <GameScreen session={session} store={store} onQuit={() => setSession(null)} />
  ) : (
    <TitleScreen store={store} onStart={setSession} />
  );
}

