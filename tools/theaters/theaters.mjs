// The historical theaters. `width` is the grid width in squares (the height follows from the area's shape, so squares are
// about square on the ground); change it and rebuild (node tools/theaters/build.mjs <id>) to make a map bigger or smaller.
// Optional tuning per theater: landPerCity, landThreshold, mountainMean/Peak, roughMean/Peak, forestShare, riverRank,
// minNationCities, lakeRank, startNations (the countries a player may start as; by default every country with enough cities),
// nationOverrides (city name -> country, where today's data disagrees with the history).
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
  {
    id: 'eastern-europe',
    name: 'Eastern Europe & Russia',
    wars: "Napoleon's invasion of Russia (1812) · World War I, the Eastern Front (1914–18) · Russian Civil War (1918–22) · World War II, from Barbarossa to Stalingrad and Kursk (1941–45)",
    notes: 'Berlin to the Volga and the Black Sea to the Gulf of Finland. A vast plain cut by great rivers, the Vistula, Dnieper, Don and Volga, with the Carpathians and the Caucasus along the southern edge and long marches between cities.',
    bbox: { west: 10, east: 60, south: 41, north: 64 },
    width: 100,
    landPerCity: 30,
    lakeRank: 4,
    riverRank: 8,
    roughMean: 600,
    roughPeak: 1400,
    startNations: ['Russia', 'Ukraine', 'Poland', 'Germany', 'Finland', 'Romania', 'Belarus'],
    // Natural Earth shows Crimea under Russia; for these wars it belongs with Ukraine.
    nationOverrides: { Sevastopol: 'Ukraine', Simferopol: 'Ukraine', Yalta: 'Ukraine', Kerch: 'Ukraine', Feodosiya: 'Ukraine', Yevpatoriya: 'Ukraine' },
  },
  {
    id: 'mediterranean',
    name: 'The Mediterranean & North Africa',
    wars: 'Punic Wars (264–146 BC) · The Crusades (1096–1291) · Battle of Lepanto (1571) · World War II: North Africa, Sicily and Italy (1940–45)',
    notes: 'The inland sea of the ancient and modern world, from Gibraltar to the Levant. Italy, the Balkans and the African coast face each other across short, contested crossings, with Malta, Sicily, Crete and Cyprus as the stepping stones, the Nile to the south and the Atlas, the Alps and the Taurus around the edges.',
    bbox: { west: -10, east: 37, south: 27, north: 46 },
    width: 110,
    landPerCity: 22,
    riverRank: 8,
    mountainMean: 1400, // the Anatolian plateau is high but not a mountain range
    mountainPeak: 2500,
    roughMean: 800,
    roughPeak: 1700,
    startNations: ['Italy', 'France', 'Spain', 'Greece', 'Turkey', 'Egypt', 'Libya', 'Algeria', 'Tunisia', 'Morocco', 'Syria'],
  },
];
