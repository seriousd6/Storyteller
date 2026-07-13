// The world map widget (M1): hex terrain viewer mounted INSIDE /world/
// beside the tree (tree↔map merge, PLAN §6.1). Renders the plane's ghost
// terrain from terrain.ts (x-periodic — panning wraps seamlessly), entity
// anchors, kingdom claim outlines, a legend, and lets the user select
// entities or add new ones from a hex ("+ Add here").

import {
  biomeAt, detailAt, elevationAt, octFor,
  EARTH_CIRCUM_FT, EARTH_HEIGHT_FT, type TerrainCfg, type BiomeId, type Landform,
} from './terrain.ts';
import { h32 } from './seeds.ts';
import REGISTRY from './registry.json';
import type { WorldDoc } from '../engine/worldStore.ts';

// kind → map glyph. People and items ride along with their place — they get
// a plain dot, everything else shows what it IS at a glance.
const KIND_ICON: Record<string, string> = Object.fromEntries(
  REGISTRY.kinds.filter((k) => k.id !== 'person' && k.id !== 'item').map((k) => [k.id, k.icon])
);
// anchor.icon refines the kind glyph — a lair is not a ruin is not a temple
const ANCHOR_ICON: Record<string, string> = {
  city: '🏰', town: '🏘️', village: '🛖', tavern: '🍺', shop: '🛒', port: '⚓',
  dungeon: '☠️', ruin: '🏚️', lair: '🐾', cave: '🕳️', formation: '⛰️',
  tower: '🗼', temple: '⛩️', camp: '⛺', bridge: '🌉', mine: '⛏️',
};

interface PlaneLike {
  id: string;
  terrain?: { waterPct?: number; climate?: string; landform?: string; continents?: number; circumFt?: number; heightFt?: number };
  anchors?: Array<{ entityId: string; x: number; y: number; tier: string; icon?: string; promoted?: boolean }>;
  claims?: Record<string, string[]>;
}

export interface MapHandle {
  destroy(): void;
  focusEntity(id: string): void;
  /** Center on a point and zoom so spanFt fits the view (for containers
   *  whose children are pinned but who have no pin themselves). */
  focusBounds(cx: number, cy: number, spanFt: number): void;
  refresh(): void;
}

export interface MapCallbacks {
  onSelectEntity(id: string): void;
  onAddHere(x: number, y: number, hexLabel: string, biome: BiomeId): void;
}

// macro tiers exist only so a whole Earth-size world fits on screen without
// drawing 100k world-tier hexes; they never take selections or content
const TIERS: Array<{ id: string; hexFt: number; renderOnly?: boolean }> = [
  { id: 'macro2', hexFt: 5068800, renderOnly: true },
  { id: 'macro', hexFt: 1267200, renderOnly: true },
  { id: 'world', hexFt: 316800 },
  { id: 'region', hexFt: 31680 },
  { id: 'mile', hexFt: 5280, renderOnly: true },
  { id: 'locale', hexFt: 500 },
];
const SQ3 = Math.sqrt(3);

export const BIOME_COLORS: Record<BiomeId, [number, number, number]> = {
  deep: [29, 47, 71], water: [52, 84, 118], beach: [201, 185, 138],
  snow: [223, 228, 232], tundra: [168, 176, 162], taiga: [74, 107, 82],
  desert: [211, 176, 120], savanna: [179, 163, 95], grass: [125, 155, 90],
  forest: [79, 122, 69], jungle: [58, 107, 61], hills: [138, 132, 104], mountain: [122, 115, 104],
};
const LANDSET = new Set<BiomeId>(['beach', 'snow', 'tundra', 'taiga', 'desert', 'savanna', 'grass', 'forest', 'jungle', 'hills', 'mountain']);
const COLORS = BIOME_COLORS;
const CLAIM_COLORS = ['#e0b34d', '#c96a6a', '#7f9fd1', '#8fc98a', '#b58fd1', '#d19a6a'];

export function mountMap(host: HTMLElement, world: WorldDoc, cb: MapCallbacks): MapHandle {
  const plane = ((world.planes ?? [])[0] ?? { id: 'p_surface' }) as PlaneLike;
  const t = plane.terrain ?? {};
  const cfg: TerrainCfg = {
    seed: world.seed,
    circumFt: t.circumFt ?? EARTH_CIRCUM_FT,
    heightFt: t.heightFt ?? EARTH_HEIGHT_FT,
    landform: (t.landform as Landform) ?? 'continents',
    continents: t.continents ?? 3,
    waterPct: t.waterPct ?? 55,
    climate: (t.climate as TerrainCfg['climate']) ?? 'temperate',
  };

  host.innerHTML = `
    <div class="mv-wrap">
      <canvas class="mv-canvas"></canvas>
      <div class="mv-legend">
        <div class="mv-ltitle">Legend</div>
        <div class="mv-biomes"></div>
        <div class="mv-claims"></div>
        <label class="mv-toggle"><input type="checkbox" class="mv-showpins" checked> pins</label>
        <div class="mv-scale"></div>
      </div>
      <div class="mv-hexinfo" hidden></div>
    </div>`;
  const canvas = host.querySelector<HTMLCanvasElement>('.mv-canvas')!;
  const ctx = canvas.getContext('2d')!;
  const legendBiomes = host.querySelector<HTMLElement>('.mv-biomes')!;
  const legendClaims = host.querySelector<HTMLElement>('.mv-claims')!;
  const scaleEl = host.querySelector<HTMLElement>('.mv-scale')!;
  const hexInfo = host.querySelector<HTMLElement>('.mv-hexinfo')!;
  const showPins = host.querySelector<HTMLInputElement>('.mv-showpins')!;

  legendBiomes.innerHTML = (Object.keys(COLORS) as BiomeId[])
    .filter((b) => b !== 'deep')
    .map((b) => `<span class="mv-key"><i style="background:rgb(${COLORS[b].join(',')})"></i>${b}</span>`)
    .join('');

  const claimOwners = Object.keys(plane.claims ?? {}).filter((id) => world.entities[id] && !world.entities[id]!.deleted);
  const claimColor = new Map(claimOwners.map((id, i) => [id, CLAIM_COLORS[i % CLAIM_COLORS.length]!]));
  legendClaims.innerHTML = claimOwners
    .map((id) => `<span class="mv-key"><i style="border:2px solid ${claimColor.get(id)}; background:none"></i>${(world.entities[id]!.name)}</span>`)
    .join('');

  // start over the first anchor; a fresh anchorless world opens fit-to-screen
  // so the creator sees the whole world they just sketched
  const firstAnchor = (plane.anchors ?? [])[0];
  const view = { x: firstAnchor?.x ?? 0, y: firstAnchor?.y ?? 0, ppf: 0.00002 };
  let fitPending = !firstAnchor;
  let W = 0, H = 0, DPR = 1;
  let selected: { t: number; q: number; r: number } | null = null;

  const hexR = (ti: number) => TIERS[ti]!.hexFt / SQ3;
  const hexCenter = (ti: number, q: number, r: number): [number, number] => {
    const R = hexR(ti);
    return [SQ3 * R * (q + r / 2), 1.5 * R * r];
  };
  const pointToHex = (ti: number, x: number, y: number): [number, number] => {
    const R = hexR(ti);
    const qf = (SQ3 / 3 * x - y / 3) / R, rf = (2 / 3 * y) / R;
    let rq = Math.round(qf), rr = Math.round(rf);
    const rs = Math.round(-qf - rf);
    const dq = Math.abs(rq - qf), dr = Math.abs(rr - rf), ds = Math.abs(rs + qf + rf);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return [rq, rr];
  };
  const wrapDx = (dx: number): number => {
    dx = ((dx % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    return dx > cfg.circumFt / 2 ? dx - cfg.circumFt : dx;
  };
  const toScreen = (x: number, y: number): [number, number] =>
    [wrapDx(x - view.x) * view.ppf + W / 2, (y - view.y) * view.ppf + H / 2];
  const toWorld = (px: number, py: number): [number, number] => {
    let x = (px - W / 2) / view.ppf + view.x;
    x = ((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    return [x, (py - H / 2) / view.ppf + view.y];
  };
  const tierAlpha = (ti: number) => Math.max(0, Math.min(1, (TIERS[ti]!.hexFt * view.ppf - 20) / 16));

  const cache = new Map<string, { b: BiomeId; e: number; d: number }>();
  function hexInfoAt(ti: number, q: number, r: number) {
    const k = ti + ':' + q + ',' + r;
    let v = cache.get(k);
    if (!v) {
      const [cx, cy] = hexCenter(ti, q, r);
      const oct = octFor(TIERS[ti]!.hexFt);
      const d = detailAt(cfg, cx, cy, TIERS[ti]!.hexFt, ti);
      const bias = (d - 0.5) * 0.055;
      v = { b: biomeAt(cfg, cx, cy, oct, bias), e: elevationAt(cfg, cx, cy, oct) + bias, d };
      if (cache.size > 150000) cache.clear();
      cache.set(k, v);
    }
    return v;
  }

  const shade = (b: BiomeId, e: number, jitter: number): string => {
    if (b === 'deep' || b === 'water') {
      const f = Math.max(0, Math.min(1, (e - 0.3) / 0.2));
      return `rgb(${(29 + 34 * f) | 0},${(47 + 59 * f) | 0},${(71 + 72 * f) | 0})`;
    }
    let [r, g, bl] = COLORS[b];
    const f = 0.97 + (e - 0.5) * 0.85 + jitter;
    if (e > 0.8) {
      const t2 = Math.min(1, (e - 0.8) / 0.1);
      r += (223 - r) * t2; g += (228 - g) * t2; bl += (232 - bl) * t2;
    }
    return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, bl * f) | 0})`;
  };
  const corner = (sx: number, sy: number, Rpx: number, k: number): [number, number] => {
    const a = Math.PI / 180 * (60 * k - 30);
    return [sx + Rpx * Math.cos(a), sy + Rpx * Math.sin(a)];
  };
  const EDGE_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;

  function drawTier(ti: number, alpha: number): void {
    const R = hexR(ti), Rpx = R * view.ppf, hexPx = TIERS[ti]!.hexFt * view.ppf;
    const [, y0] = toWorld(0, -Rpx * 2), [, y1] = toWorld(0, H + Rpx * 2);
    const halfSpanX = (W / 2 + Rpx * 2) / view.ppf;
    const rMin = Math.floor((2 / 3 * y0) / R) - 1, rMax = Math.ceil((2 / 3 * y1) / R) + 1;
    ctx.globalAlpha = alpha;
    const showGrid = hexPx > 44, showCoast = hexPx > 7;
    const coastW = Math.min(2.5, Math.max(1, hexPx * 0.04));
    for (let r = rMin; r <= rMax; r++) {
      const y = 1.5 * R * r;
      if (Math.abs(y) > cfg.heightFt / 2 + R * 2) continue; // bounded N–S
      // visible q range at THIS row, centered on the wrapped view
      const qc = (SQ3 / 3 * view.x) / R - r / 2;
      const qSpan = Math.ceil((SQ3 / 3 * halfSpanX) / R) + 2;
      for (let q = Math.floor(qc - qSpan); q <= Math.ceil(qc + qSpan); q++) {
        const [cx, cy] = hexCenter(ti, q, r);
        const [sx, sy] = toScreen(cx, cy);
        if (sx < -Rpx * 2 || sx > W + Rpx * 2 || sy < -Rpx * 2 || sy > H + Rpx * 2) continue;
        const { b, e, d } = hexInfoAt(ti, q, r);
        const jitter = (hash3ish(q, r, ti) - 0.5) * 0.16 + (d - 0.5) * 0.25;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const [ax, ay] = corner(sx, sy, Rpx + 0.6, k);
          k ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay);
        }
        ctx.closePath();
        ctx.fillStyle = shade(b, e, jitter);
        ctx.fill();
        if (showGrid) { ctx.strokeStyle = 'rgba(10,14,20,0.2)'; ctx.lineWidth = 1; ctx.stroke(); }
        if (showCoast && LANDSET.has(b)) {
          for (let k = 0; k < 6; k++) {
            const nb = hexInfoAt(ti, q + EDGE_DIRS[k]![0], r + EDGE_DIRS[k]![1]).b;
            if (nb === 'deep' || nb === 'water') {
              const [ax, ay] = corner(sx, sy, Rpx, k), [bx, by] = corner(sx, sy, Rpx, k + 1);
              ctx.strokeStyle = 'rgba(24,36,48,0.85)'; ctx.lineWidth = coastW;
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  const hash3ish = (q: number, r: number, s: number): number => h32(q + ',' + r + ',' + s, 77) / 4294967295;

  // claims pre-parsed once per mount: kingdoms claim world hexes, local
  // compacts claim region hexes — any tier renders, boundary edges only
  interface ClaimSet { color: string; ti: number; hexes: Array<[number, number]>; set: Set<string> }
  const claimSets: ClaimSet[] = [];
  for (const [owner, addrs] of Object.entries(plane.claims ?? {})) {
    const color = claimColor.get(owner);
    if (!color) continue;
    const byTier = new Map<string, { hexes: Array<[number, number]>; set: Set<string> }>();
    for (const addr of addrs) {
      const m = /^(world|region|locale):(-?\d+),(-?\d+)$/.exec(addr);
      if (!m) continue;
      let g = byTier.get(m[1]!);
      if (!g) { g = { hexes: [], set: new Set() }; byTier.set(m[1]!, g); }
      g.hexes.push([Number(m[2]), Number(m[3])]);
      g.set.add(m[2] + ',' + m[3]);
    }
    for (const [tid, g] of byTier) {
      const ti = TIERS.findIndex((t) => t.id === tid);
      if (ti >= 0) claimSets.push({ color, ti, hexes: g.hexes, set: g.set });
    }
  }

  function drawClaims(): void {
    for (const cs of claimSets) {
      const R = hexR(cs.ti), Rpx = R * view.ppf;
      const hexW = Rpx * SQ3;
      if (hexW < 0.8) continue;
      // a very faint wash over the whole territory — the political map reads
      // at a glance at world zoom (owner, batch 10)
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = cs.color;
      for (const [q, r] of cs.hexes) {
        const [cx, cy] = hexCenter(cs.ti, q, r);
        const [sx, sy] = toScreen(cx, cy);
        if (sx < -Rpx * 2 || sx > W + Rpx * 2 || sy < -Rpx * 2 || sy > H + Rpx * 2) continue;
        if (hexW < 10) {
          ctx.fillRect(sx - hexW / 2, sy - Rpx * 0.75, hexW + 0.5, Rpx * 1.5 + 0.5);
        } else {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const [ax, ay] = corner(sx, sy, Rpx + 0.5, k);
            k ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (hexW < 2) continue; // borders unreadable below this
      ctx.strokeStyle = cs.color;
      ctx.lineWidth = Math.min(5, Math.max(1.2, Rpx * 0.09));
      for (const [q, r] of cs.hexes) {
        const [cx, cy] = hexCenter(cs.ti, q, r);
        const [sx, sy] = toScreen(cx, cy);
        if (sx < -Rpx * 2 || sx > W + Rpx * 2 || sy < -Rpx * 2 || sy > H + Rpx * 2) continue;
        for (let k = 0; k < 6; k++) {
          if (cs.set.has((q + EDGE_DIRS[k]![0]) + ',' + (r + EDGE_DIRS[k]![1]))) continue; // interior
          const [ax, ay] = corner(sx, sy, Rpx, k), [bx, by] = corner(sx, sy, Rpx, k + 1);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
      }
    }
  }

  // ---------- settlement footprints & landmark art (M4, batch-9 spec) ----------
  // City 2½ mi across, town ½ mi, village ¼ mi; dungeons get entrance
  // variants; waterborne places sit on raft platforms. The art appears once
  // its TRUE size is readable on screen and replaces the disc pin, so
  // zooming in feels like approaching the place.
  const FOOT_FT: Record<string, number> = { city: 13200, town: 2640, village: 1320, dungeon: 420, tavern: 180 };
  const HOUSES: Record<string, number> = { city: 64, town: 18, village: 7, tavern: 1 };
  function classOf(a: { icon?: string }, ent: { kind: string; tags?: string[] }): string | null {
    if (a.icon && FOOT_FT[a.icon] !== undefined) return a.icon;
    for (const t of ['city', 'town', 'village']) if ((ent.tags ?? []).includes(t)) return t;
    if (ent.kind === 'settlement') return 'town';
    if (ent.kind === 'landmark') return 'dungeon';
    return null;
  }
  const rng01 = (id: string, n: number) => h32(id, n) / 4294967295;
  const footprinted = new Map<string, number>(); // entityId -> footprint px

  function drawHouse(x: number, y: number, s: number, rot: number, keep = false): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = keep ? '#6d5138' : '#8a6a4f';
    ctx.fillRect(-s / 2, -s / 2, s, s * 0.92);
    if (s > 2.5) {
      ctx.strokeStyle = 'rgba(25,20,14,0.75)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-s / 2, -s / 2, s, s * 0.92);
      ctx.strokeStyle = 'rgba(25,20,14,0.4)';
      ctx.beginPath(); ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0); ctx.stroke(); // roof ridge
    }
    ctx.restore();
  }

  function drawDungeon(id: string, sx: number, sy: number, px: number): void {
    const v = h32(id, 999) % 5;
    const R = px / 2;
    const dark = '#241d16', stone = '#8f8578', line = 'rgba(25,20,14,0.85)';
    ctx.lineWidth = Math.max(1, px * 0.04);
    ctx.strokeStyle = line;
    if (v === 0) { // barrow mound with a door
      ctx.fillStyle = '#6f8757';
      ctx.beginPath(); ctx.arc(sx, sy + R * 0.3, R, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark;
      ctx.fillRect(sx - R * 0.2, sy - R * 0.15, R * 0.4, R * 0.45);
    } else if (v === 1) { // cave mouth
      ctx.fillStyle = stone;
      ctx.beginPath(); ctx.arc(sx, sy + R * 0.3, R, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(sx, sy + R * 0.3, R * 0.5, Math.PI, 0); ctx.closePath(); ctx.fill();
    } else if (v === 2) { // ruined gate: pillars + fallen lintel
      ctx.fillStyle = stone;
      ctx.fillRect(sx - R * 0.65, sy - R * 0.7, R * 0.28, R * 1.3);
      ctx.strokeRect(sx - R * 0.65, sy - R * 0.7, R * 0.28, R * 1.3);
      ctx.fillRect(sx + R * 0.38, sy - R * 0.7, R * 0.28, R * 1.0);
      ctx.strokeRect(sx + R * 0.38, sy - R * 0.7, R * 0.28, R * 1.0);
      ctx.save(); ctx.translate(sx - R * 0.1, sy + R * 0.35); ctx.rotate(0.3);
      ctx.fillRect(-R * 0.5, 0, R, R * 0.2); ctx.strokeRect(-R * 0.5, 0, R, R * 0.2);
      ctx.restore();
    } else if (v === 3) { // standing stones
      ctx.fillStyle = stone;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rng01(id, 30) * Math.PI;
        const x = sx + Math.cos(a) * R * 0.7, y = sy + Math.sin(a) * R * 0.7;
        const s = R * (0.16 + rng01(id, 31 + i) * 0.12);
        ctx.fillRect(x - s / 2, y - s, s, s * 2);
        ctx.strokeRect(x - s / 2, y - s, s, s * 2);
      }
    } else { // sinkhole
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.8, R * 0.55, 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = stone;
      ctx.stroke();
    }
  }

  function drawFootprint(cls: string, id: string, sx: number, sy: number, px: number, waterborne: boolean): void {
    const R = px / 2;
    const rn = (n: number) => rng01(id, n);
    if (waterborne) { // raft platform first: planks + pile heads
      ctx.fillStyle = '#9d8256';
      ctx.strokeStyle = 'rgba(30,25,18,0.8)';
      ctx.lineWidth = Math.max(1, px * 0.02);
      ctx.beginPath(); ctx.arc(sx, sy, R * 0.78, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(30,25,18,0.3)';
      ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        const half = Math.sqrt(Math.max(0, 0.6 - (i * 0.2) ** 2)) * R;
        ctx.beginPath(); ctx.moveTo(sx - half, sy + i * R * 0.2); ctx.lineTo(sx + half, sy + i * R * 0.2); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,25,18,0.85)';
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        ctx.beginPath(); ctx.arc(sx + Math.cos(a) * R * 0.78, sy + Math.sin(a) * R * 0.78, Math.max(1, px * 0.02), 0, 7); ctx.fill();
      }
    }
    if (cls === 'dungeon') { drawDungeon(id, sx, sy, px); return; }
    if (!waterborne) { // the trodden heart of the place
      ctx.fillStyle = 'rgba(139,116,84,0.35)';
      ctx.beginPath(); ctx.arc(sx, sy, R * 0.55, 0, 7); ctx.fill();
    }
    if (cls === 'town' || cls === 'village') { // a road through it
      ctx.strokeStyle = 'rgba(120,98,70,0.75)';
      ctx.lineWidth = Math.max(1, px * 0.025);
      const a0 = rn(90) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(sx - Math.cos(a0) * R, sy - Math.sin(a0) * R);
      ctx.lineTo(sx + Math.cos(a0) * R, sy + Math.sin(a0) * R);
      ctx.stroke();
      if (cls === 'town') {
        const a1 = a0 + Math.PI / 2 + (rn(91) - 0.5) * 0.6;
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(a1) * R * 0.8, sy - Math.sin(a1) * R * 0.8);
        ctx.lineTo(sx + Math.cos(a1) * R * 0.8, sy + Math.sin(a1) * R * 0.8);
        ctx.stroke();
      }
    }
    const n = HOUSES[cls] ?? 7;
    for (let i = 0; i < n; i++) {
      const a = rn(i * 3 + 1) * Math.PI * 2;
      const rr = Math.sqrt(rn(i * 3 + 2)) * R * (cls === 'city' ? 0.44 : 0.5) * (waterborne ? 0.85 : 1);
      const s = Math.max(1.5, px * (cls === 'city' ? 0.028 : cls === 'town' ? 0.055 : cls === 'tavern' ? 0.5 : 0.1)) * (0.7 + rn(i * 3 + 3) * 0.6);
      drawHouse(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, s, rn(i * 7 + 4) * Math.PI);
    }
    if (cls === 'city') { // irregular wall + keep
      ctx.strokeStyle = '#4a3b2a';
      ctx.lineWidth = Math.max(1.5, px * 0.016);
      ctx.beginPath();
      const seg = 14;
      for (let i = 0; i <= seg; i++) {
        const a = ((i % seg) / seg) * Math.PI * 2;
        const wr = R * (0.5 + rng01(id, 40 + (i % seg)) * 0.1);
        const x = sx + Math.cos(a) * wr, y = sy + Math.sin(a) * wr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
      drawHouse(sx, sy, Math.max(3, px * 0.06), 0.2, true);
    }
  }

  function drawFootprints(): void {
    footprinted.clear();
    if (!showPins.checked) return;
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!ent || ent.deleted) continue;
      const cls = classOf(a, ent as { kind: string; tags?: string[] });
      if (!cls) continue;
      const px = (FOOT_FT[cls] ?? 1000) * view.ppf;
      if (px < 12) continue; // too small — the pin carries it
      // once you're INSIDE the place the sketch has done its job: fade it
      // out instead of drawing screen-filling houses (interiors are G5's)
      const maxDim = Math.max(W, H);
      const fade = Math.max(0, Math.min(1, 2 - px / (maxDim * 1.2)));
      if (fade <= 0) { footprinted.set(a.entityId, px); continue; }
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -px || sx > W + px || sy < -px || sy > H + px) continue;
      ctx.globalAlpha = fade;
      drawFootprint(cls, a.entityId, sx, sy, px, a.icon === 'waterborne');
      ctx.globalAlpha = 1;
      footprinted.set(a.entityId, px);
    }
  }

  const TIER_FT: Record<string, number> = { world: 316800, region: 31680, locale: 500 };
  function drawAnchors(): void {
    if (!showPins.checked) return;
    ctx.textAlign = 'center';
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!ent || ent.deleted) continue;
      // declutter like a road atlas: a tavern (locale pin) appears only when
      // its tier's hexes are visibly sized; promoted pins always show
      if (!a.promoted && (TIER_FT[a.tier] ?? 31680) * view.ppf < 4) continue;
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -260 || sx > W + 260 || sy < -40 || sy > H + 40) continue;
      if (a.icon === 'label') {
        // a geographic name written on the map itself — oceans, ranges,
        // lakes, the continent — no pin, just cartography
        const size = Math.max(13, Math.min(30, (TIER_FT[a.tier] ?? 316800) * view.ppf * 0.09));
        ctx.font = `italic ${size}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = 'rgba(12,16,22,0.7)';
        ctx.fillText(ent.name, sx + 1, sy + 1);
        ctx.fillStyle = 'rgba(240,236,222,0.82)';
        ctx.fillText(ent.name, sx, sy);
        continue;
      }
      const waterborne = a.icon === 'waterborne';
      const glyph = ANCHOR_ICON[a.icon ?? ''] ?? KIND_ICON[ent.kind];
      const ring = waterborne ? '#6fd3e0' : '#ffd479';
      let labelY: number;
      const footPx = footprinted.get(a.entityId);
      if (footPx !== undefined) {
        // the footprint art IS the marker now — just name it
        ctx.font = '13px system-ui';
        ctx.fillStyle = '#10141a';
        ctx.fillText(ent.name, sx + 1, sy - footPx / 2 - 4);
        ctx.fillStyle = '#f4efdf';
        ctx.fillText(ent.name, sx, sy - footPx / 2 - 5);
        continue;
      }
      if (glyph) {
        // kind glyph on a dark disc so it reads over any terrain
        ctx.fillStyle = 'rgba(16,20,26,0.72)';
        ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 7); ctx.fill();
        ctx.strokeStyle = ring; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, 11, 0, 7); ctx.stroke();
        ctx.font = '13px system-ui';
        ctx.fillStyle = '#f4efdf';
        ctx.fillText(glyph, sx, sy + 4.5);
        labelY = sy - 16;
      } else {
        ctx.fillStyle = '#1c2129';
        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill();
        ctx.strokeStyle = ring; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.stroke();
        labelY = sy - 9;
      }
      if (waterborne) {
        // an intentional build on open water: wave crests under the pin (full
        // hex art — stilts, rafts, harbor piles — arrives with the glyph pack)
        ctx.strokeStyle = ring; ctx.lineWidth = 1.6;
        const wy = sy + (glyph ? 16 : 10);
        ctx.beginPath(); ctx.arc(sx - 4, wy, 3.2, Math.PI, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx + 4, wy, 3.2, Math.PI, Math.PI * 2); ctx.stroke();
      }
      ctx.font = '13px system-ui';
      ctx.fillStyle = '#10141a';
      ctx.fillText(ent.name, sx + 1, labelY + 1);
      ctx.fillStyle = '#f4efdf';
      ctx.fillText(ent.name, sx, labelY);
    }
  }

  function niceScale(): [number, string] {
    const targetFt = 120 / view.ppf;
    const mi = targetFt / 5280;
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    let best = steps[0]!;
    for (const s of steps) if (s <= mi) best = s;
    return [best * 5280, `${best} mi`];
  }

  let raf = 0;
  function draw(): void {
    raf = 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgb(29,47,71)';
    ctx.fillRect(0, 0, W, H);
    // base = the finest tier still ≥6px on screen; finer tiers crossfade in
    let baseTi = 0;
    for (let i = 0; i < TIERS.length; i++) if (TIERS[i]!.hexFt * view.ppf >= 6) baseTi = i;
    for (let ti = baseTi; ti < TIERS.length; ti++) {
      const a = ti === baseTi ? 1 : tierAlpha(ti);
      if (a <= 0) break;
      drawTier(ti, a);
    }
    drawClaims();
    drawFootprints();
    if (selected) {
      const R = hexR(selected.t) * view.ppf;
      const [cx, cy] = hexCenter(selected.t, selected.q, selected.r);
      const [sx, sy] = toScreen(cx, cy);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const [ax, ay] = corner(sx, sy, R, k);
        k ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay);
      }
      ctx.closePath();
      ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    drawAnchors();
    const [ft, label] = niceScale();
    scaleEl.innerHTML = `${label}<i style="width:${ft * view.ppf}px"></i>`;
  }
  const repaint = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function resize(): void {
    DPR = window.devicePixelRatio || 1;
    W = host.clientWidth; H = Math.max(320, host.clientHeight);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    canvas.width = W * DPR; canvas.height = H * DPR;
    if (fitPending && W > 0) { view.ppf = W / cfg.circumFt; fitPending = false; }
    repaint();
  }

  const clampY = () => { view.y = Math.max(-cfg.heightFt / 2, Math.min(cfg.heightFt / 2, view.y)); };
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false, pinch = 0;
  const zoomAt = (f: number, px: number, py: number) => {
    const [wx, wy] = toWorld(px, py);
    // zoom-out floor = the whole world exactly filling the width ("fit world")
    const minPpf = W > 0 ? W / cfg.circumFt : 6e-6;
    view.ppf = Math.max(minPpf, Math.min(8, view.ppf * f));
    const [nx, ny] = toWorld(px, py);
    view.x += wrapDx(wx - nx); view.y += wy - ny; clampY(); repaint();
  };
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    moved = false;
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const prev = pointers.get(ev.pointerId);
    if (!prev) return;
    pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (pointers.size === 1) {
      const dx = ev.offsetX - prev.x, dy = ev.offsetY - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      view.x -= dx / view.ppf; view.y -= dy / view.ppf; clampY(); repaint();
    } else if (pointers.size === 2) {
      moved = true;
      const [p1, p2] = [...pointers.values()];
      const d = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
      if (pinch > 0 && d > 0) zoomAt(d / pinch, (p1!.x + p2!.x) / 2, (p1!.y + p2!.y) / 2);
      pinch = d;
    }
  });
  const endPointer = (ev: PointerEvent) => {
    const wasTap = pointers.size === 1 && !moved && ev.type === 'pointerup';
    pointers.delete(ev.pointerId);
    pinch = 0;
    if (wasTap) select(ev.offsetX, ev.offsetY);
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomAt(Math.exp(-ev.deltaY * 0.0016), ev.offsetX, ev.offsetY);
  }, { passive: false });

  function select(px: number, py: number): void {
    // an anchor within 14px wins; otherwise select the hex
    for (const a of plane.anchors ?? []) {
      const [sx, sy] = toScreen(a.x, a.y);
      if (Math.hypot(sx - px, sy - py) < 14 && world.entities[a.entityId] && !world.entities[a.entityId]!.deleted) {
        cb.onSelectEntity(a.entityId);
        return;
      }
    }
    let ti = TIERS.findIndex((t) => !t.renderOnly); // never select a macro hex
    for (let i = 0; i < TIERS.length; i++) if (tierAlpha(i) > 0.5 && !TIERS[i]!.renderOnly) ti = i;
    const [wx, wy] = toWorld(px, py);
    if (Math.abs(wy) > cfg.heightFt / 2) { // beyond the poles — nothing to select
      selected = null;
      hexInfo.hidden = true;
      repaint();
      return;
    }
    const [q, r] = pointToHex(ti, wx, wy);
    selected = { t: ti, q, r };
    const info = hexInfoAt(ti, q, r);
    const [cx, cy] = hexCenter(ti, q, r);
    hexInfo.hidden = false;
    hexInfo.innerHTML = `<b>${TIERS[ti]!.id}:${q},${r}</b> · ${info.b}
      <button type="button" class="mv-add">+ Add here</button>`;
    hexInfo.querySelector('.mv-add')?.addEventListener('click', () => {
      cb.onAddHere(cx, cy, `${TIERS[ti]!.id}:${q},${r}`, info.b);
    });
    repaint();
  }

  showPins.addEventListener('change', repaint);
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  return {
    destroy() { ro.disconnect(); host.innerHTML = ''; },
    refresh() { repaint(); },
    focusEntity(id: string) {
      const a = (plane.anchors ?? []).find((x) => x.entityId === id);
      if (!a) return;
      // jump AND zoom to the tier that shows this thing in context: a region
      // pin shows the surrounding regions, a settlement shows its miles, a
      // tavern shows its streets — never left at full zoom-out
      // tuned so the focus zoom reveals the place's footprint art
      const tierPpf: Record<string, number> = { world: 0.0013, region: 0.006, locale: 0.09 };
      view.x = a.x; view.y = a.y;
      view.ppf = tierPpf[a.tier] ?? 0.004;
      clampY(); repaint();
    },
    focusBounds(cx: number, cy: number, spanFt: number) {
      view.x = cx; view.y = cy;
      const fit = W > 0 ? W / cfg.circumFt : 6e-6;
      view.ppf = Math.min(0.09, Math.max(fit, (W * 0.7) / Math.max(spanFt, 1000)));
      clampY(); repaint();
    },
  };
}
