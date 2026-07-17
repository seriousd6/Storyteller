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

export type Block =
  | TitleBlock
  | ParagraphBlock
  | KeyValueBlock
  | ListBlock
  | TableBlock
  | StatblockBlock
  | RollTableBlock
  | PageBreakBlock;
