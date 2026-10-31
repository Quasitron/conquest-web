// Builds the historical theater maps from public-domain data. Run: node tools/theaters/build.mjs [theater-id ...]
//
// Sources (not kept in the repository; the data folder is THEATER_DATA, by default C:/Users/robta/theater-source-data):
//   Natural Earth (public domain): ne_50m_land, ne_50m_lakes, ne_10m_rivers_lake_centerlines, ne_10m_populated_places_simple,
//   ne_10m_geography_regions_polys (the desert regions)
//   Elevation: AWS Terrain Tiles (terrarium, built from SRTM, GMTED2010 and ETOPO1, among others), downloaded and cached
// Output: src/data/theaters/<id>.json for each theater and src/data/theaters/index.json (what the New Game menu lists).
//
// A theater's grid size is just `width` in theaters.mjs: change it and rebuild to make a map bigger or smaller.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { THEATERS } from './theaters.mjs';

const SRC = process.env.THEATER_DATA ?? 'C:/Users/robta/theater-source-data';
const OUT = path.resolve('src/data/theaters');
const TILE_ZOOM = 5;
const SAMPLES = 4; // fine samples per cell, per axis
const MIN_CITY_SPACING = 3;

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(SRC, `${name}.geojson`), 'utf8'));

// ---------------------------------------------------------------- elevation tiles (terrarium PNGs)
function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, depth = 0, colour = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colour = data[9]; if (data[12] !== 0) throw new Error('interlaced PNG'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (colour !== 2 && colour !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour ${colour})`);
  const bpp = colour === 2 ? 3 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255;
    }
  }
  return { width, height, bpp, data: out };
}

const tiles = new Map();
async function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tiles.has(key)) return tiles.get(key);
  const file = path.join(SRC, 'tiles', z.toString(), x.toString(), `${y}.png`);
  let buf;
  if (fs.existsSync(file)) buf = fs.readFileSync(file);
  else {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`);
    if (!res.ok) throw new Error(`tile ${key}: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
  }
  const png = decodePng(buf);
  tiles.set(key, png);
  return png;
}

/** Elevation in metres at a point (nearest pixel); the tiles it needs must be loaded already. */
function elevationAt(lon, lat) {
  const n = 2 ** TILE_ZOOM * 256;
  const px = Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const latR = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const py = Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n)));
  const t = tiles.get(`${TILE_ZOOM}/${Math.floor(px / 256)}/${Math.floor(py / 256)}`);
  if (!t) return 0;
  const i = ((py % 256) * 256 + (px % 256)) * t.bpp;
  return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
}

// ---------------------------------------------------------------- polygons onto a raster
function fillPolygons(features, mask, view, value) {
  const { west, east, north, south, RW, RH } = view;
  const toX = (lon) => ((lon - west) / (east - west)) * RW;
  const toY = (lat) => ((north - lat) / (north - south)) * RH;
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const rings = poly.map((ring) => ring.map(([lon, lat]) => [toX(lon), toY(lat)]));
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      for (const ring of rings) for (const [x, y] of ring) { if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x; }
      if (maxY < 0 || minY > RH || maxX < 0 || minX > RW) continue;
      for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(RH - 1, Math.ceil(maxY)); y++) {
        const yc = y + 0.5;
        const xs = [];
        for (const ring of rings) {
          for (let k = 0, n = ring.length; k < n; k++) {
            const a = ring[k], b = ring[(k + 1) % n];
            if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
          }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(RW - 1, Math.floor(xs[k + 1] - 0.5));
          for (let x = x0; x <= x1; x++) mask[y * RW + x] = value;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- small helpers
const hash = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, k) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, k), b = hash(x0 + 1, y0, k), c = hash(x0, y0 + 1, k), d = hash(x0 + 1, y0 + 1, k);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const ORTHO = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// ---------------------------------------------------------------- one theater
async function build(t, land50, lakes50, rivers, places, regions) {
  const { west, east, south, north } = t.bbox;
  const midLat = (north + south) / 2;
  const W = t.width;
  const H = Math.round((W * (north - south)) / ((east - west) * Math.cos((midLat * Math.PI) / 180)));
  const RW = W * SAMPLES, RH = H * SAMPLES;
  const view = { west, east, north, south, RW, RH };
  console.log(`\n== ${t.name}: ${W}x${H}`);

  // Land: fill the land polygons, take the lakes back out, then each cell is land when enough of it is.
  const mask = new Uint8Array(RW * RH);
  fillPolygons(land50.features, mask, view, 1);
  fillPolygons(lakes50.features.filter((f) => (f.properties.scalerank ?? 9) <= (t.lakeRank ?? 3)), mask, view, 0);
  const land = new Array(W * H).fill(false);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let n = 0;
    for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) n += mask[(j * SAMPLES + sy) * RW + i * SAMPLES + sx];
    land[j * W + i] = n / (SAMPLES * SAMPLES) >= (t.landThreshold ?? 0.4);
  }

  // Elevation: load the tiles the theater covers, then the mean and highest point of every cell.
  const n = 2 ** TILE_ZOOM;
  const tx = (lon) => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
  for (let x = tx(west); x <= tx(east); x++) for (let y = ty(Math.min(north, 84)); y <= ty(Math.max(south, -84)); y++) await tile(TILE_ZOOM, x, y);
  const meanElev = new Array(W * H).fill(0), maxElev = new Array(W * H).fill(0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let sum = 0, peak = -Infinity;
    for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) {
      const lon = west + ((i * SAMPLES + sx + 0.5) / RW) * (east - west);
      const lat = north - ((j * SAMPLES + sy + 0.5) / RH) * (north - south);
      const e = elevationAt(lon, lat);
      sum += e; if (e > peak) peak = e;
    }
    meanElev[j * W + i] = sum / (SAMPLES * SAMPLES);
    maxElev[j * W + i] = peak;
  }

  // Cities: the biggest real cities first (capitals before the rest), kept apart, one per land square.
  const cellOf = (lon, lat) => [Math.floor(((lon - west) / (east - west)) * W), Math.floor(((north - lat) / (north - south)) * H)];
  const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H;
  const landCells = land.filter(Boolean).length;
  const target = Math.round(landCells / (t.landPerCity ?? 24));
  const candidates = places.features
    .map((f) => f.properties)
    .filter((p) => p.longitude >= west && p.longitude <= east && p.latitude >= south && p.latitude <= north)
    .sort((a, b) => (b.featurecla === 'Admin-0 capital') - (a.featurecla === 'Admin-0 capital') || b.pop_max - a.pop_max);
  const cities = [];
  const taken = new Set();
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  for (const p of candidates) {
    if (cities.length >= target) break;
    let [ci, cj] = cellOf(p.longitude, p.latitude);
    if (!inside(ci, cj)) continue;
    if (!land[cj * W + ci]) { // a port on a coarse coast: the nearest land square beside it
      let best = null;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (inside(ci + di, cj + dj) && land[(cj + dj) * W + ci + di] && (!best || Math.abs(di) + Math.abs(dj) < Math.abs(best[0]) + Math.abs(best[1]))) best = [di, dj];
      }
      if (!best) continue;
      ci += best[0]; cj += best[1];
    }
    if (cities.some((c) => cheb([c.x, c.y], [ci, cj]) < MIN_CITY_SPACING)) continue;
    cities.push({ x: ci, y: cj, name: p.name, nation: t.nationOverrides?.[p.name] ?? p.adm0name, pop: p.pop_max, capital: p.featurecla === 'Admin-0 capital' });
    taken.add(cj * W + ci);
  }
  cities.sort((a, b) => a.y - b.y || a.x - b.x);

  // Relief: mountains and rough ground from the elevation, forest in patches, rivers from the real river lines.
  const relief = new Array(W * H).fill('clear');
  for (let k = 0; k < W * H; k++) {
    if (!land[k] || taken.has(k)) continue;
    const mean = meanElev[k], peak = maxElev[k];
    if (mean >= (t.mountainMean ?? 1000) || peak >= (t.mountainPeak ?? 2200)) relief[k] = 'mountain';
    else if (mean >= (t.roughMean ?? 450) || peak >= (t.roughPeak ?? 1000)) relief[k] = 'rough';
  }
  // Desert: open ground inside a desert region (Natural Earth's geography regions) becomes sand; rough ground and
  // mountains inside it stay as they are. `desertExcept` lists region names that are not really desert for this theater.
  if (t.desert !== false) {
    const dmask = new Uint8Array(RW * RH);
    fillPolygons(regions.features.filter((f) => f.properties.FEATURECLA === 'Desert' && !(t.desertExcept ?? []).includes(f.properties.NAME)), dmask, view, 1);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!land[k] || taken.has(k) || relief[k] !== 'clear') continue;
      let n = 0;
      for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++) n += dmask[(j * SAMPLES + sy) * RW + i * SAMPLES + sx];
      if (n / (SAMPLES * SAMPLES) >= 0.5) relief[k] = 'desert';
    }
  }
  const latOf = (j) => north - ((j + 0.5) / H) * (north - south);
  const clearCells = [];
  for (let k = 0; k < W * H; k++) if (land[k] && !taken.has(k) && relief[k] === 'clear') clearCells.push(k);
  const leafy = (k) => {
    const x = k % W, y = (k - x) / W, lat = Math.abs(latOf(y));
    if (lat > 17 && lat < 32) return -1; // the dry belt: no forest
    return vnoise(x / 5, y / 5, 7) * 0.7 + vnoise(x / 2.2, y / 2.2, 9) * 0.3;
  };
  const scored = clearCells.map((k) => [leafy(k), k]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0]);
  for (const [, k] of scored.slice(0, Math.round(clearCells.length * (t.forestShare ?? 0.22)))) relief[k] = 'forest';

  // Rivers: walk each river line across the squares, stepping one square at a time (so it is joined end to end).
  const isCity = (i, j) => inside(i, j) && taken.has(j * W + i);
  const open = (i, j) => inside(i, j) && land[j * W + i] && !taken.has(j * W + i) && relief[j * W + i] !== 'mountain';
  const river = new Set();
  const rank = t.riverRank ?? 6;
  for (const f of rivers.features) {
    if (f.properties.featurecla !== 'River' || (f.properties.scalerank ?? 99) > rank || !f.geometry) continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const line of lines) {
      const pts = line.map(([lon, lat]) => [((lon - west) / (east - west)) * W, ((north - lat) / (north - south)) * H]);
      if (pts.every(([x, y]) => x < -1 || y < -1 || x > W + 1 || y > H + 1)) continue;
      const path = [];
      let cx = Math.floor(pts[0][0]), cy = Math.floor(pts[0][1]);
      path.push([cx, cy]);
      for (let s = 1; s < pts.length; s++) {
        const [x1, y1] = pts[s];
        const tx1 = Math.floor(x1), ty1 = Math.floor(y1);
        let guard = 0;
        while ((cx !== tx1 || cy !== ty1) && guard++ < 4000) {
          // Step along whichever axis is further from the target (a stepped line that stays 4-connected).
          const dx = tx1 - cx, dy = ty1 - cy;
          if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) cx += Math.sign(dx); else cy += Math.sign(dy);
          path.push([cx, cy]);
        }
      }
      // Keep the squares that are open ground; step round a city (or a gap) by the side so the river stays joined.
      let prev = null, skipped = null;
      for (const [i, j] of path) {
        if (prev && prev[0] === i && prev[1] === j) continue;
        if (open(i, j)) {
          if (skipped && prev && open(prev[0], prev[1])) {
            const [pi, pj] = prev;
            const di = i - pi, dj = j - pj;
            if (Math.abs(di) + Math.abs(dj) === 2) { // one square (a city) in between: go round it
              const mi = skipped[0], mj = skipped[1];
              const options = di !== 0 && dj !== 0
                ? [[[pi + di, pj]], [[pi, pj + dj]]]
                : di !== 0 ? [[[pi, pj + 1], [mi, mj + 1], [i, j + 1]], [[pi, pj - 1], [mi, mj - 1], [i, j - 1]]]
                : [[[pi + 1, pj], [mi + 1, mj], [i + 1, j]], [[pi - 1, pj], [mi - 1, mj], [i - 1, j]]];
              const way = options.find((o) => o.every(([a, b]) => open(a, b)));
              if (way) for (const [a, b] of way) river.add(b * W + a);
            }
          }
          river.add(j * W + i);
          skipped = null;
        } else if (isCity(i, j) && prev && open(prev[0], prev[1])) skipped = [i, j];
        else skipped = null;
        prev = [i, j];
      }
    }
  }
  // Only what runs down to the water counts: keep the river squares joined to a square beside the sea or a lake.
  const alive = new Set();
  const queue = [];
  for (const k of river) {
    const x = k % W, y = (k - x) / W;
    if (ORTHO.some(([dx, dy]) => inside(x + dx, y + dy) && !land[(y + dy) * W + x + dx])) { alive.add(k); queue.push(k); }
  }
  while (queue.length) {
    const k = queue.pop();
    const x = k % W, y = (k - x) / W;
    for (const [dx, dy] of ORTHO) { const m = (y + dy) * W + x + dx; if (inside(x + dx, y + dy) && river.has(m) && !alive.has(m)) { alive.add(m); queue.push(m); } }
  }
  for (const k of alive) relief[k] = 'river';

  // Nations: every country with enough cities can be a player's home; its capital (or biggest city) is where it starts.
  const byNation = new Map();
  cities.forEach((c, index) => { const a = byNation.get(c.nation) ?? []; a.push(index); byNation.set(c.nation, a); });
  const nations = [...byNation.entries()]
    .filter(([name, list]) => (t.startNations ? t.startNations.includes(name) : true) && list.length >= (t.minNationCities ?? 4))
    .map(([name, list]) => {
      const capital = list.find((i) => cities[i].capital) ?? list.sort((a, b) => cities[b].pop - cities[a].pop)[0];
      return { name, cities: list.length, start: capital };
    })
    .sort((a, b) => b.cities - a.cities);

  // A picture of it for checking.
  const rows = [];
  for (let j = 0; j < H; j++) {
    let row = '';
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      row += taken.has(k) ? 'C' : !land[k] ? '~' : { clear: '.', mountain: 'm', rough: 'r', forest: 'f', river: 'v', desert: 'd' }[relief[k]];
    }
    rows.push(row);
  }
  const count = (r) => relief.filter((x, k) => land[k] && x === r).length;
  console.log(`land ${landCells} cells, ${cities.length} cities (target ${target}), mountain ${count('mountain')}, rough ${count('rough')}, forest ${count('forest')}, river ${count('river')}, desert ${count('desert')}`);
  console.log(`nations: ${nations.map((x) => `${x.name} ${x.cities}`).join(', ')}`);
  fs.mkdirSync(path.join(SRC, 'previews'), { recursive: true });
  fs.writeFileSync(path.join(SRC, 'previews', `${t.id}.txt`), rows.join('\n') + '\n'); // a picture to check the map by (~ water, C city, m r f v terrain)

  const terrainRows = [];
  for (let j = 0; j < H; j++) terrainRows.push(rows[j].replace(/[^~C]/g, '.'));
  const reliefRows = [];
  for (let j = 0; j < H; j++) {
    let row = '';
    for (let i = 0; i < W; i++) { const k = j * W + i; row += !land[k] ? '~' : { clear: 'c', mountain: 'm', rough: 'r', forest: 'f', river: 'v', desert: 'd' }[relief[k]]; }
    reliefRows.push(row);
  }
  const full = {
    id: t.id, name: t.name, wars: t.wars, notes: t.notes,
    width: W, height: H, wrap: !!t.wrap,
    terrain: terrainRows, relief: reliefRows,
    cities: cities.map(({ x, y, name, nation }) => ({ x, y, name, nation })),
    nations: nations.map((x) => ({ name: x.name, start: x.start })),
  };
  fs.writeFileSync(path.join(OUT, `${t.id}.json`), JSON.stringify(full));
  return { id: t.id, name: t.name, wars: t.wars, notes: t.notes, width: W, height: H, wrap: !!t.wrap, cities: cities.length, nations: nations.map((x) => x.name) };
}

fs.mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const todo = THEATERS.filter((t) => wanted.length === 0 || wanted.includes(t.id));
const land50 = readJson('ne_50m_land');
const lakes50 = readJson('ne_50m_lakes');
const rivers = readJson('ne_10m_rivers_lake_centerlines');
const places = readJson('ne_10m_populated_places_simple');
const regions = readJson('ne_10m_geography_regions_polys');
const summaries = [];
for (const t of todo) summaries.push(await build(t, land50, lakes50, rivers, places, regions));
const indexFile = path.join(OUT, 'index.json');
const previous = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : [];
const merged = [...previous.filter((p) => !summaries.some((s) => s.id === p.id)), ...summaries]
  .sort((a, b) => THEATERS.findIndex((t) => t.id === a.id) - THEATERS.findIndex((t) => t.id === b.id));
fs.writeFileSync(indexFile, JSON.stringify(merged, null, 1));
console.log('\nWrote', summaries.map((s) => s.id).join(', '));
