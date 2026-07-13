// The world map widget (M1): hex terrain viewer mounted INSIDE /world/
// beside the tree (tree↔map merge, PLAN §6.1). Renders the plane's ghost
// terrain from terrain.ts (x-periodic — panning wraps seamlessly), entity
// anchors, kingdom claim outlines, a legend, and lets the user select
// entities or add new ones from a hex ("+ Add here").

import {
  biomeAt, detailAt, elevationAt, octFor,
  EARTH_CIRCUM_FT, EARTH_HEIGHT_FT, type TerrainCfg, type BiomeId, type Landform,
} from './terrain.ts';
import { h32, ghostId } from './seeds.ts';
import { ghostSettlementAt, ghostFeatureAt, type GhostSettlement, type GhostFeature } from './density.ts';
import { planTravel, type TravelPlan } from './travel.ts';
import REGISTRY from './registry.json';
import type { WorldDoc } from '../engine/worldStore.ts';

// kind → map glyph. People and items ride along with their place — they get
// a plain dot, everything else shows what it IS at a glance.
const KIND_ICON: Record<string, string> = Object.fromEntries(
  REGISTRY.kinds.filter((k) => k.id !== 'person' && k.id !== 'item').map((k) => [k.id, k.icon])
);
// anchor.icon refines the kind glyph — a lair is not a ruin is not a temple
export const ANCHOR_ICON: Record<string, string> = {
  city: '🏰', town: '🏘️', village: '🛖', tavern: '🍺', shop: '🛒', port: '⚓',
  dungeon: '☠️', ruin: '🏚️', lair: '🐾', cave: '🕳️', formation: '⛰️',
  tower: '🗼', temple: '⛩️', camp: '⛺', bridge: '🌉', mine: '⛏️',
};

interface PlaneLike {
  id: string;
  terrain?: { waterPct?: number; climate?: string; landform?: string; continents?: number; circumFt?: number; heightFt?: number };
  anchors?: Array<{ entityId: string; x: number; y: number; tier: string; icon?: string; promoted?: boolean }>;
  claims?: Record<string, string[]>;
  biomePaint?: Record<string, string>;
  routes?: Array<{ id: string; kind?: string; w?: number; pts: Array<[number, number]> }>;
}

export interface MapHandle {
  destroy(): void;
  focusEntity(id: string): void;
  /** One-shot: the next hex tap calls back with its center instead of
   *  selecting (📍 Place on map, batch 32). */
  pickHex(cb: (x: number, y: number, tier: string, biome: string) => void): void;
  /** Center on a point and zoom so spanFt fits the view (for containers
   *  whose children are pinned but who have no pin themselves). */
  focusBounds(cx: number, cy: number, spanFt: number): void;
  refresh(): void;
}

export interface MapCallbacks {
  onSelectEntity(id: string): void;
  /** Claims were painted (M2 border editor) — persist the world. */
  onClaimsEdited?(): void;
  onAddHere(x: number, y: number, hexLabel: string, biome: BiomeId): void;
  /** Write an unwritten settlement or feature into the world (density
   *  ghost layer). Settlements carry `cls`; features carry `kind`. */
  onMaterializeGhost(g: (GhostSettlement | GhostFeature) & { gid: string }): void;
}

// macro tiers exist only so a whole Earth-size world fits on screen without
// drawing 100k world-tier hexes; they never take selections or content.
// The 2× ladder keeps every zoom level within one octave of a drawable tier
// so the crossfade never jumps. `salt` keeps each tier's detail noise stable
// even if this list is reordered (the bake replicates world=2/region=3/locale=5).
const TIERS: Array<{ id: string; hexFt: number; renderOnly?: boolean; salt: number }> = [
  { id: 'macro3', hexFt: 5068800, renderOnly: true, salt: 0 },
  { id: 'macro2', hexFt: 2534400, renderOnly: true, salt: 1 },
  { id: 'macro1', hexFt: 1267200, renderOnly: true, salt: 6 },
  { id: 'macroh', hexFt: 633600, renderOnly: true, salt: 7 },
  { id: 'world', hexFt: 316800, salt: 2 },
  { id: 'region', hexFt: 31680, salt: 3 },
  { id: 'mile', hexFt: 5280, renderOnly: true, salt: 4 },
  { id: 'locale', hexFt: 500, salt: 5 },
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
        <div class="mv-shead" data-sec="biomes">Terrain <span>▸</span><button type="button" class="mv-terrbtn" title="Paint terrain overrides">🖌</button></div>
        <div class="mv-biomes" hidden></div>
        <div class="mv-shead" data-sec="claims">Realms <span>▾</span></div>
        <div class="mv-claims"></div>
        <div class="mv-shead" data-sec="layers">Layers <span>▾</span></div>
        <div class="mv-layers">
          <label class="mv-toggle"><input type="checkbox" class="mv-showpins" checked> pins</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showroads" checked> roads</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showrivers" checked> rivers</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showlabels" checked> labels</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showart" checked> terrain art</label>
        </div>
        <div class="mv-tools"><button type="button" class="mv-globe" title="See the world as a globe">🌐 globe</button>
        <button type="button" class="mv-travel" title="Measure travel time between two points">🥾</button>
        <button type="button" class="mv-spinbtn" title="Pause or resume the spin" hidden>⏸ spin</button>
        <button type="button" class="mv-snap" title="Level back to the equator" hidden>⊙ equator</button>
        <button type="button" class="mv-export" title="Save this view as an image">📷</button></div>
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
  const showRoads = host.querySelector<HTMLInputElement>('.mv-showroads')!;
  const showRivers = host.querySelector<HTMLInputElement>('.mv-showrivers')!;
  const showLabels = host.querySelector<HTMLInputElement>('.mv-showlabels')!;
  const showArt = host.querySelector<HTMLInputElement>('.mv-showart')!;
  const globeBtn = host.querySelector<HTMLButtonElement>('.mv-globe')!;
  const travelBtn = host.querySelector<HTMLButtonElement>('.mv-travel')!;
  const spinBtn = host.querySelector<HTMLButtonElement>('.mv-spinbtn')!;
  const snapBtn = host.querySelector<HTMLButtonElement>('.mv-snap')!;
  const exportBtn = host.querySelector<HTMLButtonElement>('.mv-export')!;

  legendBiomes.innerHTML = (Object.keys(COLORS) as BiomeId[])
    .filter((b) => b !== 'deep')
    .map((b) => `<span class="mv-key" data-brush="${b}"><i style="background:rgb(${COLORS[b].join(',')})"></i>${b}</span>`)
    .join('');
  legendBiomes.querySelectorAll<HTMLElement>('[data-brush]').forEach((el) =>
    el.addEventListener('click', () => {
      if (!paintBiome) return; // swatches are informational until the brush is out
      paintBiome = el.dataset.brush!;
      legendBiomes.querySelectorAll('[data-brush]').forEach((x) => x.classList.toggle('mv-brush-on', x === el));
      paintToolbar();
    }));
  host.querySelector<HTMLButtonElement>('.mv-terrbtn')!.addEventListener('click', (ev) => {
    ev.stopPropagation(); // don't fold the section
    if (paintBiome) exitPaint();
    else enterTerrainPaint();
  });

  const claimOwners = Object.keys(plane.claims ?? {}).filter((id) => world.entities[id] && !world.entities[id]!.deleted);
  const claimColor = new Map(claimOwners.map((id, i) => [id, CLAIM_COLORS[i % CLAIM_COLORS.length]!]));
  // the legend is a CONTROL PANEL (owner, batch 23): click an owner to hide
  // that realm's wash, border, and label — compare any subset of claims
  const hiddenClaims = new Set<string>();
  legendClaims.innerHTML = claimOwners
    .map((id) => `<span class="mv-key mv-clickable" data-owner="${id}" title="Click to show/hide this claim"><i style="border:2px solid ${claimColor.get(id)}; background:none"></i>${(world.entities[id]!.name)}<button type="button" class="mv-paintbtn" data-paint="${id}" title="Paint this realm's borders">✏️</button></span>`)
    .join('');
  legendClaims.querySelectorAll<HTMLButtonElement>('[data-paint]').forEach((btn) =>
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation(); // don't toggle visibility
      const id = btn.dataset.paint!;
      if (paintOwner === id) exitPaint();
      else { exitPaint(); enterPaint(id); }
    }));
  // collapsible sections (owner, batch 24): the legend was too busy —
  // Terrain starts folded; every section header toggles its block
  host.querySelectorAll<HTMLElement>('.mv-shead').forEach((head) => {
    head.addEventListener('click', () => {
      const sec = head.dataset.sec!;
      const block = host.querySelector<HTMLElement>(`.mv-${sec}`)!;
      block.hidden = !block.hidden;
      const arrow = head.querySelector('span');
      if (arrow) arrow.textContent = block.hidden ? '▸' : '▾';
    });
  });
  legendClaims.querySelectorAll<HTMLElement>('[data-owner]').forEach((el) =>
    el.addEventListener('click', () => {
      const id = el.dataset.owner!;
      if (hiddenClaims.has(id)) { hiddenClaims.delete(id); el.style.opacity = ''; }
      else { hiddenClaims.add(id); el.style.opacity = '0.38'; }
      repaint();
    }));

  // start over the first anchor; a fresh anchorless world opens fit-to-screen
  // so the creator sees the whole world they just sketched
  const firstAnchor = (plane.anchors ?? [])[0];
  const view = { x: firstAnchor?.x ?? 0, y: firstAnchor?.y ?? 0, ppf: 0.00002 };
  let fitPending = !firstAnchor;
  // URL-hash viewport (M1, batch 30): #map=x,y,ppf restores the camera on
  // reload — a shareable "you are here" for the same world on this device
  {
    const m = /^#map=(-?[\d.]+),(-?[\d.]+),([\d.e-]+)$/.exec(location.hash);
    if (m) {
      view.x = Number(m[1]); view.y = Number(m[2]);
      view.ppf = Math.max(1e-6, Math.min(1, Number(m[3])) || view.ppf);
      fitPending = false;
    }
  }
  let hashTimer = 0;
  function writeViewHash(): void {
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      const h = `#map=${Math.round(view.x)},${Math.round(view.y)},${view.ppf.toExponential(3)}`;
      history.replaceState(null, '', h); // no history spam while panning
    }, 250);
  }
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
  // fade 4px→8px; the base switch happens at 8px where the fade hits exactly
  // 1, so zooming never pops (owner, batch 12: smooth between tiers)
  const tierAlpha = (ti: number) => Math.max(0, Math.min(1, (TIERS[ti]!.hexFt * view.ppf - 4) / 4));

  const cache = new Map<string, { b: BiomeId; e: number; d: number }>();
  // ---------- biome paint: the sparse override store (M1, batch 29) ----------
  // plane.biomePaint maps 'tier:q,r' → biome. A painted world hex re-biomes
  // every finer hex inside it; painting region/locale carves detail back out.
  const PAINT_TIERS = ['world', 'region', 'locale'];
  const paintByTier = new Map<string, Map<string, string>>();
  function rebuildBiomePaint(): void {
    paintByTier.clear();
    for (const [addr, b] of Object.entries(plane.biomePaint ?? {})) {
      const m = /^(world|region|locale):(-?\d+),(-?\d+)$/.exec(addr);
      if (!m) continue;
      let g = paintByTier.get(m[1]!);
      if (!g) { g = new Map(); paintByTier.set(m[1]!, g); }
      g.set(m[2] + ',' + m[3], b);
    }
    cache.clear();
  }
  /** finest paint wins: locale beats region beats world */
  function paintedBiomeAt(x: number, y: number): string | null {
    if (!paintByTier.size) return null;
    const xn = ((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    for (let i = PAINT_TIERS.length - 1; i >= 0; i--) {
      const g = paintByTier.get(PAINT_TIERS[i]!);
      if (!g) continue;
      const ti = TIERS.findIndex((t2) => t2.id === PAINT_TIERS[i]);
      const [q, r] = pointToHex(ti, xn, y);
      const hit = g.get(q + ',' + r);
      if (hit) return hit;
    }
    return null;
  }
  function hexInfoAt(ti: number, q: number, r: number) {
    const k = ti + ':' + q + ',' + r;
    let v = cache.get(k);
    if (!v) {
      const [cx, cy] = hexCenter(ti, q, r);
      const oct = octFor(TIERS[ti]!.hexFt);
      // small enough that classification flips stay inside the coastal band
      // the terrain contract allows (smoke check 6)
      const d = detailAt(cfg, cx, cy, TIERS[ti]!.hexFt, TIERS[ti]!.salt);
      const bias = (d - 0.5) * 0.03;
      const painted = paintedBiomeAt(cx, cy) as BiomeId | null;
      v = { b: painted ?? biomeAt(cfg, cx, cy, oct, bias), e: elevationAt(cfg, cx, cy, oct) + bias, d };
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
    const showGlyphs = showArt.checked && hexPx > 6 && alpha > 0.45;
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
        if (showGlyphs) drawGlyphs(ti, q, r, b, sx, sy, hexPx);
      }
    }
    ctx.globalAlpha = 1;
  }
  const hash3ish = (q: number, r: number, s: number): number => h32(q + ',' + r + ',' + s, 77) / 4294967295;

  // ---------- per-hex terrain art, ported from the hex-map alpha ----------
  // pines in the woods, snow-capped peaks, rolling hill arcs, dune curls,
  // grass tufts, tundra stones — the map reads as a drawn map again
  function mulberry(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
      t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
      return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
    };
  }
  function drawGlyphs(ti: number, q: number, r: number, b: BiomeId, sx: number, sy: number, hexPxRaw: number): void {
    const rng = mulberry(h32(ti + ':' + q + ',' + r, 91));
    // floor the glyph basis: on the 8-tier ladder base hexes run small, and
    // 2px pines are specks — glyphs overlap neighboring hexes instead, which
    // is exactly how the alpha's dense forest texture read
    const hexPx = Math.min(Math.max(hexPxRaw, 24), 90);
    // SPACE VIEW (owner, batch 24): the art never cuts out — tiny hexes get
    // one mark each, and a forest reads as a dense mass of tiny pines
    const tiny = hexPxRaw < 14;
    const jx = () => (rng() - 0.5) * hexPxRaw * 0.66, jy = () => (rng() - 0.5) * hexPxRaw * 0.55;
    if (b === 'forest' || b === 'jungle' || b === 'taiga') {
      const gs = hexPx * (b === 'jungle' ? 0.16 : 0.14);
      ctx.fillStyle = b === 'taiga' ? 'rgba(20,38,30,0.55)' : 'rgba(22,44,24,0.55)';
      for (let i = 0; i < (tiny ? 1 : 3); i++) {
        const x = sx + jx(), y = sy + jy();
        ctx.beginPath(); ctx.moveTo(x, y - gs); ctx.lineTo(x - gs * 0.6, y + gs * 0.5); ctx.lineTo(x + gs * 0.6, y + gs * 0.5); ctx.fill();
      }
    } else if (b === 'mountain') {
      const gs = hexPx * 0.26;
      for (let i = 0; i < (tiny ? 1 : 2); i++) {
        const x = sx + jx() * 0.6, y = sy + jy() * 0.6 + gs * 0.2;
        ctx.fillStyle = 'rgba(52,48,42,0.6)';
        ctx.beginPath(); ctx.moveTo(x, y - gs); ctx.lineTo(x - gs * 0.85, y + gs * 0.5); ctx.lineTo(x + gs * 0.85, y + gs * 0.5); ctx.fill();
        ctx.strokeStyle = 'rgba(235,238,240,0.7)'; ctx.lineWidth = Math.max(1, hexPx * 0.03);
        ctx.beginPath(); ctx.moveTo(x - gs * 0.22, y - gs * 0.48); ctx.lineTo(x, y - gs); ctx.lineTo(x + gs * 0.22, y - gs * 0.48); ctx.stroke();
      }
    } else if (b === 'hills') {
      ctx.strokeStyle = 'rgba(64,60,46,0.55)'; ctx.lineWidth = Math.max(1, hexPx * 0.035);
      for (let i = 0; i < (tiny ? 1 : 2); i++) {
        const x = sx + jx() * 0.7, y = sy + jy() * 0.7, gs = hexPx * 0.16;
        ctx.beginPath(); ctx.arc(x, y, gs, Math.PI, 0); ctx.stroke();
      }
    } else if (b === 'desert') {
      ctx.strokeStyle = 'rgba(150,116,66,0.5)'; ctx.lineWidth = Math.max(1, hexPx * 0.03);
      for (let i = 0; i < (tiny ? 1 : 2); i++) {
        const x = sx + jx() * 0.7, y = sy + jy() * 0.7, gs = hexPx * 0.13;
        ctx.beginPath(); ctx.arc(x, y + gs, gs, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      }
    } else if (b === 'grass' || b === 'savanna') {
      if (rng() < (tiny ? 0.45 : 0.9)) { // sparse tufts, not every hex
        ctx.strokeStyle = 'rgba(40,66,30,0.85)'; ctx.lineWidth = Math.max(1, hexPx * 0.04);
        for (let i = 0; i < (tiny ? 1 : 4); i++) {
          const x = sx + jx(), y = sy + jy(), gs = hexPx * 0.12;
          ctx.beginPath(); ctx.moveTo(x - gs, y); ctx.quadraticCurveTo(x - gs * 0.4, y - gs, x, y);
          ctx.moveTo(x, y); ctx.quadraticCurveTo(x + gs * 0.4, y - gs, x + gs, y); ctx.stroke();
        }
      }
    } else if (b === 'tundra' || b === 'snow') {
      if (rng() < (tiny ? 0.25 : 0.5)) {
        ctx.fillStyle = 'rgba(96,106,100,0.65)';
        for (let i = 0; i < (tiny ? 1 : 3); i++) {
          const x = sx + jx(), y = sy + jy();
          ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, hexPx * 0.025), 0, 7); ctx.fill();
        }
      }
    }
  }

  // claims pre-parsed once per mount: kingdoms claim world hexes, local
  // compacts claim region hexes — any tier renders, boundary edges only
  interface ClaimSet { owner: string; color: string; ti: number; hexes: Array<[number, number]>; set: Set<string> }
  const claimSets: ClaimSet[] = [];
  function rebuildClaims(): void {
  claimSets.length = 0;
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
      if (ti < 0) continue;
      // alias each hex at q±period so the neighbor check survives the
      // east–west seam — otherwise a phantom border runs down the wrap line
      const qP = Math.round(cfg.circumFt / (SQ3 * hexR(ti)));
      for (const [q, r] of g.hexes) {
        g.set.add((q - qP) + ',' + r);
        g.set.add((q + qP) + ',' + r);
      }
      claimSets.push({ owner, color, ti, hexes: g.hexes, set: g.set });
    }
  }
  }
  rebuildClaims();
  rebuildBiomePaint();

  // ---------- travel time (Phase D, batch 33) ----------
  // 🥾: tap a start and a destination; the tool routes over roads and wild
  // country, fords rivers (bridges spare you), and answers in days.
  const WORLD_TI = TIERS.findIndex((t2) => t2.id === 'world');
  let travelRoads: Map<string, string> | null = null;
  let travelRivers: Set<string> | null = null;
  const RANK: Record<string, number> = { highway: 3, road: 2, dirt: 1, path: 1 };
  function buildTravelLayers(): void {
    if (travelRoads) return;
    travelRoads = new Map();
    travelRivers = new Set();
    const stampLine = (pts: Array<[number, number]>, mark: (k: string) => void): void => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
        if (Math.abs(bx - ax) > cfg.circumFt / 2) continue; // seam split
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (TIERS[WORLD_TI]!.hexFt / 2)));
        for (let s2 = 0; s2 <= steps; s2++) {
          const px = ax + ((bx - ax) * s2) / steps, py = ay + ((by - ay) * s2) / steps;
          const xn = ((px % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
          const [q, r] = pointToHex(WORLD_TI, xn, py);
          mark(q + ',' + r);
        }
      }
    };
    for (const rt of plane.routes ?? []) {
      const kind = rt.kind ?? 'road';
      if (kind === 'seaRoute') continue;
      if (kind === 'river') stampLine(rt.pts, (k) => travelRivers!.add(k));
      else stampLine(rt.pts, (k) => {
        const cur = travelRoads!.get(k);
        if (!cur || (RANK[kind] ?? 0) > (RANK[cur] ?? 0)) travelRoads!.set(k, kind);
      });
    }
  }
  const bridgeAnchors = (plane.anchors ?? []).filter((a) => a.icon === 'bridge');
  let travelPlan: TravelPlan | null = null;
  let travelFrom: [number, number] | null = null; // world hex q,r
  function travelDeps() {
    buildTravelLayers();
    return {
      circumFt: cfg.circumFt,
      biomeOf: (q: number, r: number) => hexInfoAt(WORLD_TI, q, r).b as string,
      roadOf: (q: number, r: number) => travelRoads!.get(q + ',' + r) ?? null,
      riverAt: (q: number, r: number) => travelRivers!.has(q + ',' + r),
      bridgeNear: (x: number, y: number) =>
        bridgeAnchors.some((b2) => Math.abs(wrapDx(b2.x - x)) < 45 * 5280 && Math.abs(b2.y - y) < 45 * 5280),
      centerOf: (q: number, r: number) => hexCenter(WORLD_TI, q, r),
      canon: (q: number, r: number): [number, number] => {
        const [cx2, cy2] = hexCenter(WORLD_TI, q, r);
        const xn = ((cx2 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
        return pointToHex(WORLD_TI, xn, cy2);
      },
    };
  }
  function travelPrompt(step: 1 | 2): void {
    hexInfo.hidden = false;
    hexInfo.innerHTML = step === 1
      ? '<b>🥾 Travel time</b> — tap the START point'
      : '<b>🥾 Travel time</b> — now tap the DESTINATION';
  }
  function showTravelPlan(): void {
    if (!travelPlan) {
      hexInfo.hidden = false;
      hexInfo.innerHTML = '<b>🥾 No overland route</b> — open water bars the way. <button type="button" class="mv-tclear">✕</button>';
    } else {
      const p2 = travelPlan;
      hexInfo.hidden = false;
      hexInfo.innerHTML = `<b>🥾 ≈ ${p2.miles} mi</b> · on foot <b>${p2.footDays}</b> days · mounted ~<b>${p2.mountedDays}</b>` +
        ` <span style="opacity:.75">(${Math.round(p2.roadShare * 100)}% on roads${p2.fords ? `, ${p2.fords} ford${p2.fords > 1 ? 's' : ''}` : ''})</span>` +
        ` <button type="button" class="mv-tclear">✕</button>`;
    }
    hexInfo.querySelector('.mv-tclear')?.addEventListener('click', () => {
      travelPlan = null;
      hexInfo.hidden = true;
      repaint();
    });
  }

  // ---------- M2: painting the borders (owner, batch 10 → 27) ----------
  // "adjustable in the case of a war campaign and the GM is moving borders
  // as the party succeeds or fails" — pick a realm in the legend, drag over
  // hexes to claim them for that crown, toggle erase to cede them.
  const escT = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  let paintOwner: string | null = null;
  let paintBiome: string | null = null; // terrain brush (M1 biome paint, batch 29)
  let paintTid = 'world';
  let paintErase = false;
  let paintStroke = false;
  let paintTouched = false;
  /** the paintable tier that matches the current zoom */
  function paintTierNow(): string {
    let baseTi = 0;
    for (let i = 0; i < TIERS.length; i++) if (TIERS[i]!.hexFt * view.ppf >= 8) baseTi = i;
    const id = TIERS[baseTi]!.id;
    if (id === 'region' || id === 'mile') return 'region';
    if (id === 'locale') return 'locale';
    return 'world';
  }
  function paintToolbar(): void {
    if (!paintOwner && !paintBiome) return;
    const head = paintOwner
      ? `<b>✏️ Painting ${escT(world.entities[paintOwner]?.name ?? paintOwner)}</b> — drag to claim ${paintTid} hexes`
      : `<b>🖌 Painting terrain: ${escT(paintBiome!)}</b> — pick a color above, drag to paint (zoom picks the hex size)`;
    hexInfo.hidden = false;
    hexInfo.innerHTML = head +
      `<div style="margin-top:4px;display:flex;gap:6px;align-items:center">` +
      `<label style="display:flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" class="mv-erase"${paintErase ? ' checked' : ''}> ${paintOwner ? 'erase (cede)' : 'erase (restore nature)'}</label>` +
      `<button type="button" class="mv-paintdone">✓ done</button></div>`;
    hexInfo.querySelector<HTMLInputElement>('.mv-erase')!.addEventListener('change', (ev) => {
      paintErase = (ev.target as HTMLInputElement).checked;
    });
    hexInfo.querySelector<HTMLButtonElement>('.mv-paintdone')!.addEventListener('click', () => exitPaint());
  }
  function enterPaint(id: string): void {
    paintOwner = id;
    const first = (plane.claims?.[id] ?? [])[0];
    paintTid = first ? first.split(':')[0]! : 'world';
    paintErase = false;
    selected = null;
    legendClaims.querySelector(`[data-paint="${id}"]`)?.classList.add('mv-painting');
    paintToolbar();
  }
  function exitPaint(): void {
    if (!paintOwner && !paintBiome) return;
    if (paintOwner) legendClaims.querySelector(`[data-paint="${paintOwner}"]`)?.classList.remove('mv-painting');
    paintOwner = null;
    paintBiome = null;
    legendBiomes.classList.remove('mv-brushes');
    hexInfo.hidden = true;
    if (paintTouched) { paintTouched = false; cb.onClaimsEdited?.(); }
  }
  function enterTerrainPaint(): void {
    exitPaint();
    paintBiome = 'water';
    paintErase = false;
    selected = null;
    // unfold the Terrain section — the swatches ARE the brush palette
    const biomesBlock = host.querySelector<HTMLElement>('.mv-biomes')!;
    biomesBlock.hidden = false;
    const arrow = host.querySelector('.mv-shead[data-sec="biomes"] span');
    if (arrow) arrow.textContent = '▾';
    legendBiomes.classList.add('mv-brushes');
    paintToolbar();
  }
  function paintHexAt(px: number, py: number): void {
    if (paintBiome) { // terrain brush (M1 biome paint)
      const tid = paintTierNow();
      const ti = TIERS.findIndex((t2) => t2.id === tid);
      const [wx, wy] = toWorld(px, py);
      const [q, r] = pointToHex(ti, wx, wy);
      const addr = `${tid}:${q},${r}`;
      plane.biomePaint ??= {};
      if (paintErase) {
        if (!(addr in plane.biomePaint)) return;
        delete plane.biomePaint[addr];
      } else {
        if (plane.biomePaint[addr] === paintBiome) return;
        plane.biomePaint[addr] = paintBiome;
      }
      paintTouched = true;
      rebuildBiomePaint();
      repaint();
      return;
    }
    if (!paintOwner) return;
    const ti = TIERS.findIndex((t2) => t2.id === paintTid);
    if (ti < 0) return;
    const [wx, wy] = toWorld(px, py); // toWorld normalizes x — canonical hex
    const [q, r] = pointToHex(ti, wx, wy);
    const addr = `${paintTid}:${q},${r}`;
    plane.claims ??= {};
    const mine = (plane.claims[paintOwner] ??= []);
    const idx = mine.indexOf(addr);
    if (paintErase) {
      if (idx < 0) return;
      mine.splice(idx, 1);
    } else {
      if (idx >= 0) return;
      // one crown per hex: annex it from whoever held it at this tier
      for (const [other, list] of Object.entries(plane.claims)) {
        if (other === paintOwner) continue;
        const oi = list.indexOf(addr);
        if (oi >= 0) list.splice(oi, 1);
      }
      mine.push(addr);
    }
    paintTouched = true;
    rebuildClaims();
    repaint();
  }

  function drawClaims(): void {
    for (const cs of claimSets) {
      if (hiddenClaims.has(cs.owner)) continue;
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

  // ---------- the density ghost layer (MAPS §9b) ----------
  // Unwritten settlements from the habitability field: same hex, same ghost,
  // every visit. Hostile landmarks cast danger shadows (suppressed or
  // abandoned); hexes near REAL settlements defer to them; a materialized
  // ghost stops being a ghost because its contract id now lives in the doc.
  const HOSTILE_ICONS = new Set(['dungeon', 'lair', 'cave']);
  const hostiles = (plane.anchors ?? [])
    .filter((a) => HOSTILE_ICONS.has(a.icon ?? ''))
    .map((a) => ({ x: a.x, y: a.y }));
  const REGION_TI = TIERS.findIndex((t) => t.id === 'region');
  const settledNearby = (x: number, y: number) =>
    (plane.anchors ?? []).some((a) => !a.icon?.includes('label') && Math.abs(wrapDx(a.x - x)) < 31680 * 1.2 && Math.abs(a.y - y) < 31680 * 1.2);
  // region hexes hugging a baked river: riverbank country fills first
  // (G3 batch 22) — walk every river polyline once, stamp the hex + ring 1
  const riverHexes = new Set<string>();
  {
    for (const rt of plane.routes ?? []) {
      if (rt.kind !== 'river') continue;
      for (let i = 0; i < rt.pts.length - 1; i++) {
        const [ax, ay] = rt.pts[i]!, [bx, by] = rt.pts[i + 1]!;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (31680 / 2)));
        for (let sIdx = 0; sIdx <= steps; sIdx++) {
          const px = ax + ((bx - ax) * sIdx) / steps, py = ay + ((by - ay) * sIdx) / steps;
          const xn = ((px % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
          const [rq, rr] = pointToHex(TIERS.findIndex((t) => t.id === 'region'), xn, py);
          for (const [dq2, dr2] of [[0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]) {
            riverHexes.add((rq + dq2!) + ',' + (rr + dr2!));
          }
        }
      }
    }
  }
  const ghostCache = new Map<string, (GhostSettlement & { gid: string }) | null>();
  function densityGhostAt(q0: number, r0: number): (GhostSettlement & { gid: string }) | null {
    // canonicalize: the seed contract addresses a hex by its ONE canonical
    // (q,r) — a wrapped view iterates shifted q, which must map back before
    // seeding or the seam would grow a second, different ghost
    const [cx0, cy0] = hexCenter(REGION_TI, q0, r0);
    const xn = ((cx0 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    const [q, r] = pointToHex(REGION_TI, xn, cy0);
    const k = q + ',' + r;
    let g = ghostCache.get(k);
    if (g === undefined) {
      const raw = ghostSettlementAt(cfg, world.seed, plane.id || 'p_surface', q, r, hostiles,
        riverHexes.has(q + ',' + r) ? 0.18 : 0);
      g = raw && !settledNearby(raw.x, raw.y) ? { ...raw, gid: ghostId(raw.seedPath) } : null;
      if (ghostCache.size > 60000) ghostCache.clear();
      ghostCache.set(k, g);
    }
    return g;
  }
  const featureCache = new Map<string, (GhostFeature & { gid: string }) | null>();
  function densityFeatureAt(q0: number, r0: number): (GhostFeature & { gid: string }) | null {
    const [cx0, cy0] = hexCenter(REGION_TI, q0, r0);
    const xn = ((cx0 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    const [q, r] = pointToHex(REGION_TI, xn, cy0);
    const k = q + ',' + r;
    let g = featureCache.get(k);
    if (g === undefined) {
      const raw = ghostFeatureAt(cfg, world.seed, plane.id || 'p_surface', q, r);
      g = raw && !settledNearby(raw.x, raw.y) ? { ...raw, gid: ghostId(raw.seedPath) } : null;
      if (featureCache.size > 60000) featureCache.clear();
      featureCache.set(k, g);
    }
    return g;
  }
  function drawGhosts(): void {
    if (!showPins.checked) return;
    const R2 = hexR(REGION_TI);
    const hexPx = 31680 * view.ppf;
    if (hexPx < 20) return; // the unwritten appear once the country is close
    const [, y0] = toWorld(0, -40), [, y1] = toWorld(0, H + 40);
    const rMin = Math.floor((2 / 3 * y0) / R2), rMax = Math.ceil((2 / 3 * y1) / R2);
    const halfSpanX = (W / 2 + 40) / view.ppf;
    ctx.textAlign = 'center';
    for (let r = rMin; r <= rMax; r++) {
      const qc = (SQ3 / 3 * view.x) / R2 - r / 2;
      const qSpan = Math.ceil((SQ3 / 3 * halfSpanX) / R2) + 1;
      for (let q = Math.floor(qc - qSpan); q <= Math.ceil(qc + qSpan); q++) {
        const g = densityGhostAt(q, r);
        if (g && !world.entities[g.gid]) {
          const [sx, sy] = toScreen(g.x, g.y);
          if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
          const s = g.cls === 'town' ? 10 : g.cls === 'village' ? 8 : 6;
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = g.abandoned ? 'rgba(205,120,108,0.8)' : 'rgba(244,239,223,0.6)';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(sx - s / 2, sy - s / 2, s, s);
          ctx.setLineDash([]);
          if (g.abandoned) {
            ctx.beginPath();
            ctx.moveTo(sx - s / 2, sy - s / 2); ctx.lineTo(sx + s / 2, sy + s / 2);
            ctx.moveTo(sx + s / 2, sy - s / 2); ctx.lineTo(sx - s / 2, sy + s / 2);
            ctx.stroke();
          }
          if (hexPx > 34) {
            ctx.font = 'italic 11px Georgia, serif';
            ctx.fillStyle = g.abandoned ? 'rgba(205,120,108,0.85)' : 'rgba(244,239,223,0.55)';
            ctx.fillText((g.abandoned ? 'abandoned ' : 'unwritten ') + g.cls, sx, sy - s + 1);
          }
          continue;
        }
        const f = densityFeatureAt(q, r);
        if (f && !world.entities[f.gid]) {
          const [sx, sy] = toScreen(f.x, f.y);
          if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
          ctx.setLineDash([2, 3]);
          ctx.strokeStyle = 'rgba(205,120,108,0.7)';
          ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.6;
          ctx.font = '10px system-ui';
          ctx.fillText(ANCHOR_ICON[f.kind] ?? '☠️', sx, sy + 3.5);
          ctx.globalAlpha = 1;
          if (hexPx > 34) {
            ctx.font = 'italic 11px Georgia, serif';
            ctx.fillStyle = 'rgba(205,120,108,0.75)';
            ctx.fillText('unwritten ' + f.kind, sx, sy - 8);
          }
        }
      }
    }
  }

  // ---------- roads (batch 11): classes reveal as you zoom ----------
  // highways surface first (third zoom band), roads next, dirt tracks last
  const ROUTE_MIN_PPF: Record<string, number> = { highway: 3e-4, road: 1e-3, dirt: 5e-3, river: 3e-4, path: 5e-3, seaRoute: 3e-4 };
  function drawRoutes(): void {
    for (const rt of plane.routes ?? []) {
      const kind = rt.kind ?? 'road';
      if (kind === 'river' ? !showRivers.checked : !showRoads.checked) continue;
      // rivers reveal by width class (batch 21): great rivers belong on the
      // continental view like any real map; streams appear as you close in
      const rw = kind === 'river' ? Math.max(1, Math.min(3, rt.w ?? 2)) : 0;
      const minPpf = kind === 'river' ? (rw >= 2 ? 0 : 1e-3) : (ROUTE_MIN_PPF[kind] ?? 1e-3);
      if (view.ppf < minPpf) continue;
      if (kind === 'river' || kind === 'seaRoute') {
        const far = view.ppf < 1e-4; // continental view: rivers thin to atlas lines
        ctx.strokeStyle = kind === 'river' ? 'rgba(66,106,148,0.85)' : 'rgba(72,110,150,0.9)';
        ctx.lineWidth = kind === 'river' ? (rw >= 3 ? (far ? 1.8 : 3.2) : rw >= 2 ? (far ? 1.2 : 2.1) : 1.3) : 2;
        ctx.setLineDash(kind === 'seaRoute' ? [6, 5] : []);
      } else {
        ctx.strokeStyle = kind === 'highway' ? 'rgba(88,66,44,0.95)' : kind === 'dirt' ? 'rgba(128,102,70,0.7)' : 'rgba(106,82,56,0.85)';
        ctx.lineWidth = kind === 'highway' ? 2.6 : kind === 'dirt' ? 1.2 : 1.8;
        ctx.setLineDash(kind === 'dirt' || kind === 'path' ? [5, 4] : []);
      }
      ctx.beginPath();
      let prev: [number, number] | null = null;
      for (const [x, y] of rt.pts) {
        const [sx, sy] = toScreen(x, y);
        // a jump wider than the screen means the polyline wrapped the seam
        if (prev && Math.abs(sx - prev[0]) < W * 1.5) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        prev = [sx, sy];
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
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
  // settlement visibility follows POPULATION (owner, batch 11): a
  // million-soul metropolis and capitals read at world scale, quarter-million
  // cities at the next band, 50k at the next, everything by street level
  function visibilityFt(a: { tier: string; promoted?: boolean }, ent: { kind: string; fields?: Record<string, unknown> }): number {
    if (ent.kind === 'settlement') {
      const pop = Number((ent.fields ?? {}).population ?? 0);
      if (pop >= 1_000_000) return Infinity;
      if (pop >= 250_000) return 316800;
      if (pop >= 50_000) return 31680;
      if (pop >= 1_000) return 5280;
      return 500;
    }
    return TIER_FT[a.tier] ?? 31680;
  }
  // ---------- label placement (M4 declutter, batch 28) ----------
  // Every map name goes through one queue: higher-priority labels place
  // first, and anything that would overlap an already-placed name stays
  // silent this frame (the pin still shows; the name returns with room).
  interface LabelReq { x: number; y: number; text: string; font: string; size: number; fill: string; prio: number }
  function placeLabels(queue: LabelReq[]): void {
    queue.sort((a, b) => b.prio - a.prio);
    const boxes: Array<[number, number, number, number]> = [];
    for (const L of queue) {
      ctx.font = L.font;
      const w = ctx.measureText(L.text).width + 6;
      const h = L.size + 4;
      const bx = L.x - w / 2, by = L.y - L.size;
      let hit = false;
      for (const [ox, oy, ow, oh] of boxes) {
        if (bx < ox + ow && bx + w > ox && by < oy + oh && by + h > oy) { hit = true; break; }
      }
      if (hit) continue;
      boxes.push([bx, by, w, h]);
      ctx.fillStyle = 'rgba(12,16,22,0.75)';
      ctx.fillText(L.text, L.x + 1, L.y + 1);
      ctx.fillStyle = L.fill;
      ctx.fillText(L.text, L.x, L.y);
    }
  }
  function drawAnchors(): void {
    if (!showPins.checked) return;
    ctx.textAlign = 'center';
    const labels: LabelReq[] = [];
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!ent || ent.deleted) continue;
      // declutter like a road atlas; promoted pins and metropolises always show
      const visFt = visibilityFt(a, ent as { kind: string; fields?: Record<string, unknown> });
      if (!a.promoted && visFt !== Infinity && visFt * view.ppf < 4) continue;
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -260 || sx > W + 260 || sy < -40 || sy > H + 40) continue;
      if (a.icon === 'label') {
        if (!showLabels.checked) continue;
        if (hiddenClaims.has(a.entityId)) continue; // hidden claim hides its name
        // a name written on the map itself — oceans, ranges, lakes, the
        // continent, and POLITICAL owners (batch 13): a claim owner's name
        // takes its territory's color
        const pol = claimColor.get(a.entityId);
        const size = Math.max(13, Math.min(30, (TIER_FT[a.tier] ?? 316800) * view.ppf * 0.09));
        labels.push({ x: sx, y: sy, text: ent.name, size,
          font: `italic ${size}px Georgia, 'Times New Roman', serif`,
          fill: pol ?? 'rgba(240,236,222,0.82)',
          prio: pol ? 90 : a.tier === 'world' ? 80 : 60 });
        continue;
      }
      const waterborne = a.icon === 'waterborne';
      const glyph = ANCHOR_ICON[a.icon ?? ''] ?? KIND_ICON[ent.kind];
      const ring = waterborne ? '#6fd3e0' : '#ffd479';
      // name priority follows the visibility ladder: metropolises outrank
      // cities outrank towns — the atlas rule, applied to collisions too
      const prio = Math.max(a.promoted ? 70 : 0,
        visFt === Infinity ? 75 : visFt >= 316800 ? 65 : visFt >= 31680 ? 55 : visFt >= 5280 ? 45 : 35);
      let labelY: number;
      const footPx = footprinted.get(a.entityId);
      if (footPx !== undefined) {
        // the footprint art IS the marker now — just name it
        labels.push({ x: sx, y: sy - footPx / 2 - 5, text: ent.name, size: 13, font: '13px system-ui', fill: '#f4efdf', prio });
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
      labels.push({ x: sx, y: labelY, text: ent.name, size: 13, font: '13px system-ui', fill: '#f4efdf', prio });
    }
    placeLabels(labels);
  }

  const FT_PER_KM = 3280.84;
  function niceScale(): [number, string] {
    // storage is always feet; display honors settings.unitsDisplay (Q21)
    const metric = (world as { settings?: { unitsDisplay?: string } }).settings?.unitsDisplay === 'metric';
    const perUnit = metric ? FT_PER_KM : 5280;
    const targetFt = 120 / view.ppf;
    const units = targetFt / perUnit;
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
    let best = steps[0]!;
    for (const s of steps) if (s <= units) best = s;
    return [best * perUnit, `${best} ${metric ? 'km' : 'mi'}`];
  }

  // ---------- the globe: a projection change, not a data change ----------
  // G1 samples noise on a cylinder precisely so this works: the flat map's
  // x IS longitude. Equirect texture baked once per mount; orthographic
  // per-pixel lookup after that, so the sphere spins in real time. Zooming
  // out past fit-world rolls the map up into the globe; zooming in lands
  // where the globe is facing.
  let globeMode = false;
  let globeRot = 0;
  let globeTilt = 0; // rotate toward the poles (owner, batch 25)
  let globeDragging = false;
  let autoSpin = true;
  let spinRaf = 0;
  let tex: ImageData | null = null;
  const TEXW = 1024, TEXH = 512; // 4× the old fidelity (owner, batch 25)
  function buildGlobeTexture(): void {
    if (tex) return;
    const off = document.createElement('canvas');
    off.width = TEXW; off.height = TEXH;
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(TEXW, TEXH);
    const d = img.data;
    for (let j = 0; j < TEXH; j++) {
      const y = ((j + 0.5) / TEXH - 0.5) * cfg.heightFt;
      for (let i = 0; i < TEXW; i++) {
        const x = ((i + 0.5) / TEXW) * cfg.circumFt;
        const e = elevationAt(cfg, x, y, 5);
        const b = biomeAt(cfg, x, y, 5);
        let [r, g, bl] = COLORS[b];
        if (b === 'deep' || b === 'water') {
          const f = Math.max(0, Math.min(1, (e - 0.3) / 0.2));
          r = 29 + 34 * f; g = 47 + 59 * f; bl = 71 + 72 * f;
        } else {
          const f = 0.95 + (e - 0.5) * 0.7;
          r *= f; g *= f; bl *= f;
        }
        const k = (j * TEXW + i) * 4;
        d[k] = r; d[k + 1] = g; d[k + 2] = bl; d[k + 3] = 255;
      }
    }
    // the great rivers belong on the globe too — composite them onto the
    // equirect before sampling
    octx.putImageData(img, 0, 0);
    octx.strokeStyle = 'rgba(66,106,148,0.9)';
    octx.lineJoin = 'round';
    for (const rt of plane.routes ?? []) {
      if (rt.kind !== 'river' || (rt.w ?? 1) < 2) continue;
      octx.lineWidth = (rt.w ?? 2) >= 3 ? 1.7 : 1.0;
      octx.beginPath();
      let pu = -1;
      for (const [x, y] of rt.pts) {
        const u = (((x / cfg.circumFt) % 1 + 1) % 1) * TEXW;
        const v = (y / cfg.heightFt + 0.5) * TEXH;
        if (pu >= 0 && Math.abs(u - pu) < TEXW / 2) octx.lineTo(u, v);
        else octx.moveTo(u, v);
        pu = u;
      }
      octx.stroke();
    }
    tex = octx.getImageData(0, 0, TEXW, TEXH);
  }
  function drawGlobe(): void {
    if (!tex) return;
    const R = Math.min(W, H) * 0.42;
    const cx = W / 2, cy = H / 2;
    const S = Math.max(2, Math.floor(2 * R * DPR));
    const img = ctx.createImageData(S, S);
    const o = img.data, td = tex.data;
    const half = S / 2, Rd = R * DPR;
    const ct = Math.cos(globeTilt), st = Math.sin(globeTilt);
    for (let py = 0; py < S; py++) {
      const ny = (py + 0.5 - half) / Rd;
      for (let px = 0; px < S; px++) {
        const nx = (px + 0.5 - half) / Rd;
        const rr = nx * nx + ny * ny;
        const k = (py * S + px) * 4;
        if (rr > 1) { o[k] = 11; o[k + 1] = 14; o[k + 2] = 20; o[k + 3] = 255; continue; }
        const nz = Math.sqrt(1 - rr);
        // tilt: rotate the view ray around the screen-x axis, so dragging
        // vertically rolls the poles into view (owner, batch 25)
        const wy = ny * ct - nz * st;
        const wz = ny * st + nz * ct;
        const lat = Math.asin(Math.max(-1, Math.min(1, wy)));
        let u = (Math.atan2(nx, wz) + globeRot) / (2 * Math.PI);
        u -= Math.floor(u);
        const v = Math.min(1, Math.max(0, lat / Math.PI + 0.5));
        // bilinear sample — the 4× texture stays smooth at the limb
        const fu = u * TEXW - 0.5, fv = v * TEXH - 0.5;
        const i0 = Math.floor(fu), j0 = Math.max(0, Math.min(TEXH - 2, Math.floor(fv)));
        const du = fu - i0, dv = fv - j0;
        const i0w = ((i0 % TEXW) + TEXW) % TEXW, i1w = (i0w + 1) % TEXW;
        const t00 = (j0 * TEXW + i0w) * 4, t10 = (j0 * TEXW + i1w) * 4;
        const t01 = ((j0 + 1) * TEXW + i0w) * 4, t11 = ((j0 + 1) * TEXW + i1w) * 4;
        const shade = 0.55 + 0.45 * Math.pow(nz, 0.6); // limb darkening
        for (let c = 0; c < 3; c++) {
          const top = td[t00 + c]! * (1 - du) + td[t10 + c]! * du;
          const bot = td[t01 + c]! * (1 - du) + td[t11 + c]! * du;
          o[k + c] = (top * (1 - dv) + bot * dv) * shade;
        }
        o[k + 3] = 255;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, W * DPR, H * DPR);
    ctx.putImageData(img, Math.round((cx - R) * DPR), Math.round((cy - R) * DPR));
    // capitals ride the sphere
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    for (const a of plane.anchors ?? []) {
      if (!a.promoted || a.icon !== 'city') continue;
      const ent = world.entities[a.entityId];
      if (!ent || ent.deleted) continue;
      const lonRel = ((a.x / cfg.circumFt) * 2 * Math.PI - globeRot + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      const lat = (a.y / cfg.heightFt) * Math.PI;
      const wx = Math.cos(lat) * Math.sin(lonRel), wy2 = Math.sin(lat), wz2 = Math.cos(lat) * Math.cos(lonRel);
      const nyA = wy2 * ct + wz2 * st, nzA = -wy2 * st + wz2 * ct;
      if (nzA <= 0.05) continue; // far side
      const sx = cx + R * wx;
      const sy = cy + R * nyA;
      ctx.fillStyle = '#ffd479';
      ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(244,239,223,0.9)';
      ctx.fillText(ent.name, sx, sy - 6);
    }
    // the axis of rotation, with N/S markers — always faint, brighter when
    // that pole faces you (owner, batch 25: tilt to see the poles)
    const nPoleY = cy - R * ct, sPoleY = cy + R * ct;
    ctx.strokeStyle = 'rgba(244,239,223,0.28)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(cx, nPoleY - 16); ctx.lineTo(cx, nPoleY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, sPoleY); ctx.lineTo(cx, sPoleY + 16); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = st > 0.03 ? 'rgba(244,239,223,0.95)' : 'rgba(244,239,223,0.45)';
    ctx.fillText('N', cx, nPoleY - 20);
    ctx.fillStyle = st < -0.03 ? 'rgba(244,239,223,0.95)' : 'rgba(244,239,223,0.45)';
    ctx.fillText('S', cx, sPoleY + 28);
    if (st > 0.03) { ctx.fillStyle = '#f4efdf'; ctx.beginPath(); ctx.arc(cx, nPoleY, 2, 0, 7); ctx.fill(); }
    if (st < -0.03) { ctx.fillStyle = '#f4efdf'; ctx.beginPath(); ctx.arc(cx, sPoleY, 2, 0, 7); ctx.fill(); }
    scaleEl.textContent = 'the globe — drag to spin, drag up/down for the poles';
  }
  function spinLoop(): void {
    if (!globeMode) return;
    if (autoSpin && !globeDragging) { globeRot += 0.0032; drawGlobe(); }
    spinRaf = requestAnimationFrame(spinLoop);
  }
  function enterGlobe(): void {
    if (globeMode) return;
    buildGlobeTexture();
    globeMode = true;
    autoSpin = true;
    spinBtn.textContent = '⏸ spin';
    spinBtn.hidden = false; snapBtn.hidden = false;
    globeBtn.textContent = '🗺 flat map';
    hexInfo.hidden = true;
    selected = null;
    drawGlobe();
    spinRaf = requestAnimationFrame(spinLoop);
  }
  function exitGlobe(): void {
    if (!globeMode) return;
    globeMode = false;
    cancelAnimationFrame(spinRaf);
    spinBtn.hidden = true; snapBtn.hidden = true;
    globeBtn.textContent = '🌐 globe';
    let u = (globeRot / (2 * Math.PI)) % 1;
    if (u < 0) u += 1;
    view.x = u * cfg.circumFt; // land facing where the globe faced
    view.y = 0;
    view.ppf = W > 0 ? W / cfg.circumFt : view.ppf;
    repaint();
  }
  travelBtn.addEventListener('click', () => {
    exitPaint();
    travelPlan = null;
    travelFrom = null;
    repaint();
    travelPrompt(1);
    pickPending = (x1, y1) => {
      const xn = ((x1 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
      travelFrom = pointToHex(WORLD_TI, xn, y1);
      travelPrompt(2);
      pickPending = (x2, y2) => {
        const xn2 = ((x2 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
        const to = pointToHex(WORLD_TI, xn2, y2);
        travelPlan = planTravel(travelDeps(), travelFrom!, to);
        showTravelPlan();
        repaint();
      };
    };
  });
  globeBtn.addEventListener('click', () => (globeMode ? exitGlobe() : enterGlobe()));
  spinBtn.addEventListener('click', () => {
    autoSpin = !autoSpin;
    spinBtn.textContent = autoSpin ? '⏸ spin' : '▶ spin';
  });
  snapBtn.addEventListener('click', () => { globeTilt = 0; if (globeMode) drawGlobe(); });
  exportBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${world.name || 'world'}-map.png`;
    a.click();
  });

  let raf = 0;
  function draw(): void {
    raf = 0;
    if (globeMode) { drawGlobe(); return; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgb(29,47,71)';
    ctx.fillRect(0, 0, W, H);
    // base = the finest tier that has FULLY crossfaded in (≥8px, where
    // tierAlpha reaches 1) — switching base earlier pops mid-fade
    let baseTi = 0;
    for (let i = 0; i < TIERS.length; i++) if (TIERS[i]!.hexFt * view.ppf >= 8) baseTi = i;
    for (let ti = baseTi; ti < TIERS.length; ti++) {
      const a = ti === baseTi ? 1 : tierAlpha(ti);
      if (a <= 0) break;
      drawTier(ti, a);
    }
    drawClaims();
    drawRoutes();
    drawFootprints();
    drawGhosts();
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
    if (travelPlan) { // the measured route rides above everything
      ctx.strokeStyle = 'rgba(255,180,70,0.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      let prevT: [number, number] | null = null;
      for (const [x2, y2] of travelPlan.pts) {
        const [sx2, sy2] = toScreen(x2, y2);
        if (prevT && Math.abs(sx2 - prevT[0]) < W * 1.5) ctx.lineTo(sx2, sy2);
        else ctx.moveTo(sx2, sy2);
        prevT = [sx2, sy2];
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawAnchors();
    const [ft, label] = niceScale();
    scaleEl.innerHTML = `<span class="mv-unit" title="Switch miles/kilometres">${label}</span><i style="width:${ft * view.ppf}px"></i>`;
    writeViewHash();
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
    // zoom-out floor = the whole world exactly filling the width ("fit
    // world"); pushing past it rolls the map up into the globe
    const minPpf = W > 0 ? W / cfg.circumFt : 6e-6;
    if (f < 1 && view.ppf <= minPpf * 1.0001) { enterGlobe(); return; }
    const [wx, wy] = toWorld(px, py);
    view.ppf = Math.max(minPpf, Math.min(8, view.ppf * f));
    const [nx, ny] = toWorld(px, py);
    view.x += wrapDx(wx - nx); view.y += wy - ny; clampY(); repaint();
  };
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    moved = false;
    if ((paintOwner || paintBiome) && !globeMode && pointers.size === 1) {
      paintStroke = true;
      paintHexAt(ev.offsetX, ev.offsetY);
      return;
    }
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      pinch = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const prev = pointers.get(ev.pointerId);
    if (!prev) return;
    pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (globeMode) {
      if (pointers.size === 1) {
        globeDragging = true;
        if (autoSpin) { autoSpin = false; spinBtn.textContent = '▶ spin'; } // your globe now
        globeRot -= (ev.offsetX - prev.x) * 0.006;
        globeTilt = Math.max(-1.45, Math.min(1.45, globeTilt + (ev.offsetY - prev.y) * 0.005));
        drawGlobe();
      }
      return;
    }
    if (paintStroke && pointers.size === 1) {
      moved = true;
      paintHexAt(ev.offsetX, ev.offsetY);
      return;
    }
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
    globeDragging = false;
    if (paintStroke) {
      paintStroke = false;
      if (paintTouched) { paintTouched = false; cb.onClaimsEdited?.(); }
      return; // a paint stroke is never a select tap
    }
    if (wasTap && !globeMode) select(ev.offsetX, ev.offsetY);
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (globeMode) {
      if (ev.deltaY < 0) exitGlobe(); // zoom in → land on the flat map
      return;
    }
    zoomAt(Math.exp(-ev.deltaY * 0.0016), ev.offsetX, ev.offsetY);
  }, { passive: false });

  let pickPending: ((x: number, y: number, tier: string, biome: string) => void) | null = null;
  function select(px: number, py: number): void {
    if (pickPending) { // 📍 placement tap: resolve and get out of the way
      let ti2 = TIERS.findIndex((t) => !t.renderOnly);
      for (let i = 0; i < TIERS.length; i++) if (tierAlpha(i) > 0.5 && !TIERS[i]!.renderOnly) ti2 = i;
      const [wx2, wy2] = toWorld(px, py);
      if (Math.abs(wy2) > cfg.heightFt / 2) return;
      const [q2, r2] = pointToHex(ti2, wx2, wy2);
      const [cx2, cy2] = hexCenter(ti2, q2, r2);
      const done = pickPending;
      pickPending = null;
      hexInfo.hidden = true;
      done(cx2, cy2, TIERS[ti2]!.id, hexInfoAt(ti2, q2, r2).b);
      return;
    }
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
    // does something unwritten live under this tap?
    let ghost: ((GhostSettlement | GhostFeature) & { gid: string }) | null = null;
    let ghostDesc = '';
    if (31680 * view.ppf >= 20) {
      const [gq, gr] = pointToHex(REGION_TI, wx, wy);
      const g = densityGhostAt(gq, gr);
      const f = densityFeatureAt(gq, gr);
      if (g && !world.entities[g.gid]) {
        ghost = g;
        ghostDesc = `${g.abandoned ? 'abandoned' : 'unwritten'} ${g.cls}${g.abandoned ? '' : ` — ~${g.pop} souls`}`;
      } else if (f && !world.entities[f.gid]) {
        ghost = f;
        ghostDesc = `unwritten ${f.kind}`;
      }
    }
    hexInfo.hidden = false;
    hexInfo.innerHTML = `<b>${TIERS[ti]!.id}:${q},${r}</b> · ${info.b}` +
      (ghost ? ` · <i>${ghostDesc}</i>
        <button type="button" class="mv-add mv-write">✎ Write it in</button>` : '') +
      `<button type="button" class="mv-add">+ Add here</button>`;
    hexInfo.querySelector('.mv-write')?.addEventListener('click', () => {
      if (ghost) cb.onMaterializeGhost(ghost);
    });
    hexInfo.querySelector('.mv-add:not(.mv-write)')?.addEventListener('click', () => {
      cb.onAddHere(cx, cy, `${TIERS[ti]!.id}:${q},${r}`, info.b);
    });
    repaint();
  }

  // a tree-click focus while the globe spins should land on the flat map
  const dropGlobe = () => {
    if (!globeMode) return;
    globeMode = false;
    cancelAnimationFrame(spinRaf);
    globeBtn.textContent = '🌐 globe';
  };

  for (const el of [showPins, showRoads, showRivers, showLabels, showArt]) el.addEventListener('change', repaint);
  scaleEl.addEventListener('click', (ev) => {
    if (!(ev.target as HTMLElement).classList?.contains('mv-unit')) return;
    const w2 = world as { settings?: { unitsDisplay?: string } };
    w2.settings ??= {};
    w2.settings.unitsDisplay = w2.settings.unitsDisplay === 'metric' ? 'imperial' : 'metric';
    cb.onClaimsEdited?.(); // persist the preference
    repaint();
  });
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  return {
    pickHex(cb2) {
      pickPending = cb2;
      hexInfo.hidden = false;
      hexInfo.innerHTML = '<b>📍 Tap a hex</b> to place this page on the map';
    },
    destroy() { cancelAnimationFrame(spinRaf); globeMode = false; ro.disconnect(); host.innerHTML = ''; },
    refresh() { repaint(); },
    focusEntity(id: string) {
      dropGlobe();
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
      dropGlobe();
      view.x = cx; view.y = cy;
      const fit = W > 0 ? W / cfg.circumFt : 6e-6;
      view.ppf = Math.min(0.09, Math.max(fit, (W * 0.7) / Math.max(spanFt, 1000)));
      clampY(); repaint();
    },
  };
}
