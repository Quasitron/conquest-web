// The historical theaters. `width` is the grid width in squares (the height follows from the area's shape, so squares are
// about square on the ground); change it and rebuild (node tools/theaters/build.mjs <id>) to make a map bigger or smaller.
// Optional tuning per theater: landPerCity, landThreshold, mountainMean/Peak, roughMean/Peak, forestShare, riverRank,
// minNationCities, lakeRank, startNations (the countries a player may start as; by default every country with enough cities).
export const THEATERS = [
  {
    id: 'western-europe',
    name: 'Western Europe & the Atlantic Coast',
    wars: 'Napoleonic Wars (1803–15) · World War I, the Western Front (1914–18) · World War II, the Battle of France and D-Day (1940–45)',
    notes: 'The British Isles to Poland, Scandinavia\'s southern tip to Gibraltar. Dense cities, the Alps and the Pyrenees, and the Channel between rivals.',
    bbox: { west: -12, east: 26, south: 35, north: 60 },
    width: 90,
    startNations: ['France', 'Germany', 'United Kingdom', 'Italy', 'Spain', 'Poland', 'Austria'],
    roughMean: 650,
    roughPeak: 1500,
    riverRank: 8,
  },
];
