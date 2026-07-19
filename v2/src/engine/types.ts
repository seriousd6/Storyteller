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
  /** Presentation hint: 'statblock' renders the rolled line as a stat card
   *  (AC/HP/abilities grid) instead of prose. Purely visual — the rolled TEXT
   *  stays the canonical value that pin/copy/save/one-pager all carry. */
  render?: 'statblock';
}

/** Presentation-only grouping for a generator's one-page sheet. Slots are
 *  referenced by id; any slot no section claims still renders (in a trailing
 *  catch-all), so a new slot is never silently invisible. */
export interface GeneratorPageSection {
  /** Small-caps section heading; omit for an unheaded band. */
  title?: string;
  slots: string[];
  /** Lay the entries out as a multi-column run of short facts. */
  columns?: boolean;
}

export interface GeneratorPage {
  /** Slot id featured as the sheet's big serif heading (defaults to a slot
   *  literally named `name`, matching generatorTemplate's title promotion). */
  lead?: string;
  /** Slot id for the italic line under the lead (vocation, kind, …). */
  sub?: string;
  sections?: GeneratorPageSection[];
}

export interface GeneratorConfig {
  id: string;
  title: string;
  pillar: 'gm' | 'solo' | 'writing';
  description?: string;
  slots: SlotConfig[];
  /** Optional one-page-sheet layout hints. Rendering only — the slot list and
   *  its order stay the seed-derivation contract (engine/generatorTemplate). */
  page?: GeneratorPage;
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
  /** 5e-style fade (PLAN.md §14): a grayscale mask applied with mask-image.
   *  Block props only — the source pixels are never touched, so fades are
   *  reversible and re-themable. `mask` names an id in engine/genres MASKS. */
  fade?: { mask: string; strength: number; flip?: boolean };
  /** multiply melts the art into the parchment behind it */
  blend?: 'normal' | 'multiply';
  id?: string;
  source?: BlockSource;
}

/** Side-by-side columns (PLAN.md §10) — the two-column book look. Each
 *  column holds ordered child blocks; print and the page view keep them
 *  side by side, the linear editor edits them in place. */
export interface ColumnsBlock {
  type: 'columns';
  columns: Block[][];
  id?: string;
  source?: BlockSource;
}

/** A live reference to a world entity (owner decision 2026-07-18, PLAN.md
 *  §21.10): the sheet renders and EDITS the entity's own blocks — one copy
 *  of the data in the world store, two surfaces. Never a snapshot. */
export interface EntityRefBlock {
  type: 'entityRef';
  worldId: string;
  entityId: string;
  id?: string;
  source?: BlockSource;
}

/** A single-select field: a labelled dropdown whose value is one of `options`
 *  (a subclass feature, a fighting style, a damage type…). Emitted with a
 *  rolled value; the player can pick another, or add their own option. Renders
 *  as a <select> in the sheet, as its value in print/preview. */
export interface ChoiceBlock {
  type: 'choice';
  label: string;
  value: string;
  options: string[];
  id?: string;
  source?: BlockSource;
}

/** A multi-select field: a labelled group of dropdowns, each choosing one of a
 *  shared `options` pool (a spellbook level, a warlock's invocations). Emitted
 *  with rolled `values`; the player can re-pick any row, add a row, or remove
 *  one. Renders as a list of <select>s in the sheet, a bullet list in print. */
export interface ChoiceListBlock {
  type: 'choiceList';
  label: string;
  options: string[];
  values: string[];
  /** When 'spell', the values render as hoverable spell chips outside edit mode
   *  (a spellbook you read in play/print, and pick from as dropdowns in edit). */
  hover?: 'spell';
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
  | ImageBlock
  | ColumnsBlock
  | EntityRefBlock
  | ChoiceBlock
  | ChoiceListBlock;
