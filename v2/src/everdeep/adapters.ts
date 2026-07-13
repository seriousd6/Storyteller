// Entity adapters: turn a generator's Block[] output into an Everdeep entity
// (ARCHITECTURE.md §5.1). This is the generation→wiki bridge — donjon-style
// results stop being dead text and become linked, editable pages. v1 maps
// each composite to a kind and carries the blocks as the page body with
// provenance; field extraction and ghost children deepen in later slices.

import type { Block, StatblockBlock, TitleBlock } from '../engine/types.ts';
import { newEntity, type EntityRecord } from '../engine/worldStore.ts';

/** Composite meta.id → entity kind (ARCHITECTURE.md §5.3 binding map). */
const KIND_BY_TOOL: Record<string, string> = {
  'gm/npc-block': 'person',
  'gm/tavern-page': 'building',
  'gm/shop-page': 'building',
  'gm/encounter': 'event',
  'gm/hoard': 'item',
  'gm/landmark': 'landmark',
  'gm/settlement': 'settlement',
};

export function kindForGenerator(metaId: string): string {
  return KIND_BY_TOOL[metaId] ?? 'note';
}

/** Pull a page name out of generated blocks: statblock name, then title text. */
export function extractName(blocks: Block[], fallback: string): string {
  const sb = blocks.find((b): b is StatblockBlock => b.type === 'statblock');
  if (sb?.name) return sb.name;
  const title = blocks.find((b): b is TitleBlock => b.type === 'title');
  if (title?.text) return title.text;
  return fallback;
}

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
function blockId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  let s = '';
  for (const b of buf) s += BASE36[b % 36];
  return 'b_' + s;
}

/** Build a stored entity from a generator run. Blocks are cloned and given
 *  the stable ids entity bodies require (CONTRACTS.md §7). */
export function blocksToEntity(
  metaId: string,
  seed: string,
  blocks: Block[],
  fallbackName: string,
  parentId?: string,
): EntityRecord {
  const e = newEntity(kindForGenerator(metaId), extractName(blocks, fallbackName), parentId);
  e.body = blocks.map((b) => {
    const copy = structuredClone(b) as Block & { id: string };
    copy.id = blockId();
    return copy;
  }) as unknown as NonNullable<EntityRecord['body']>;
  e.gen = {
    generator: `composite:${metaId}`,
    seed,
    genVersion: 1,
    overrides: [],
  };
  return e;
}
