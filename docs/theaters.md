# Historical theaters

Real maps of the world's classic theaters of war, chosen from the New Game menu (Map: Historical theater). Each player is
given a different real country, picked at random from the game seed, and starts in its capital (the country's name replaces
"Player N" unless the seat was renamed). Cities are real, with real names and positions; mountains, rough ground and rivers
(with the Advanced units rule) follow the real geography.

## How they are made

`node tools/theaters/build.mjs [id ...]` builds the maps; `tools/theaters/theaters.mjs` lists them. Nothing is drawn by hand.

| Ingredient | Source | Licence |
|---|---|---|
| Coastlines, lakes | Natural Earth 1:50m land and lakes | public domain |
| Rivers | Natural Earth 1:10m river centrelines | public domain |
| Cities, capitals, countries | Natural Earth 1:10m populated places | public domain |
| Deserts | Natural Earth 1:10m geography regions (the "Desert" features: Sahara, Libyan, Arabian, Gobi and the rest) | public domain |
| Elevation (mountains, rough ground) | AWS Terrain Tiles, terrarium, zoom 5 (built from SRTM, GMTED2010, ETOPO1 and others) | open data; credit the sources |

The downloaded data is kept outside the repository (`THEATER_DATA`, default `C:/Users/robta/theater-source-data`); what the
game ships is the small result, `src/data/theaters/<id>.json` (about 25 KB a theater), loaded only when a game starts.

**Resizing.** A theater's grid width is one number in `theaters.mjs` (`width`); the height follows from the area's shape so
squares are about square on the ground. Change it and rebuild to make a theater bigger or smaller: the same data gives more
or fewer cities (`landPerCity`), mountains and rivers at the new detail.

**Tuning.** Per theater: `landThreshold` (how much of a square must be land), `landPerCity`, `mountainMean`/`mountainPeak`,
`roughMean`/`roughPeak` (metres), `forestShare`, `riverRank` (bigger = more, smaller rivers), `lakeRank`, `minNationCities`
and `startNations` (the countries a player may start as). The build prints the land, city, terrain and river counts and
writes a picture of the map to `<THEATER_DATA>/previews/<id>.txt` to check it by.

## Notes

- Countries are today's borders (Natural Earth), so a 1940 Soviet Union or a 1914 Austro-Hungarian Empire is shown as the
  modern countries that cover it.
- Desert is open sand that plays exactly like Clear ground (nothing slows Armor, no defence bonus); only the picture
  differs (`public/art/terrain/desert.webp`, made from `Desert_3` by tools/make-terrain-tiles.ps1). Open ground inside a
  desert region becomes sand; rough ground and mountains inside it stay. `desert: false` turns it off for a theater and
  `desertExcept` lists region names to ignore.
- Forests are not real: there is no public land-cover layer in the data above, so forest is patchy and kept out of the dry belt.
- Rivers run only where they reach the water, never through a mountain square or a city (they step round a city).
