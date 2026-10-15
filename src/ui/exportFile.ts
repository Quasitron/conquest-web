import { serializeSave, type SaveFile } from '../storage';

export function downloadSave(save: SaveFile): void {
  const blob = new Blob([serializeSave(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${save.name.replace(/[^\w-]+/g, '_') || 'conquest-save'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function pickFileText(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => resolve(input.files?.[0] ? await input.files[0].text() : null);
    input.click();
  });
}
