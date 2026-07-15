// World-generation worker (batch 71). Rivers + settlements + roads are seconds
// of synchronous compute on an Earth-size world; running them here keeps the UI
// thread free so "Building your world…" animates instead of freezing. The worker
// returns only serialisable data (routes, lake paint, settlement nodes, bridges);
// the main thread turns those into entities/anchors and writes the world.

import type { TerrainCfg } from './terrain.ts';
import { ensureEarthGrid } from './terrain.ts';
import { generateHydrology } from './hydrology.ts';
import { generateSettlements } from './settlements.ts';

const ctx = self as unknown as { onmessage: ((ev: MessageEvent) => void) | null; postMessage: (m: unknown) => void };

ctx.onmessage = async (ev: MessageEvent) => {
  const cfg = (ev.data as { cfg: TerrainCfg }).cfg;
  try {
    if (cfg.landform === 'earth') await ensureEarthGrid();
    ctx.postMessage({ type: 'progress', stage: 'rivers' });
    const hy = generateHydrology(cfg);
    ctx.postMessage({ type: 'progress', stage: 'roads' });
    const settle = generateSettlements(cfg, hy.grid);
    ctx.postMessage({
      type: 'done',
      routes: hy.routes,
      lakePaint: hy.lakePaint,
      nodes: settle.nodes,
      roads: settle.routes,
      bridges: settle.bridges,
    });
  } catch (err) {
    ctx.postMessage({ type: 'error', error: String((err as Error)?.message ?? err) });
  }
};
