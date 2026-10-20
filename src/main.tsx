import { render } from 'preact';
import { App } from './ui/App';
import { registerOfflineWorker } from './ui/updateNotice';
import './ui/styles.css';

render(<App />, document.getElementById('app')!);

// Offline play: the worker (written by the build) saves the game on the first visit, so later visits work with no connection.
registerOfflineWorker();
