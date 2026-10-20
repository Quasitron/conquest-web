import { render } from 'preact';
import { App } from './ui/App';
import './ui/styles.css';

render(<App />, document.getElementById('app')!);

// Offline play: the worker (written by the build) saves the game on the first visit, so later visits work with no connection.
// (Only in a production build: the development server has no worker file.)
if ('serviceWorker' in navigator && (import.meta as { env?: { PROD?: boolean } }).env?.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* no worker: the game still works online */ });
  });
}
