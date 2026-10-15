export const MIN_MAP = { width: 20, height: 20 } as const;
export const MAX_MAP = { width: 150, height: 200 } as const;

export function validateMapSize(width: number, height: number): string | null {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 'map size must be whole numbers';
  if (width < MIN_MAP.width || height < MIN_MAP.height) return `map must be at least ${MIN_MAP.width}×${MIN_MAP.height}`;
  if (width > MAX_MAP.width || height > MAX_MAP.height) return `map must be at most ${MAX_MAP.width}×${MAX_MAP.height}`;
  return null;
}
