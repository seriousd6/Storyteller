// World-generation worker (batch 71). Rivers + settlements + roads are seconds
// of synchronous compute on an Earth-size world; running them here keeps the UI
// thread free so "Building your world…" animates instead of freezing. The worker
// returns only serialisable data (routes, lake paint, settlement nodes, bridges);
// the main thread turns those into entities/anchors and writes the world.

import type { TerrainCfg } from './terrain.ts';
import { ensureEarthGrid } from './terrain.ts';
import { generateHydrology } from './hydrology.ts';
import { generateGeography } from './geography.ts';
import { generateSettlements, generateRoads, type SettleNode } from './settlements.ts';

const ctx = self as unknown as { onmessage: ((ev: MessageEvent) => void) | null; postMessage: (m: unknown) => void };

ctx.onmessage = async (ev: MessageEvent) => {
  const data = ev.data as { op?: string; cfg: TerrainCfg; nodes?: SettleNode[]; forcedWater?: string[] };
  const cfg = data.cfg;
  try {
    if (cfg.landform === 'earth') await ensureEarthGrid();
    // rebuild ONLY the road network over a given set of settlements (batch 73):
    // the user added/removed a town, so re-forge the roads without re-placing.
    if (data.op === 'roads') {
      const grid = generateHydrology(cfg).grid;
      const { routes, bridges } = generateRoads(cfg, grid, data.nodes ?? []);
      ctx.postMessage({ type: 'roads-done', roads: routes, bridges });
      return;
    }
    // re-trace rivers honouring the water the user painted (batch 73 part 2)
    if (data.op === 'rivers') {
      const hy = generateHydrology(cfg, { forcedWater: data.forcedWater });
      ctx.postMessage({ type: 'rivers-done', routes: hy.routes, lakePaint: hy.lakePaint });
      return;
    }
    // default: full creation
    ctx.postMessage({ type: 'progress', stage: 'rivers' });
    const hy = generateHydrology(cfg);
    // name the major geography off the same drainage grid (item #1) — every new
    // world gets its oceans, seas, ranges, forests, deserts and great rivers
    const features = generateGeography(cfg, hy.grid, cfg.seed);
    ctx.postMessage({ type: 'progress', stage: 'roads' });
    const settle = generateSettlements(cfg, hy.grid);
    ctx.postMessage({
      type: 'done',
      routes: hy.routes,
      lakePaint: hy.lakePaint,
      features,
      nodes: settle.nodes,
      roads: settle.routes,
      bridges: settle.bridges,
    });
  } catch (err) {
    ctx.postMessage({ type: 'error', error: String((err as Error)?.message ?? err) });
  }
};
