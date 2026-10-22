import { useEffect, useState } from 'preact/hooks';
import { installAudioUnlock } from '../audio/engine';
import { GAME_MUSIC_FADE_MS, GAME_MUSIC_HOLD_MS, startMusic, stopMusic } from '../audio/music';
import { GameSession } from '../app/session';
import { IndexedDbSaveStore } from '../storage';
import { TitleScreen } from './TitleScreen';
import { GameScreen } from './GameScreen';
import { UpdateBanner } from './UpdateBanner';

const store = new IndexedDbSaveStore();

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  // The title theme plays on the title screen and fades out when a game starts.
  useEffect(installAudioUnlock, []);
  useEffect(() => {
    if (session) stopMusic(GAME_MUSIC_FADE_MS, GAME_MUSIC_HOLD_MS);
    else startMusic('title');
  }, [session === null]);
  return (
    <>
      {session ? (
        <GameScreen session={session} store={store} onQuit={() => setSession(null)} />
      ) : (
        <TitleScreen store={store} onStart={setSession} />
      )}
      <UpdateBanner />
    </>
  );
}

