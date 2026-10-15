import type { SaveFile } from './saveFormat';
import { newestFirst, summarize, type SaveStore, type SaveSummary } from './store';

const DB_NAME = 'conquest-web';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

/** Browser save slots in IndexedDB. Not unit-tested; covered by the manual browser check. */
export class IndexedDbSaveStore implements SaveStore {
  async list(): Promise<SaveSummary[]> {
    const all = await run<SaveFile[]>('readonly', (s) => s.getAll() as IDBRequest<SaveFile[]>);
    return all.map(summarize).sort(newestFirst);
  }

  async get(name: string): Promise<SaveFile | undefined> {
    return run<SaveFile | undefined>('readonly', (s) => s.get(name) as IDBRequest<SaveFile | undefined>);
  }

  async put(save: SaveFile): Promise<void> {
    await run('readwrite', (s) => s.put(save));
  }

  async delete(name: string): Promise<void> {
    await run('readwrite', (s) => s.delete(name));
  }
}
