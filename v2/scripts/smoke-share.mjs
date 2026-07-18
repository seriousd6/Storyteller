// Sheet files + share links smoke (PLAN.md §21.5): the codec, pinned.
// Run: node scripts/smoke-share.mjs

import { readFileSync } from 'node:fs';
import {
  KNOWN_BLOCK_TYPES,
  SHEET_FILE_VERSION,
  packSheet,
  unpackSheet,
  encodeShare,
  decodeShare,
} from '../src/engine/sheetShare.ts';

let failed = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed += 1;
};

// --- the known-types list IS the schema enum; drift fails here, not in a user's import
const schema = JSON.parse(readFileSync(new URL('../schemas/block.schema.json', import.meta.url), 'utf8'));
const schemaEnum = schema.properties.type.enum;
ok(
  JSON.stringify([...KNOWN_BLOCK_TYPES].sort()) === JSON.stringify([...schemaEnum].sort()),
  `KNOWN_BLOCK_TYPES matches block.schema.json enum (${KNOWN_BLOCK_TYPES.length} vs ${schemaEnum.length})`,
);

const BLOCKS = [
  { type: 'title', text: 'The Sunken Crypt', id: 'pin-1' },
  { type: 'paragraph', text: 'A dungeon for 4–6 adventurers.', id: 'pin-2' },
  {
    type: 'table',
    label: 'Random Encounters',
    columns: ['d6', 'Encounter'],
    rows: [['1', '2d4 stirges'], ['2', 'A will-o-wisp']],
    id: 'pin-3',
  },
  { type: 'tracker', label: 'Torches', current: 3, max: 5, style: 'boxes', id: 'pin-4' },
];

// --- pack → unpack round-trip
const packed = packSheet('The Sunken Crypt', BLOCKS);
const un = unpackSheet(packed);
ok(un !== null, 'packed sheet unpacks');
ok(un?.name === 'The Sunken Crypt', 'name survives');
ok(JSON.stringify(un?.blocks) === JSON.stringify(BLOCKS), 'blocks survive byte-for-byte');
ok(un?.dropped === 0, 'nothing dropped');
ok(JSON.parse(packed).version === SHEET_FILE_VERSION, `file carries version ${SHEET_FILE_VERSION}`);

// --- not a sheet file → null, never a half-import
ok(unpackSheet('') === null, 'empty text → null');
ok(unpackSheet('<div></div>') === null, 'junk text → null');
ok(unpackSheet('{"a":1}') === null, 'random JSON → null');
ok(unpackSheet('{"format":"storyteller-sheet"}') === null, 'sheet file without blocks → null');
ok(unpackSheet('# A Brew') === null, 'markdown → null (falls through to the brew importer)');

// --- forward compatibility: unknown block types drop, counted, known ones kept
const future = JSON.stringify({
  format: 'storyteller-sheet',
  version: 99,
  blocks: [BLOCKS[0], { type: 'hologram', beam: true }, BLOCKS[1]],
});
const fut = unpackSheet(future);
ok(fut?.blocks.length === 2 && fut?.dropped === 1, `newer file: known blocks kept, unknown counted (${fut?.blocks.length} kept, ${fut?.dropped} dropped)`);
ok(fut?.name === 'Imported sheet', 'missing name gets a fallback');

// --- share link: encode → decode round-trip
const encoded = await encodeShare('The Sunken Crypt', BLOCKS);
ok(/^[A-Za-z0-9_-]+$/.test(encoded), 'encoded link is base64url — safe in a hash, no escaping');
const dec = await decodeShare(encoded);
ok(dec?.name === 'The Sunken Crypt', 'decoded name matches');
ok(JSON.stringify(dec?.blocks) === JSON.stringify(BLOCKS), 'decoded blocks match byte-for-byte');
ok(encoded.length < packSheet('The Sunken Crypt', BLOCKS).length, `deflate earns its keep (${encoded.length} chars vs ${packed.length} raw)`);

// --- damaged links → null, never a throw
ok((await decodeShare('not-a-real-link')) === null, 'garbage → null');
ok((await decodeShare(encoded.slice(0, Math.floor(encoded.length / 2)))) === null, 'truncated paste → null');
ok((await decodeShare('')) === null, 'empty → null');

if (failed > 0) {
  console.error(`smoke-share: ${failed} FAILED`);
  process.exit(1);
}
console.log('smoke-share: all green');
