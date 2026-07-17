// Read-only DOM rendering for typed blocks — used by the composite preview
// and the world page. Since the Block Kit (docs/sheets/PLAN.md §3) this is a
// re-export: the per-type definitions live in engine/blocks/*, and static,
// editable, and Markdown rendering all come from the same file per type.

export { renderBlockStatic } from './blockKit.ts';
