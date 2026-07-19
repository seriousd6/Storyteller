// One-off visual check for the flat-cut portraits.ts port: renders every race
// (both sexes) plus a 12-human strip from the REAL module, screenshots it.
// Not part of the gate; delete-safe.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildPortraitSVG, defaultRecipe, RACES } from '../src/everdeep/portraits.ts';

const dir = new URL('.', import.meta.url).pathname.replace(/^\//, '');
let tiles = '';
for (const race of RACES) for (const sex of ['female', 'male']) {
  const seed = 'port-check-' + race + '-' + sex;
  tiles += '<div class="t">' + buildPortraitSVG(defaultRecipe(seed, race, sex), seed) + '<span>' + sex[0] + ' ' + race + '</span></div>';
}
for (let i = 0; i < 12; i++) {
  const seed = 'port-kin-' + i;
  tiles += '<div class="t">' + buildPortraitSVG(defaultRecipe(seed, 'human', i % 2 ? 'male' : 'female'), seed) + '<span>human ' + (i + 1) + '</span></div>';
}
const html = '<!doctype html><meta charset="utf-8"><style>body{background:#20242b;margin:16px;font:11px system-ui;color:#cbc5b4}' +
  '.g{display:grid;grid-template-columns:repeat(10,1fr);gap:8px}.t{text-align:center}.t svg{width:100%;height:auto;border-radius:6px;display:block}</style>' +
  '<div class="g">' + tiles + '</div>';
const out = process.argv[2] ?? 'portrait-check.html';
writeFileSync(out, html);
console.log('wrote', out, '- tiles:', (tiles.match(/<svg/g) || []).length);
void pathToFileURL;
