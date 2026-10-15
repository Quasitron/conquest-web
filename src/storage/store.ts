import type { SaveFile } from './saveFormat';

export interface SaveSummary {
  name: string;
  savedAt: string;
  turn: number;
}

export interface SaveStore {
  list(): Promise<SaveSummary[]>;
  get(name: string): Promise<SaveFile | undefined>;
  put(save: SaveFile): Promise<void>;
  delete(name: string): Promise<void>;
}

export function summarize(save: SaveFile): SaveSummary {
  return { name: save.name, savedAt: save.savedAt, turn: save.snapshot.turn };
}

export function newestFirst(a: SaveSummary, b: SaveSummary): number {
  return b.savedAt.localeCompare(a.savedAt);
}

export class MemorySaveStore implements SaveStore {
  private saves = new Map<string, string>();

  async list(): Promise<SaveSummary[]> {
    return [...this.saves.values()].map((t) => summarize(JSON.parse(t) as SaveFile)).sort(newestFirst);
  }

  async get(name: string): Promise<SaveFile | undefined> {
    const t = this.saves.get(name);
    return t === undefined ? undefined : (JSON.parse(t) as SaveFile);
  }

  async put(save: SaveFile): Promise<void> {
    this.saves.set(save.name, JSON.stringify(save));
  }

  async delete(name: string): Promise<void> {
    this.saves.delete(name);
  }
}
