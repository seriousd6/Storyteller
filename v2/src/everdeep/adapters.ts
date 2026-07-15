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
  // a person's race and gender are FACTS of the roll (owner, batch 18):
  // pull them from the statblock meta ("Human (female) · Baker…") so the
  // page fields — and the portrait locks — carry them from birth
  const sb = blocks.find((b) => (b as { type?: string }).type === 'statblock') as { meta?: string } | undefined;
  const m = sb?.meta ? /^([A-Za-z -]+?)\s*(?:\(\s*(male|female)\s*\))?\s*(?:·|$)/.exec(sb.meta) : null;
  if (m && e.kind === 'person') {
    e.fields ??= {};
    if (e.fields.race === undefined) e.fields.race = m[1]!.trim();
    if (m[2] && e.fields.gender === undefined) e.fields.gender = m[2];
  }
  // a settlement's scale is a FACT of the roll too (batch 26): size tag and
  // population flow from the statblock so the page always agrees with the map.
  // Batch 76: the node TYPE and the GOVERNMENT are promoted into structured
  // fields too, so context threading (lawOfTheLand) and downstream generators
  // (a kingdom's supporting web) can consume them instead of re-parsing prose.
  if (e.kind === 'settlement' && sb?.meta) {
    const sm = /^(Hamlet|Village|Town|City)\s*·\s*pop\.\s*([\d,]+)(?:\s*·\s*(.+))?/i.exec(sb.meta);
    if (sm) {
      e.fields ??= {};
      if (e.fields.population === undefined) e.fields.population = Number(sm[2]!.replace(/,/g, ''));
      const cls = sm[1]!.toLowerCase();
      e.tags ??= [];
      if (!e.tags.some((t) => ['hamlet', 'village', 'town', 'city'].includes(t))) {
        e.tags.push(cls === 'hamlet' ? 'village' : cls);
      }
      if (sm[3] && e.fields.settleType === undefined) e.fields.settleType = sm[3].trim();
    }
    // pull the Government value out of the statblock's keyValue pairs, stripping
    // the "— the realm's law runs here" / "(no writ)" annotations so the stored
    // field is the bare government a child settlement can inherit.
    if (e.fields?.government === undefined) {
      const kv = (sb as unknown as { sections?: Array<{ type?: string; pairs?: Array<{ key?: string; value?: string }> }> }).sections;
      for (const s of kv ?? []) {
        if (s.type !== 'keyValue') continue;
        const gov = s.pairs?.find((p) => p.key === 'Government')?.value;
        if (gov) {
          const bare = gov.replace(/\s*—\s*the realm's law runs here.*$/i, '').replace(/\s*\(the realm holds no writ here\)\s*$/i, '').trim();
          if (bare) { e.fields ??= {}; e.fields.government = bare; }
          break;
        }
      }
    }
  }
  return e;
}
