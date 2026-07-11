// Bundles every table in src/data into an id-keyed registry (Vite glob import).
// Pilot-scale this is fine bundled whole; revisit per-page slicing in Phase 3
// when the dataset grows.

import type { Table, TableRegistry } from './types';

const modules = import.meta.glob<Table>('../data/**/*.json', { eager: true, import: 'default' });

export const registry: TableRegistry = new Map();
for (const table of Object.values(modules)) {
  registry.set(table.id, table);
}
