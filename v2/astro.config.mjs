// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://storytellertoolbox.com',
  // ES-module workers so the worldgen worker (batch 71) can code-split its
  // dynamic import of the lazy Earth grid.
  vite: { worker: { format: 'es' } },
});
