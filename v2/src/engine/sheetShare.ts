// Sheet files and share links (PLAN.md §21.5): a sheet leaves this device as
// a small versioned JSON file, or as a URL that carries the whole sheet in its
// hash — no server, nothing uploaded, the link IS the data. Both wrap the same
// pack/unpack pair; the link adds deflate + base64url around it.
//
// Pure module: no DOM, no stores. Node imports it directly (smoke-share.mjs),
// which also pins KNOWN_BLOCK_TYPES against schemas/block.schema.json so this
// list cannot drift from the schema without a smoke failure.

import type { Block } from './types.ts';

export const SHEET_FILE_FORMAT = 'storyteller-sheet';
export const SHEET_FILE_VERSION = 1;

export const KNOWN_BLOCK_TYPES: readonly string[] = [
  'title',
  'paragraph',
  'keyValue',
  'list',
  'table',
  'statblock',
  'rollTable',
  'pageBreak',
  'tracker',
  'statGrid',
  'actions',
  'image',
  'columns',
  'entityRef',
  'choice',
  'choiceList',
];

export interface UnpackedSheet {
  name: string;
  blocks: Block[];
  /** Blocks whose type this build doesn't know (a file from a newer site?)
   *  are dropped, not imported broken — but never silently. */
  dropped: number;
}

/** The .json file a sheet exports as. Pretty-printed: it's the user's data
 *  and they may well read or hand-edit it. */
export function packSheet(name: string, blocks: Block[]): string {
  return JSON.stringify(
    { format: SHEET_FILE_FORMAT, version: SHEET_FILE_VERSION, name, blocks },
    null,
    2,
  );
}

/** Parse a sheet file (or share payload). Returns null only when the text is
 *  not a sheet file at all; a recognized file with unknown block types keeps
 *  the known blocks and counts the rest in `dropped`. */
export function unpackSheet(text: string): UnpackedSheet | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.format !== SHEET_FILE_FORMAT) return null;
  if (!Array.isArray(obj.blocks)) return null;
  const known: Block[] = [];
  let dropped = 0;
  for (const b of obj.blocks) {
    const isBlock =
      typeof b === 'object' && b !== null && KNOWN_BLOCK_TYPES.includes((b as Block).type);
    if (isBlock) known.push(b as Block);
    else dropped += 1;
  }
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Imported sheet';
  return { name, blocks: known, dropped };
}

// --- share links: deflate-raw + base64url over the compact pack ---
// btoa/atob and Compression/DecompressionStream are globals in every browser
// this site supports AND in Node ≥18, so the smoke drives the identical code.

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** The hash payload for /sheet/#share=… */
export async function encodeShare(name: string, blocks: Block[]): Promise<string> {
  const json = JSON.stringify({ format: SHEET_FILE_FORMAT, version: SHEET_FILE_VERSION, name, blocks });
  const deflated = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
  return toBase64Url(deflated);
}

/** Decode a #share= payload. Null on any damage — a truncated paste, a
 *  mangled character, someone else's fragment. Never throws. */
export async function decodeShare(encoded: string): Promise<UnpackedSheet | null> {
  try {
    const inflated = await pipe(fromBase64Url(encoded.trim()), new DecompressionStream('deflate-raw'));
    return unpackSheet(new TextDecoder().decode(inflated));
  } catch {
    return null;
  }
}
