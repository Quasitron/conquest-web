import { flagUrl } from './flags';

/** A country's small flag beside its name; nothing when the name is not a country (a random map's players, a renamed seat). */
export function Flag({ name }: { name: string }) {
  const url = flagUrl(name);
  return url ? <img class="flag" src={url} alt="" width={20} height={15} /> : null;
}
