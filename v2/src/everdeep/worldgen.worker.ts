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
import { ensureEarthAdmin, generateEarthRealms, type EarthRealm } from './earthRealms.ts';
import { buildEarth2026, type EarthIO } from './earth2026.ts';

const ctx = self as unknown as { onmessage: ((ev: MessageEvent) => void) | null; postMessage: (m: unknown) => void };

// The browser's half of EarthIO (earth2026.ts). Its Node twin lives in
// bake-earth-2026.mjs, and between them that is the WHOLE difference between
// how the demo world is built and how a user's is: where bytes come from, and
// how a composite module is loaded. Neither half decides anything about the
// world. Everything that does is in earth2026.ts, called by both.
const compositeRegistries = import.meta.glob<Record<string, unknown>>('../generators/registries/*.json', { import: 'default' });
const compositeMods = import.meta.glob<{ meta: { id: string; options: Array<{ id: string; default: string }> }; build: (t: Map<string, unknown>, s: string, o: Record<string, string>) => unknown[] }>('../composites/*.ts');
const bundles = new Map<string, Awaited<ReturnType<EarthIO['composite']>>>();
const earthIO: EarthIO = {
  read: async (name) => {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${name}`);
    if (!res.ok) throw new Error(`earth data ${name}: ${res.status}`);
    return res.text();
  },
  composite: async (tool) => {
    const hit = bundles.get(tool);
    if (hit) return hit;
    const loadMod = compositeMods[`../composites/${tool}.ts`];
    const loadReg = compositeRegistries[`../generators/registries/${tool}.json`];
    if (!loadMod || !loadReg) throw new Error(`no composite ${tool}`);
    const mod = await loadMod();
    const reg = await loadReg();
    const made = { meta: mod.meta, build: mod.build, tables: new Map(Object.entries(reg)) };
    bundles.set(tool, made);
    return made;
  },
  progress: (stage, detail) => ctx.postMessage({ type: 'progress', stage, detail }),
};

ctx.onmessage = async (ev: MessageEvent) => {
  const data = ev.data as { op?: string; cfg: TerrainCfg; nodes?: SettleNode[]; forcedWater?: string[]; earth?: { stamp?: string; id?: string; name?: string } };
  const cfg = data.cfg;
  try {
    // Earth — 2026: the flagship, built HERE now rather than by a bake script,
    // so a user rolling their own Earth gets the real cities on their real
    // coordinates, the great rivers on their real courses, and the fantasy
    // names — all of which used to exist only inside the shipped demo.
    if (data.op === 'earth2026') {
      const { world, stats } = await buildEarth2026(earthIO, data.earth ?? {});
      ctx.postMessage({ type: 'earth2026-done', world, stats });
      return;
    }
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
    // A real Earth gets its real politics (item #3). Only 'earth' has borders to
    // read — a procedural world's crowns are still the owner's to paint, and
    // the sweep is ~0.9s of raster work we must not spend on a world that has
    // no country raster to sweep.
    let realms: EarthRealm[] = [];
    if (cfg.landform === 'earth') {
      ctx.postMessage({ type: 'progress', stage: 'realms' });
      await ensureEarthAdmin();
      realms = generateEarthRealms(cfg).realms;
    }
    ctx.postMessage({
      type: 'done',
      routes: hy.routes,
      lakePaint: hy.lakePaint,
      features,
      nodes: settle.nodes,
      roads: settle.routes,
      bridges: settle.bridges,
      realms,
    });
  } catch (err) {
    ctx.postMessage({ type: 'error', error: String((err as Error)?.message ?? err) });
  }
};
