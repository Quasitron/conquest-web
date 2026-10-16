/** After a pointer click, release focus so keys keep going to the map. */
export const blur = (e: Event) => (e.currentTarget as HTMLElement).blur();
