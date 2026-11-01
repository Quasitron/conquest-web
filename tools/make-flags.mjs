// Renders the small flag pictures the game shows beside a country's name (public/art/flags/<code>.webp, 64x48).
//   node tools/make-flags.mjs
// Needs two packages that are not part of the game: `flag-icons` (MIT, https://github.com/lipis/flag-icons) and `sharp`,
// installed under FLAG_PKG (default C:/Users/robta/theater-source-data/flagpkg). The code for each country comes from
// src/ui/flags.ts, so a new country only needs a line there. The Confederate States are drawn here (the First National
// flag, the "Stars and Bars"); the Union uses the United States flag.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = process.env.FLAG_PKG ?? 'C:/Users/robta/theater-source-data/flagpkg';
const require = createRequire(join(pkg, 'package.json'));
const sharp = require('sharp');
const src = join(pkg, 'node_modules/flag-icons/flags/4x3');
const out = new URL('../public/art/flags/', import.meta.url);
mkdirSync(out, { recursive: true });

const codes = [...readFileSync(new URL('../src/ui/flags.ts', import.meta.url), 'utf8').matchAll(/: '([a-z]{2})'/g)].map((m) => m[1]);

/** Seven white stars in a ring on a blue canton, over three bars: red, white, red. */
const stars = Array.from({ length: 7 }, (_, i) => {
  const a = (i / 7) * 2 * Math.PI - Math.PI / 2;
  const x = 8 + 5.2 * Math.cos(a);
  const y = 9 + 5.2 * Math.sin(a);
  const pts = Array.from({ length: 10 }, (_, k) => {
    const r = k % 2 === 0 ? 1.7 : 0.7;
    const t = (k / 10) * 2 * Math.PI - Math.PI / 2;
    return `${(x + r * Math.cos(t)).toFixed(2)},${(y + r * Math.sin(t)).toFixed(2)}`;
  });
  return `<polygon points="${pts.join(' ')}" fill="#fff"/>`;
}).join('');
const csa = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 36"><rect width="48" height="12" fill="#c8102e"/><rect y="12" width="48" height="12" fill="#fff"/><rect y="24" width="48" height="12" fill="#c8102e"/><rect width="19" height="18" fill="#002868"/>${stars}</svg>`;

const render = (input, name) => sharp(input, { density: 300 }).resize(64, 48, { fit: 'fill' }).webp({ quality: 88 }).toFile(new URL(`${name}.webp`, out).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

for (const code of new Set(codes)) await render(join(src, `${code}.svg`), code);
await render(Buffer.from(csa), 'csa');
console.log(`${new Set(codes).size + 1} flags written`);
