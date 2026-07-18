// Named geography (item #1) — the browser-usable port of the Vessia bake's
// geography-naming pass (continent-vessia.mjs §2b). From the drainage grid it
// already built for a NEW world, it finds the oceans, seas, lakes, mountain
// ranges, great forests, deserts and great rivers as connected components of
// the terrain field, gives each a seeded name (geoNames.ts), and returns them
// as feature descriptors. The main thread mints these into biome-kind entities
// with cartographic label anchors — the entries the Geography tab surfaces.
// Every new world gets its major features named from the start, the same way
// the shipped Earth/Vessia examples do (those are baked separately).

import type { TerrainCfg } from './terrain.ts';
import type { HydroGrid } from './hydrology.ts';
import { geoName, type GeoKind } from './geoNames.ts';
import { uniqueName } from './fantasyEarth.ts';

export interface GeoFeature { kind: GeoKind; name: string; x: number; y: number; big: boolean }

const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

/** Circular-mean centroid (x wraps around the cylinder), returned in feet. */
function centroid(cells: string[], hexC: (q: number, r: number) => [number, number], circumFt: number): [number, number] {
  let cs = 0, sn = 0, ys = 0;
  for (const k of cells) {
    const [q, r] = k.split(',').map(Number);
    const [x, y] = hexC(q!, r!);
    const th = (x / circumFt) * 2 * Math.PI;
    cs += Math.cos(th); sn += Math.sin(th); ys += y;
  }
  let th = Math.atan2(sn, cs);
  if (th < 0) th += 2 * Math.PI;
  return [(th / (2 * Math.PI)) * circumFt, ys / cells.length];
}

/**
 * Find and name the world's major geographic features from its drainage grid.
 * Deterministic: the same seed + terrain always names the same features.
 */
export function generateGeography(cfg: TerrainCfg, grid: HydroGrid, seed: string): GeoFeature[] {
  const { rMax, qPeriod, hexC, canon, land, riverOn, acc, lakeSet, bandOf } = grid;
  const circ = cfg.circumFt;
  const out: GeoFeature[] = [];
  const qBaseOf = (r: number): number => -Math.round(r / 2);

  // connected components over a predicate on canonical hex keys
  const components = (keys: Iterable<string>, has: (k: string) => boolean): string[][] => {
    const seen = new Set<string>(), comps: string[][] = [];
    for (const k of keys) {
      if (seen.has(k) || !has(k)) continue;
      const cells: string[] = [], stack = [k]; seen.add(k);
      while (stack.length) {
        const cur = stack.pop()!;
        cells.push(cur);
        const [q, r] = cur.split(',').map(Number);
        for (const [dq, dr] of DIRS) {
          if (Math.abs(r! + dr) > rMax) continue;
          const nk = canon(q! + dq, r! + dr);
          if (has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        }
      }
      comps.push(cells);
    }
    return comps.sort((a, b) => b.length - a.length);
  };

  // enumerate every hex once; split into land (biome map) and open water
  const waterKeys: string[] = [];
  for (let r = -rMax; r <= rMax; r++) {
    const qb = qBaseOf(r);
    for (let i = 0; i < qPeriod; i++) {
      const k = (qb + i) + ',' + r;
      if (!land.has(k) && !lakeSet.has(k)) waterKeys.push(k);
    }
  }

  let idx = 0;
  // two features can hash to the same name ("The Howling Mirror" twice on one
  // map — audit V21); re-roll with a salt until it's fresh, like every other
  // naming pass
  const used = new Set<string>();
  const nameFor = (kind: GeoKind): string => {
    const base = `${seed}/geo:${kind}:${idx++}`;
    return uniqueName((s) => geoName(kind, s ? `${base}/alt${s}` : base), used);
  };
  const emit = (kind: GeoKind, cells: string[], big: boolean): void => {
    const [x, y] = centroid(cells, hexC, circ);
    out.push({ kind, name: nameFor(kind), x: Math.round(x), y: Math.round(y), big });
  };

  // --- oceans + seas: the biggest open-water bodies (largest = ocean) ---
  const waterSet = new Set(waterKeys);
  const oceanComps = components(waterKeys, (k) => waterSet.has(k));
  const total = waterKeys.length || 1;
  let oceans = 0;
  for (const c of oceanComps) {
    if (oceans >= 4) break;
    const frac = c.length / total;
    if (oceans === 0) { emit('ocean', c, true); oceans++; continue; }
    if (frac >= 0.06) { emit('ocean', c, true); oceans++; }        // a second/third ocean basin
    else if (c.length >= 12) { emit('sea', c, false); }            // an enclosed sea/gulf
  }

  // --- lakes: enclosed inland water (the priority-flood's filled basins) ---
  components([...lakeSet], (k) => lakeSet.has(k))
    .filter((c) => c.length >= 2 && c.length <= 400)
    .slice(0, 6)
    .forEach((c) => emit('lake', c, c.length >= 40));

  // --- land features: ranges, forests, deserts ---
  const landComps = (pred: (b: string) => boolean): string[][] =>
    components([...land.keys()], (k) => land.has(k) && pred(land.get(k)!));
  landComps((b) => b === 'mountain' || b === 'hills')
    .filter((c) => c.filter((k) => land.get(k) === 'mountain').length >= 2 && c.length >= 6)
    .slice(0, 5)
    .forEach((c) => emit('range', c, c.length >= 30));
  landComps((b) => b === 'forest' || b === 'jungle' || b === 'taiga')
    .filter((c) => c.length >= 30)
    .slice(0, 4)
    .forEach((c) => emit('forest', c, c.length >= 120));
  landComps((b) => b === 'desert' || b === 'savanna')
    .filter((c) => c.filter((k) => land.get(k) === 'desert').length >= 3 && c.length >= 20)
    .slice(0, 3)
    .forEach((c) => emit('desert', c, c.length >= 80));

  // --- great rivers: connected runs of band-≥3 river hexes, labelled at the
  //     highest-accumulation hex (the trunk, mid-course) ---
  const greatRiver = (k: string): boolean => riverOn.has(k) && bandOf(k) >= 3;
  components([...riverOn].filter(greatRiver), greatRiver)
    .filter((c) => c.length >= 4)
    .sort((a, b) => Math.max(...b.map((k) => acc.get(k) ?? 0)) - Math.max(...a.map((k) => acc.get(k) ?? 0)))
    .slice(0, 6)
    .forEach((c) => {
      const grand = c.some((k) => bandOf(k) >= 4);
      // label at the trunk hex (max accumulation), not the geometric centroid
      const trunk = c.reduce((a, k) => ((acc.get(k) ?? 0) > (acc.get(a) ?? 0) ? k : a), c[0]!);
      const [q, r] = trunk.split(',').map(Number);
      const [x, y] = hexC(q!, r!);
      out.push({ kind: 'river', name: nameFor('river'), x: Math.round(x), y: Math.round(y), big: grand });
    });

  return out;
}
