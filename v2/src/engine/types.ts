// Core engine types. Tables mirror schemas/table.schema.json; blocks mirror
// schemas/block.schema.json — generators emit blocks, never HTML strings.

export interface TableEntryObject {
  text: string;
  weight?: number;
  tags?: string[];
}

export type TableEntry = string | TableEntryObject;

export interface TableCredit {
  source: string;
  url?: string;
}

export interface Table {
  id: string;
  title: string;
  pillar: 'gm' | 'solo' | 'writing';
  description?: string;
  tags?: string[];
  credits?: TableCredit[];
  entries: TableEntry[];
}

export type TableRegistry = Map<string, Table>;

/** A generator page is a list of slots; each slot renders one template. */
export interface SlotConfig {
  id: string;
  label: string;
  template: string;
}

export interface GeneratorConfig {
  id: string;
  title: string;
  pillar: 'gm' | 'solo' | 'writing';
  description?: string;
  slots: SlotConfig[];
}

export interface BlockSource {
  generator?: string;
  seed?: string;
}

export interface TitleBlock {
  type: 'title';
  text: string;
  subtitle?: string;
  id?: string;
  source?: BlockSource;
}

export interface ParagraphBlock {
  type: 'paragraph';
  text: string;
  label?: string;
  id?: string;
  source?: BlockSource;
}

export interface KeyValueBlock {
  type: 'keyValue';
  pairs: { key: string; value: string }[];
  id?: string;
  source?: BlockSource;
}

export interface ListBlock {
  type: 'list';
  items: string[];
  label?: string;
  ordered?: boolean;
  id?: string;
  source?: BlockSource;
}

export interface TableBlock {
  type: 'table';
  columns: string[];
  rows: string[][];
  label?: string;
  id?: string;
  source?: BlockSource;
}

export interface StatblockBlock {
  type: 'statblock';
  name: string;
  meta?: string;
  sections: Block[];
  id?: string;
  source?: BlockSource;
}

/** One kept result of a rollTable widget: re-derivable from (ref, seed). */
export interface RollTableResult {
  text: string;
  seed: string;
}

export interface RollTableBlock {
  type: 'rollTable';
  /** table id, e.g. 'gm/tavern/rumor' (user brews join in Phase 2) */
  ref: string;
  title?: string;
  /** 'button' (default) = compact roll button; 'full' = rendered listing */
  display?: 'button' | 'full';
  /** how many results to keep (default 5) */
  keep?: number;
  results?: RollTableResult[];
  id?: string;
  source?: BlockSource;
}

export interface PageBreakBlock {
  type: 'pageBreak';
  id?: string;
  source?: BlockSource;
}

/** A resource tracker: HP, spell slots, ammunition, siege morale (PLAN.md §6).
 *  Exposes $<slug> and $<slug>.max to the sheet's var scope. */
export interface TrackerBlock {
  type: 'tracker';
  label: string;
  current: number;
  max?: number;
  /** boxes (default when max ≤ 20), bar, or a plain number */
  style?: 'boxes' | 'bar' | 'number';
  id?: string;
  source?: BlockSource;
}

/** The classic attribute strip (PLAN.md §6). System-agnostic; `computeMods`
 *  adds the d20 (v-10)/2 line, `rollable` makes each box roll its check. */
export interface StatGridBlock {
  type: 'statGrid';
  stats: { label: string; value: string; sub?: string }[];
  computeMods?: boolean;
  rollable?: boolean;
  id?: string;
  source?: BlockSource;
}

/** Attacks / spells / abilities as named roll buttons (PLAN.md §6).
 *  "check / save / attack" are template vocabulary, not engine concepts. */
export interface ActionsBlock {
  type: 'actions';
  title?: string;
  items: {
    label: string;
    rolls: { name: string; formula: string }[];
    note?: string;
  }[];
  id?: string;
  source?: BlockSource;
}

/** An uploaded image (PLAN.md §14): references a content-hashed asset in
 *  the asset store; the block itself stays tiny JSON. */
export interface ImageBlock {
  type: 'image';
  /** content hash in stb:assets; absent = an empty upload slot */
  assetId?: string;
  caption?: string;
  /** float-right (character-portrait classic), float-left, or full-width */
  layout?: 'block' | 'float-left' | 'float-right';
  id?: string;
  source?: BlockSource;
}

export type Block =
  | TitleBlock
  | ParagraphBlock
  | KeyValueBlock
  | ListBlock
  | TableBlock
  | StatblockBlock
  | RollTableBlock
  | PageBreakBlock
  | TrackerBlock
  | StatGridBlock
  | ActionsBlock
  | ImageBlock;
