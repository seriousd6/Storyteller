// The world map widget (M1): hex terrain viewer mounted INSIDE /world/
// beside the tree (tree↔map merge, PLAN §6.1). Renders the plane's ghost
// terrain from terrain.ts (x-periodic — panning wraps seamlessly), entity
// anchors, kingdom claim outlines, a legend, and lets the user select
// entities or add new ones from a hex ("+ Add here").

import {
  biomeAt, coastDistAt, detailAt, driftedXY, elevationAt, octFor,
  EARTH_CIRCUM_FT, EARTH_HEIGHT_FT, type TerrainCfg, type BiomeId, type Landform,
} from './terrain.ts';
import { h32, ghostId } from './seeds.ts';
import { ghostSettlementAt, ghostFeatureAt, type GhostSettlement, type GhostFeature } from './density.ts';
import { resourceAt, resourceClass, type Resource } from './resources.ts';
import { planTravel, planCustom, type TravelPlan } from './travel.ts';
import {
  SQ3, hexR as hexRFt, hexCenter as hexCenterFt, pointToHex as pointToHexFt, colorClaims,
} from './hexgrid.ts';
import { buildRiverField } from './riverField.ts';
import { buildRoadField, ROAD_REAL_FT, roadAtlasWidth, roadLineWidth } from './roadField.ts';
import { windAt } from './windField.ts';
import { currentAt } from './currentField.ts';
import { boatLegSpeed } from './sailing.ts';
import REGISTRY from './registry.json';
import type { EntityRecord, WorldDoc } from '../engine/worldStore.ts';

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
  party?: { x: number; y: number };
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
  /** The party marches: advance the world clock this many days. */
  onAdvanceDays?(days: number): void;
  onAddHere(x: number, y: number, hexLabel: string, biome: BiomeId): void;
  /** Write an unwritten settlement or feature into the world (density
   *  ghost layer). Settlements carry `cls`; features carry `kind`. */
  onMaterializeGhost(g: (GhostSettlement | GhostFeature) & { gid: string }): void;
  /** Site-capable pins offer 🏰 Enter on the peek card (nested-spaces
   *  epic): canEnter gates the button, onEnterSite descends. */
  canEnter?(entityId: string): boolean;
  onEnterSite?(entityId: string): void;
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
export const BIOME_COLORS: Record<BiomeId, [number, number, number]> = {
  deep: [29, 47, 71], water: [52, 84, 118], beach: [201, 185, 138],
  snow: [223, 228, 232], tundra: [168, 176, 162], taiga: [74, 107, 82],
  desert: [211, 176, 120], savanna: [179, 163, 95], grass: [125, 155, 90],
  forest: [79, 122, 69], jungle: [58, 107, 61], hills: [138, 132, 104], mountain: [122, 115, 104],
};
const LANDSET = new Set<BiomeId>(['beach', 'snow', 'tundra', 'taiga', 'desert', 'savanna', 'grass', 'forest', 'jungle', 'hills', 'mountain']);
// classes whose shared edges the V13 dither may soften: land minus beach (the
// strand hugs the stroked coast, which stays crisp)
const DITHERABLE = new Set<BiomeId>(['snow', 'tundra', 'taiga', 'desert', 'savanna', 'grass', 'forest', 'jungle', 'hills', 'mountain']);
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
    climateModel: (t as { climateModel?: 'noise' | 'earthlike' }).climateModel,
  };

  host.innerHTML = `
    <div class="mv-wrap">
      <canvas class="mv-canvas"></canvas>
      <div class="mv-legend">
        <div class="mv-ltitle">Legend<button type="button" class="mv-legmin" title="Minimize the legend">–</button></div>
        <div class="mv-legbody">
        <div class="mv-shead" data-sec="biomes">Terrain <span>▸</span><button type="button" class="mv-terrbtn" title="Paint terrain overrides">🖌</button></div>
        <div class="mv-biomes" hidden></div>
        <div class="mv-shead" data-sec="claims">Realms <span class="mv-claimcount"></span> <span>▾</span></div>
        <div class="mv-claims"></div>
        <div class="mv-shead" data-sec="layers">Layers <span>▾</span></div>
        <div class="mv-layers">
          <label class="mv-toggle"><input type="checkbox" class="mv-showpins" checked> pins</label>
          <label class="mv-toggle" title="Realm washes, borders and names"><input type="checkbox" class="mv-showrealms" checked> 👑 realms</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showroads" checked> roads</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showrivers" checked> rivers</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showlabels" checked> labels</label>
          <label class="mv-toggle"><input type="checkbox" class="mv-showart" checked> terrain art</label>
          <label class="mv-toggle" title="Standing portals between 500k+ metropolises"><input type="checkbox" class="mv-showportals" checked> ⚡ portals</label>
          <label class="mv-toggle" title="The unwritten hamlets and lairs waiting to be filled in"><input type="checkbox" class="mv-showghosts" checked> ghosts</label>
          <label class="mv-toggle" title="Tint the map by elevation — a hypsometric relief overlay"><input type="checkbox" class="mv-showrelief"> ⛰ relief</label>
          <label class="mv-toggle" title="Strategic and luxury resources the land carries"><input type="checkbox" class="mv-showres"> ⛏ resources</label>
          <label class="mv-toggle" title="Prevailing winds everywhere and ocean currents on the sea — what a sail rides"><input type="checkbox" class="mv-showwind"> 🌬 winds</label>
        </div>
        <div class="mv-shead" data-sec="mapkey">Map key <span>▾</span></div>
        <div class="mv-mapkey">
          <span class="mv-key" title="Roads: highways, roads and dirt tracks reveal as you close in"><i class="mv-ln" style="background:#6a523a"></i>road</span>
          <span class="mv-key" title="Rivers and streams — great rivers show from the continental view"><i class="mv-ln" style="background:#426a94"></i>river</span>
          <span class="mv-key" title="A standing portal between great cities">⚡ portal</span>
          <span class="mv-key" title="An unwritten settlement waiting to be filled in — tap to write it in"><i class="mv-box" style="border-color:#f4efdf"></i>unwritten</span>
          <span class="mv-key" title="Settled once, then emptied by a nearby lair — clear it and they return"><i class="mv-box" style="border-color:#cd786c"></i>abandoned ✗</span>
          <span class="mv-key" title="Strategic goods — iron, timber, stone, war-horses, salt"><i class="mv-ring" style="border-color:#96c478"></i>strategic</span>
          <span class="mv-key" title="Luxury goods — gems, spice, furs, dyes, pearls"><i class="mv-ring" style="border-color:#d696e8"></i>luxury</span>
          <span class="mv-key" title="Both strategic and a luxury — coin metals, salt, war-horses"><i class="mv-ring" style="border-color:#e0be6e"></i>both</span>
          <span class="mv-key" title="Prevailing wind over land"><i class="mv-ln" style="background:#e8e3d2"></i>wind</span>
          <span class="mv-key" title="Ocean current at sea"><i class="mv-ln" style="background:#6cc4ec"></i>current</span>
          <span class="mv-key" title="Settlements draw their true footprint as you zoom in">🏰 city · 🏘️ town · 🛖 village</span>
          <span class="mv-key" title="A dungeon, lair or cave entrance out in the wilds">☠️ dungeon · 🐾 lair · 🕳️ cave</span>
        </div>
        <div class="mv-elevkey" title="Terrain brightness reads elevation — dark lowlands up to bright peaks">Elevation <i></i><span>sea · lowland · highland · peak</span></div>
        <div class="mv-tools"><button type="button" class="mv-globe" title="See the world as a globe">🌐 globe</button>
        <button type="button" class="mv-travel" title="Measure travel time between two points">🥾</button>
        <button type="button" class="mv-party" title="Move the party marker — teleportation moves it anywhere">🚩</button>
        <button type="button" class="mv-spinbtn" title="Pause or resume the spin" hidden>⏸ spin</button>
        <button type="button" class="mv-snap" title="Level back to the equator" hidden>⊙ equator</button>
        <button type="button" class="mv-export" title="Save this view as an image">📷</button></div>
        <div class="mv-scale"></div>
        </div>
      </div>
      <div class="mv-hexinfo" hidden></div>
      <div class="mv-card" hidden></div>
    </div>`;
  const canvas = host.querySelector<HTMLCanvasElement>('.mv-canvas')!;
  // `ctx` is reassigned for one job only: the terrain layer is rendered into an
  // offscreen buffer (see renderTerrainBuffer) by briefly pointing `ctx` at it,
  // so drawTier and its helpers need no changes. Every swap is synchronous and
  // restored in the same tick.
  let ctx = canvas.getContext('2d')!;
  const legendBiomes = host.querySelector<HTMLElement>('.mv-biomes')!;
  const legendClaims = host.querySelector<HTMLElement>('.mv-claims')!;
  const scaleEl = host.querySelector<HTMLElement>('.mv-scale')!;
  const hexInfo = host.querySelector<HTMLElement>('.mv-hexinfo')!;
  const card = host.querySelector<HTMLElement>('.mv-card')!;
  const showPins = host.querySelector<HTMLInputElement>('.mv-showpins')!;
  const showRealms = host.querySelector<HTMLInputElement>('.mv-showrealms')!;
  const showRoads = host.querySelector<HTMLInputElement>('.mv-showroads')!;
  const showRivers = host.querySelector<HTMLInputElement>('.mv-showrivers')!;
  const showLabels = host.querySelector<HTMLInputElement>('.mv-showlabels')!;
  const showArt = host.querySelector<HTMLInputElement>('.mv-showart')!;
  const showPortals = host.querySelector<HTMLInputElement>('.mv-showportals')!;
  const showGhosts = host.querySelector<HTMLInputElement>('.mv-showghosts')!;
  const showRelief = host.querySelector<HTMLInputElement>('.mv-showrelief')!;
  const showRes = host.querySelector<HTMLInputElement>('.mv-showres')!;
  const showWind = host.querySelector<HTMLInputElement>('.mv-showwind')!;
  const escT = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const globeBtn = host.querySelector<HTMLButtonElement>('.mv-globe')!;
  const travelBtn = host.querySelector<HTMLButtonElement>('.mv-travel')!;
  const partyBtn = host.querySelector<HTMLButtonElement>('.mv-party')!;
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
  const claimColor = colorClaims(
    Object.fromEntries(claimOwners.map((id) => [id, plane.claims![id]!])),
    CLAIM_COLORS, cfg.circumFt,
  ).colors;
  // the legend is a CONTROL PANEL (owner, batch 23): click an owner to hide
  // that realm's wash, border, and label — compare any subset of claims
  const hiddenClaims = new Set<string>();
  legendClaims.innerHTML = claimOwners
    .map((id) => `<span class="mv-key mv-clickable" data-owner="${id}" title="${escT(world.entities[id]!.name)} — click to show/hide"><i style="border:2px solid ${claimColor.get(id)}; background:none"></i><span class="mv-cname">${escT(world.entities[id]!.name)}</span><button type="button" class="mv-paintbtn" data-paint="${id}" title="Paint this realm's borders">✏️</button></span>`)
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
    // ppf is written as toExponential — for ppf ≥ 1 that's "8.000e+0", so the
    // exponent class must allow '+' and the clamp must match the real zoom
    // ceiling (8, the wheel handler's max), or deep-zoom share links reopen
    // at the default camera instead of where they were saved.
    // The hash carries the WORLD it was written for (",@id" — audit V20): the
    // camera of world A must not frame world B, or creating/switching worlds in
    // one session opens the new map over the old world's ocean. An id-less
    // hash (older share links, the e2e helpers) is trusted as-is.
    const m = /^#map=(-?[\d.]+),(-?[\d.]+),([\d.eE+-]+)(?:,@([\w-]+))?$/.exec(location.hash);
    if (m && (!m[4] || m[4] === world.id)) {
      view.x = Number(m[1]); view.y = Number(m[2]);
      view.ppf = Math.max(1e-6, Math.min(8, Number(m[3])) || view.ppf);
      fitPending = false;
    }
  }
  let hashTimer = 0;
  function writeViewHash(): void {
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      const h = `#map=${Math.round(view.x)},${Math.round(view.y)},${view.ppf.toExponential(3)},@${world.id}`;
      history.replaceState(null, '', h); // no history spam while panning
    }, 250);
  }
  let W = 0, H = 0, DPR = 1;
  let selected: { t: number; q: number; r: number } | null = null;

  // tier-indexed views onto the shared lattice (hexgrid.ts) — whoever mints a
  // claim address has to land on the same hex this highlights
  const hexR = (ti: number) => hexRFt(TIERS[ti]!.hexFt);
  const hexCenter = (ti: number, q: number, r: number): [number, number] =>
    hexCenterFt(TIERS[ti]!.hexFt, q, r);
  const pointToHex = (ti: number, x: number, y: number): [number, number] =>
    pointToHexFt(TIERS[ti]!.hexFt, x, y);
  const wrapDx = (dx: number): number => {
    dx = ((dx % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    return dx > cfg.circumFt / 2 ? dx - cfg.circumFt : dx;
  };
  const toScreen = (x: number, y: number): [number, number] =>
    [wrapDx(x - view.x) * view.ppf + W / 2, (y - view.y) * view.ppf + H / 2];
  /**
   * Split a world-space polyline into runs that are safe to stroke on screen.
   *
   * `toScreen` wraps EVERY POINT INDEPENDENTLY to the nearest half-world of the
   * view centre. So a line straddling the **antipode of the view centre** — two
   * points a few feet apart in the world — lands on OPPOSITE screen edges, and
   * strokes one straight line clean across the map. That is the horizontal
   * "artifact" ruled across the world at a river's latitude, and it shifts as
   * you pan because the antipode moves with the view (owner, item #13).
   *
   * Splitting on the WORLD-space jump (the old guard) can't see this: the world
   * delta is tiny. Split on the WRAPPED delta instead — that's what the screen
   * actually does. It also correctly KEEPS a line that crosses the data seam
   * (x ≈ circumFt → 0) joined, since those points are neighbours in the world
   * and the old guard was cutting a gap in them for no reason.
   */
  function screenRuns(pts: Array<[number, number]>): Array<Array<[number, number]>> {
    const runs: Array<Array<[number, number]>> = [];
    let run: Array<[number, number]> = [];
    let prev: number | null = null;
    for (const [x, y] of pts) {
      const wx = wrapDx(x - view.x);
      if (prev !== null && Math.abs(wx - prev) > cfg.circumFt / 2) { if (run.length > 1) runs.push(run); run = []; }
      run.push([wx * view.ppf + W / 2, (y - view.y) * view.ppf + H / 2]);
      prev = wx;
    }
    if (run.length > 1) runs.push(run);
    return runs;
  }
  const toWorld = (px: number, py: number): [number, number] => {
    let x = (px - W / 2) / view.ppf + view.x;
    x = ((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    return [x, (py - H / 2) / view.ppf + view.y];
  };
  // fade 4px→8px; the base switch happens at 8px where the fade hits exactly
  // 1, so zooming never pops (owner, batch 12: smooth between tiers)
  const tierAlpha = (ti: number) => Math.max(0, Math.min(1, (TIERS[ti]!.hexFt * view.ppf - 4) / 4));

  const cache = new Map<string, { b: BiomeId; e: number; d: number }>();
  // bumped whenever the terrain's APPEARANCE changes (a biome paint), so the
  // cached terrain buffer knows to re-render. Zoom, layer toggles, resize and
  // anchor-driven art marks are caught by the buffer signature separately.
  let terrainEpoch = 0;
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
    terrainEpoch++; // the painted biomes changed — the terrain buffer is stale
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
  // world-tier octave, for the cross-tier water constraint below
  const WORLD_HEXFT = (TIERS.find((t2) => t2.id === 'world') ?? TIERS[0]!).hexFt;
  const WORLD_OCT = octFor(WORLD_HEXFT);
  // A river that covers a whole hex makes that hex WATER (owner, batch 44 for
  // great rivers; batch 51 extends it to every navigable river). "Water covers
  // the hex" is width-dependent: a great river (~1 mi) and an ordinary river
  // (~900 ft) both drown a 500-ft locale hex, but nothing at coarser tiers —
  // so the check is gated by hexFt below. Each stored point carries its own
  // half-width, and the returned value is the river's real width so the caller
  // can require riverWidth ≥ hexFt (the river truly fills the hex). Checked
  // against a coarse spatial grid of polyline points so it stays cheap.
  // The field itself lives in riverField.ts — extracted so it could be TESTED;
  // it hid the vertices-are-not-a-line bug (item #23) as a closure for months.
  let riverFieldCache: ReturnType<typeof buildRiverField> | null = null;
  /** The real width (ft) of the widest river covering this point, or 0. */
  function riverWidthAt(x: number, y: number): number {
    if (!riverFieldCache) riverFieldCache = buildRiverField(plane.routes ?? [], cfg.circumFt);
    return riverFieldCache.widthAt(x, y);
  }
  // The road twin (roadField.ts). Like riverFieldCache this is never
  // invalidated, and doesn't need to be: it lives for the life of the mount,
  // and the one thing that rewrites plane.routes — regenerateRoads() in
  // world.astro — calls remountMap() when it lands, which builds a new closure
  // and a new cache with it.
  let roadFieldCache: ReturnType<typeof buildRoadField> | null = null;
  function roadFieldOf(): ReturnType<typeof buildRoadField> {
    if (!roadFieldCache) roadFieldCache = buildRoadField(plane.routes ?? [], cfg.circumFt);
    return roadFieldCache;
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
      let b = painted ?? biomeAt(cfg, cx, cy, oct, bias);
      const e = elevationAt(cfg, cx, cy, oct) + bias;
      // CROSS-TIER WATER CONSISTENCY (owner, batch 42): a world hex that reads
      // water must not shatter into an archipelago at finer tiers. Inside a
      // water parent, land is held to a higher bar — the deeper the parent,
      // the harder a child clears it — and any island that survives but sits
      // ALONE in open water (all six neighbours water) is dissolved back. Real
      // connected coastline stays; scattered specks do not.
      if (!painted && TIERS[ti]!.hexFt < WORLD_HEXFT && b !== 'deep' && b !== 'water') {
        const eParent = elevationAt(cfg, cx, cy, WORLD_OCT);
        if (eParent < 0.5) {
          const thr = 0.5 + (0.5 - eParent) * 3; // adaptive shoreline
          if (e < thr) b = 'water';
          else {
            // de-speckle: a lone island in open water is noise, not land
            let waterN = 0;
            for (const [dq, dr] of EDGE_DIRS) {
              const [nx, ny] = hexCenter(ti, q + dq!, r + dr!);
              const nb = biomeAt(cfg, nx, ny, oct);
              if (nb === 'deep' || nb === 'water' || elevationAt(cfg, nx, ny, WORLD_OCT) < 0.5) waterN++;
            }
            if (waterN >= 6) b = 'water';
          }
        }
      }
      // a river wide enough to cover this hex IS water here (batch 44/51):
      // where the river's real width meets or beats the hex span, the channel
      // fills the hex — a great river at the mile tier, any navigable river at
      // the locale tier. So a river reads as a continuous chain of water hexes
      // up close and never vanishes between the drawn ribbon's coarse points.
      if (!painted && b !== 'deep' && b !== 'water' && TIERS[ti]!.hexFt <= 5280) {
        if (riverWidthAt(cx, cy) >= TIERS[ti]!.hexFt * 0.85) b = 'water';
      }
      // THE STRAND (owner, item #6: "hexes that touch water, shore"). `beach`
      // existed only as a razor-thin elevation band (terrain.ts), which is why
      // the waterline had no shore to speak of: nothing anywhere checked a
      // NEIGHBOUR. Any land hex touching water — sea, lake, or a river wide
      // enough to fill its hex — now reads as shore.
      //
      // Fine tiers only: a real strand is a few hundred feet wide, so a one-hex
      // ring at 60-mile hexes would paint a sand border around every continent.
      // Snow and mountain keep their own coasts — an arctic shore is ice and a
      // drowned range is cliffs, not sand.
      if (!painted && TIERS[ti]!.hexFt <= 5280 && b !== 'deep' && b !== 'water' && b !== 'beach' && b !== 'snow' && b !== 'mountain') {
        const span = TIERS[ti]!.hexFt * 0.85;
        let shore = false;
        // a river bank first — riverWidthAt is a grid lookup, so this is cheap
        // enough to run anywhere, and an inland river still has banks
        for (const [dq, dr] of EDGE_DIRS) {
          const [nx, ny] = hexCenter(ti, q + dq!, r + dr!);
          if (riverWidthAt(nx, ny) >= span) { shore = true; break; }
        }
        // The sea costs 6 terrain samples, so reject continental interiors with
        // ONE lookup first. Measured across seven real coasts: coastDistAt reads
        // a median 0 at true shore hexes but up to 46mi (its field is ~35mi
        // cells), so 50mi keeps 100% of the shore while skipping the interior.
        // (An ELEVATION gate looks obvious here and is a trap: shore land sits
        // in a razor-thin 0.5545–0.5622 band, and so does every inland plain —
        // a 0.56 cut silently deleted 38% of the world's shore, all of Lisbon's.)
        if (!shore && coastDistAt(cfg, cx, cy) < 50 * 5280) {
          for (const [dq, dr] of EDGE_DIRS) {
            const [nx, ny] = hexCenter(ti, q + dq!, r + dr!);
            const nb = biomeAt(cfg, nx, ny, oct);
            if (nb === 'deep' || nb === 'water') { shore = true; break; }
          }
        }
        if (shore) b = 'beach';
      }
      v = { b, e, d };
      // Bound high enough that ONE buffer render fits: the 4–8px crossfade
      // band touches ~170k hexes, and the old 150k bound cleared MID-RENDER
      // there — every render at that band ran on a cold cache (deep-zoom
      // audit, 2026-07-18). renderTerrainBuffer sweeps between renders.
      if (cache.size > 300000) cache.clear();
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
    // high country reads as ROCK, not desert tan (audit V14 — the Alps looked
    // like Sahara outliers): hills and mountains cool toward grey as they
    // climb, before the snowline blend takes over above 0.8. The grey target
    // leans WARM (round-2 note): a neutral grey beside saturated greens reads
    // faintly lilac by simultaneous contrast — stone, not violet
    if (b === 'hills' || b === 'mountain') {
      const t2 = Math.max(0, Math.min(1, (e - 0.62) / 0.18)) * 0.7;
      r += (132 - r) * t2; g += (126 - g) * t2; bl += (114 - bl) * t2;
    }
    const f = 0.97 + (e - 0.5) * 0.85 + jitter;
    if (e > 0.8) {
      const t2 = Math.min(1, (e - 0.8) / 0.1);
      r += (223 - r) * t2; g += (228 - g) * t2; bl += (232 - bl) * t2;
    }
    return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, bl * f) | 0})`;
  };
  // hex-corner unit vectors, precomputed: corner() runs 12 trig calls per
  // hex × up to ~170k hexes per buffer render in the fine-grain band — a
  // 7-entry table (index 6 wraps to the same angle as 0) makes it free
  const CORNER_COS: number[] = [], CORNER_SIN: number[] = [];
  for (let k = 0; k < 7; k++) {
    const a = Math.PI / 180 * (60 * k - 30);
    CORNER_COS.push(Math.cos(a)); CORNER_SIN.push(Math.sin(a));
  }
  const corner = (sx: number, sy: number, Rpx: number, k: number): [number, number] =>
    [sx + Rpx * CORNER_COS[k]!, sy + Rpx * CORNER_SIN[k]!];
  // hypsometric tint for the relief overlay (batch 47): a classic elevation
  // ramp — deep blue → blue → green → tan → brown → white
  const RELIEF: Array<[number, [number, number, number]]> = [
    [0.44, [30, 58, 92]], [0.5, [70, 120, 165]], [0.52, [90, 150, 110]],
    [0.58, [140, 175, 95]], [0.66, [196, 176, 110]], [0.74, [150, 116, 82]],
    [0.82, [180, 165, 150]], [0.9, [244, 244, 240]],
  ];
  function reliefColor(e: number): string {
    let lo = RELIEF[0]!, hi = RELIEF[RELIEF.length - 1]!;
    for (let i = 1; i < RELIEF.length; i++) { if (e <= RELIEF[i]![0]) { hi = RELIEF[i]!; lo = RELIEF[i - 1]!; break; } }
    const t2 = Math.max(0, Math.min(1, (e - lo[0]) / Math.max(1e-6, hi[0] - lo[0])));
    const c = [0, 1, 2].map((j) => Math.round(lo[1][j as 0] + (hi[1][j as 0] - lo[1][j as 0]) * t2));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const EDGE_DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;

  function drawTier(ti: number, alpha: number): void {
    const reliefOn = showRelief.checked; // hypsometric elevation overlay (batch 47)
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
        ctx.fillStyle = reliefOn ? reliefColor(e) : shade(b, e, jitter);
        if (hexPx < 10) {
          // sub-10px hexes read as texture, not shapes — a rect is
          // indistinguishable and skips the 6-corner path (the fine-grain
          // crossfade band fills ~170k of these per buffer render; the
          // claims wash has used this exact cutoff since batch 10)
          const hw = Rpx * SQ3;
          ctx.fillRect(sx - hw / 2, sy - Rpx * 0.75, hw + 0.5, Rpx * 1.5 + 0.5);
        } else {
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const [ax, ay] = corner(sx, sy, Rpx + 0.6, k);
            k ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay);
          }
          ctx.closePath();
          ctx.fill();
          if (showGrid) { ctx.strokeStyle = 'rgba(10,14,20,0.2)'; ctx.lineWidth = 1; ctx.stroke(); }
        }
        // BIOME-EDGE DITHER (audit V13): a class boundary drawn at hex grain is
        // a 60° staircase — the Alps stepped from tan to grey in 20px blocks,
        // polar bands in 40px ones. Where a LAND hex meets a different LAND
        // class and the hex is big enough on screen to show it, ask the FIELD
        // (a quarter-hex octave) at points along the shared edge: wherever it
        // answers "the neighbour's class reaches in here", fill a small wedge
        // of the neighbour's shade. The neighbour does the mirror image from
        // its side, so the straight edge becomes the field's own meander.
        // Water/beach edges keep their crisp stroked coast. Costs a handful of
        // samples per BOUNDARY hex, inside the cached terrain buffer — and
        // nothing at all below 14px, where the continental pan budget lives.
        // (After the grid stroke on purpose: stroke() re-uses the hex path,
        // and the dither wedges begin paths of their own.)
        if (!reliefOn && hexPx >= 14 && DITHERABLE.has(b) && paintedBiomeAt(cx, cy) === null) {
          const oct2 = octFor(TIERS[ti]!.hexFt / 4);
          const bias = (d - 0.5) * 0.03;
          const N = hexPx >= 44 ? 3 : 2;
          for (let k = 0; k < 6; k++) {
            const nb = hexInfoAt(ti, q + EDGE_DIRS[k]![0], r + EDGE_DIRS[k]![1]).b;
            if (nb === b || !DITHERABLE.has(nb)) continue;
            const a0 = Math.PI / 180 * (60 * k - 30), a1 = Math.PI / 180 * (60 * (k + 1) - 30);
            const c0x = cx + R * Math.cos(a0), c0y = cy + R * Math.sin(a0);
            const c1x = cx + R * Math.cos(a1), c1y = cy + R * Math.sin(a1);
            ctx.fillStyle = shade(nb, e, jitter);
            for (let s = 0; s < N; s++) {
              const t0 = s / N, t1 = (s + 1) / N, tm = (t0 + t1) / 2;
              // sample a third of the way in from this edge segment's midpoint
              const ex = c0x + (c1x - c0x) * tm, ey = c0y + (c1y - c0y) * tm;
              const px2 = ex + (cx - ex) * 0.33, py2 = ey + (cy - ey) * 0.33;
              if (biomeAt(cfg, px2, py2, oct2, bias) !== nb) continue;
              const [s0x, s0y] = toScreen(c0x + (c1x - c0x) * t0, c0y + (c1y - c0y) * t0);
              const [s1x, s1y] = toScreen(c0x + (c1x - c0x) * t1, c0y + (c1y - c0y) * t1);
              const [sax, say] = toScreen(ex + (cx - ex) * 0.45, ey + (cy - ey) * 0.45);
              ctx.beginPath(); ctx.moveTo(s0x, s0y); ctx.lineTo(s1x, s1y); ctx.lineTo(sax, say); ctx.closePath();
              ctx.fill();
            }
          }
        }
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
        if (showGlyphs) {
          // settled-country marks live at region grain; locale hexes wear
          // their parent region hex's mark (fields keep reading as fields).
          // Fields and roofs TILE; a ruin is ONE structure, drawn once at
          // region size no matter which tier is doing the drawing.
          let mark: ArtMark | undefined;
          const tid = TIERS[ti]!.id;
          // Nothing built stands in the surf. Batch 91 guarded the farm marks
          // and batch 95 the city sprawl RING — but a city's own seat hex and
          // every ruin slipped past both, which is the sprawl still showing on
          // water. Resolve wetness once, up front, and let no mark survive it:
          // `b` is always the biome of the hex the mark actually draws on.
          const wet = b === 'water' || b === 'deep';
          if (tid === 'region') {
            mark = wet ? undefined : artMarksNow().get(q + ',' + r);
            if (mark === 'ruin') { drawRuin(sx, sy, hexPx, q + ',' + r); mark = undefined; }
          } else if (ti > REGION_ART_TI) {
            const xn = ((cx % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
            const [pq, pr] = pointToHex(REGION_ART_TI, xn, cy);
            mark = wet ? undefined : artMarksNow().get(pq + ',' + pr);
            if (mark === 'ruin') {
              const [rcx, rcy] = hexCenter(REGION_ART_TI, pq, pr);
              // only the fine hex holding the region center draws it
              if (Math.hypot(cx - rcx, cy - rcy) <= TIERS[ti]!.hexFt * 0.55) {
                const [rsx, rsy] = toScreen(rcx, rcy);
                drawRuin(rsx, rsy, TIERS[REGION_ART_TI]!.hexFt * view.ppf, pq + ',' + pr);
              }
              mark = undefined; // the country around the walls stays wild
            }
          }
          drawGlyphs(ti, q, r, b, sx, sy, hexPx, mark);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  const hash3ish = (q: number, r: number, s: number): number => h32(q + ',' + r + ',' + s, 77) / 4294967295;

  // ---------- settled-country art marks (owner, batch 40) ----------
  // The land remembers its people: farmland rings every settlement (its
  // foodshed made visible), city hexes read as rooftops, ruins as broken
  // walls. Keyed by REGION hex; rebuilt when anchors change.
  const REGION_ART_TI = TIERS.findIndex((t2) => t2.id === 'region');
  // Beach is the strand, not farmland (removed batch 91 — it hugs the waterline
  // and read as "wheat in the surf"). Jungle joins the set for rice paddies.
  const FARMABLE = new Set(['grass', 'savanna', 'forest', 'hills', 'jungle']);
  // Farmland comes in biome-specific kinds, the way real country does (owner,
  // batch 51 → 91): RICE paddies in the wet tropics and river valleys, wheat
  // CROPLAND on the temperate tilled biomes, cattle PASTURE on the open plains,
  // hill TERRACES and SHEEP walks in the highlands. Chosen from the hex's own
  // biome and its neighbours, so the settled country reads as a patchwork.
  type ArtMark = 'city' | 'ruin' | 'farm' | 'pasture' | 'sheep' | 'rice' | 'terrace';
  const ART_RANK: Record<ArtMark, number> = { city: 4, ruin: 3, farm: 1, pasture: 1, sheep: 1, rice: 1, terrace: 1 };
  // is any neighbour open water or a lake? (rice wants the water's edge)
  function bordersWater(q2: number, r2: number): boolean {
    for (const [dq, dr] of EDGE_DIRS) {
      const nb = hexInfoAt(REGION_ART_TI, q2 + dq!, r2 + dr!).b;
      if (nb === 'water' || nb === 'deep') return true;
    }
    return false;
  }
  function farmKind(q2: number, r2: number, b2: string): ArtMark {
    // wet tropics → rice paddies (jungle, and warm river-valley grass at a
    // water's edge). Real rice country: the Ganges, the Mekong, the Yangtze.
    if (b2 === 'jungle') return 'rice';
    if (b2 === 'hills') {
      // sheep on the hill pastures that border the grass; else terraced fields
      for (const [dq, dr] of EDGE_DIRS) {
        if (hexInfoAt(REGION_ART_TI, q2 + dq!, r2 + dr!).b === 'grass') return 'sheep';
      }
      return 'terrace';
    }
    if (b2 === 'grass' || b2 === 'savanna') {
      // a river/lake valley on the warm plains grows paddy rice; otherwise the
      // open range is cattle country and the rest is under the plough
      if (b2 === 'grass' && bordersWater(q2, r2) && hash3ish(q2, r2, 19) < 0.5) return 'rice';
      return hash3ish(q2, r2, 12) < 0.42 ? 'pasture' : 'farm';
    }
    return 'farm';
  }
  let artMarks: Map<string, ArtMark> | null = null;
  let artMarksSig = '';
  function artMarksNow(): Map<string, ArtMark> {
    // keyed on anchor count AND terrainEpoch: painting a desert to grass
    // changes what is farmable without changing the anchor count, and the
    // marks were computed against the OLD biome
    const sig = `${(plane.anchors ?? []).length}|${terrainEpoch}`;
    if (artMarks && artMarksSig === sig) return artMarks;
    artMarksSig = sig;
    artMarks = new Map();
    const put = (k: string, m: ArtMark): void => {
      const cur = artMarks!.get(k);
      if (!cur || ART_RANK[m] > ART_RANK[cur]) artMarks!.set(k, m);
    };
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!ent || ent.deleted) continue;
      const xn = ((a.x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
      const [q, r] = pointToHex(REGION_ART_TI, xn, a.y);
      if (ent.kind === 'landmark' && a.icon === 'ruin') { put(q + ',' + r, 'ruin'); continue; }
      if (ent.kind !== 'settlement') continue;
      const pop = Number((ent.fields ?? {}).population ?? 0);
      if (pop >= 25_000) put(q + ',' + r, 'city');
      // The URBAN FOOTPRINT sprawls with real population (batch 94): a
      // metropolis of millions is not one rooftop hex but a spread of them.
      // A region hex is ~6 mi across (~80 km²); a 10M+ metro really does cover
      // dozens. Rooftops fill the inner rings; cleared farmland rings beyond.
      const cityRad = pop >= 10_000_000 ? 3 : pop >= 3_000_000 ? 2 : pop >= 700_000 ? 1 : 0;
      // the foodshed made visible: bigger places clear more country, always at
      // least one ring past the built-up area
      const rad = Math.max(cityRad + 1, pop >= 500_000 ? 3 : pop >= 25_000 ? 2 : pop >= 800 ? 1 : 0);
      if (pop < 300) continue;
      for (let dq2 = -rad; dq2 <= rad; dq2++) {
        for (let dr2 = Math.max(-rad, -dq2 - rad); dr2 <= Math.min(rad, -dq2 + rad); dr2++) {
          if (dq2 === 0 && dr2 === 0) continue; // the seat hex already set
          const q2 = q + dq2, r2 = r + dr2;
          const hexDist = (Math.abs(dq2) + Math.abs(dr2) + Math.abs(dq2 + dr2)) / 2;
          const b2 = hexInfoAt(REGION_ART_TI, q2, r2).b;
          // built-up hexes read as rooftops on any land; farmland beyond.
          // The outermost built ring FRAYS into the foodshed (audit V15): a
          // metropolis dissolves through fields, it does not end at a hard
          // wall of roofs with wildwood beyond — for a 10M metro the pure
          // farm ring sits 24mi out, past every city-zoom frame, so without
          // this the fields exist and are never seen next to the city.
          if (hexDist <= cityRad) {
            if (b2 !== 'water' && b2 !== 'deep') {
              const frays = hexDist === cityRad && FARMABLE.has(b2) && hash3ish(q2, r2, 23) < 0.45;
              put(q2 + ',' + r2, frays ? farmKind(q2, r2, b2) : 'city');
            }
          }
          else if (FARMABLE.has(b2)) put(q2 + ',' + r2, farmKind(q2, r2, b2));
        }
      }
    }
    return artMarks;
  }

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
  /** One ruin per marked region hex: a broken wall, a fallen corner, rubble
   *  at its feet — set off center so the pin disc doesn't sit on it. */
  function drawRuin(sx: number, sy: number, hexPxRaw: number, seedKey: string): void {
    const rng = mulberry(h32('ruin:' + seedKey, 91));
    const hexPx = Math.min(Math.max(hexPxRaw, 26), 120);
    const gs = hexPx * 0.2;
    const x = sx - hexPx * 0.2, y = sy + hexPx * 0.18;
    ctx.strokeStyle = 'rgba(128,120,106,0.9)';
    ctx.lineWidth = Math.max(1.2, hexPx * 0.03);
    ctx.beginPath();
    ctx.moveTo(x - gs, y + gs * 0.4); ctx.lineTo(x - gs, y - gs * 0.7);
    ctx.lineTo(x + gs * 0.2, y - gs * 0.7); // the far corner fell long ago
    ctx.moveTo(x + gs, y - gs * 0.2); ctx.lineTo(x + gs, y + gs * 0.4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(128,120,106,0.75)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x + (rng() - 0.3) * gs * 1.5, y + gs * (0.45 + rng() * 0.35), Math.max(1, hexPx * 0.02), 0, 7);
      ctx.fill();
    }
  }
  function drawGlyphs(ti: number, q: number, r: number, b: BiomeId, sx: number, sy: number, hexPxRaw: number, mark?: ArtMark): void {
    const rng = mulberry(h32(ti + ':' + q + ',' + r, 91));
    // floor the glyph basis: on the 8-tier ladder base hexes run small, and
    // 2px pines are specks — glyphs overlap neighboring hexes instead, which
    // is exactly how the alpha's dense forest texture read
    const hexPx = Math.min(Math.max(hexPxRaw, 24), 90);
    // SPACE VIEW (owner, batch 24): the art never cuts out — tiny hexes get
    // one mark each, and a forest reads as a dense mass of tiny pines
    const tiny = hexPxRaw < 14;
    const jx = () => (rng() - 0.5) * hexPxRaw * 0.66, jy = () => (rng() - 0.5) * hexPxRaw * 0.55;
    if (mark === 'farm') {
      // tilled country: a golden wheat wash under short parallel furrows, each
      // patch ploughed on its own bearing (owner batch 51 — a stronger wash so
      // the fields read at region zoom, not only close up)
      ctx.fillStyle = 'rgba(204,178,92,0.32)';
      ctx.beginPath(); ctx.arc(sx, sy, hexPxRaw * 0.54, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(104,84,34,0.85)';
      ctx.lineWidth = Math.max(1, hexPx * 0.036);
      for (let i = 0; i < (tiny ? 1 : 3); i++) {
        const x = sx + jx() * 0.8, y = sy + jy() * 0.8;
        const ang = rng() * Math.PI, gs = hexPx * 0.19;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        const px2 = -uy, py2 = ux; // furrow spacing runs across the bearing
        for (let f = -1; f <= 1; f++) {
          const ox = x + px2 * f * gs * 0.45, oy = y + py2 * f * gs * 0.45;
          ctx.beginPath();
          ctx.moveTo(ox - ux * gs, oy - uy * gs);
          ctx.lineTo(ox + ux * gs, oy + uy * gs);
          ctx.stroke();
        }
      }
      return;
    }
    if (mark === 'pasture') {
      // cattle country on the plains: a soft green wash, a rail fence, and a
      // few dark grazing beasts (owner batch 51)
      ctx.fillStyle = 'rgba(120,150,74,0.28)';
      ctx.beginPath(); ctx.arc(sx, sy, hexPxRaw * 0.54, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(96,74,44,0.7)'; ctx.lineWidth = Math.max(1, hexPx * 0.03);
      const fg = hexPx * 0.34, fy = sy + jy() * 0.5;
      ctx.beginPath(); ctx.moveTo(sx - fg, fy); ctx.lineTo(sx + fg, fy); ctx.stroke(); // rail
      ctx.fillStyle = 'rgba(60,44,32,0.85)';
      for (let i = 0; i < (tiny ? 1 : 3); i++) {
        const x = sx + jx() * 0.9, y = sy + jy() * 0.9, cs = hexPx * 0.05;
        ctx.beginPath(); ctx.ellipse(x, y, cs * 1.6, cs, 0, 0, 7); ctx.fill(); // a beast
      }
      return;
    }
    if (mark === 'sheep') {
      // sheep walks where the hills meet the grass: a pale wash and a scatter
      // of little cream fleeces (owner batch 51)
      ctx.fillStyle = 'rgba(150,166,120,0.26)';
      ctx.beginPath(); ctx.arc(sx, sy, hexPxRaw * 0.54, 0, 7); ctx.fill();
      for (let i = 0; i < (tiny ? 2 : 5); i++) {
        const x = sx + jx(), y = sy + jy(), ss = hexPx * 0.045;
        ctx.fillStyle = 'rgba(232,228,214,0.9)';
        ctx.beginPath(); ctx.arc(x, y, ss, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(60,52,44,0.85)';
        ctx.beginPath(); ctx.arc(x + ss * 0.9, y - ss * 0.2, ss * 0.4, 0, 7); ctx.fill(); // head
      }
      return;
    }
    if (mark === 'rice') {
      // flooded paddies: a bright water-green wash with curved bunds catching
      // the light — the terraced wet fields of the tropics and river valleys
      ctx.fillStyle = 'rgba(126,176,120,0.34)';
      ctx.beginPath(); ctx.arc(sx, sy, hexPxRaw * 0.54, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(150,196,180,0.8)';
      ctx.lineWidth = Math.max(1, hexPx * 0.03);
      const rg = hexPx * 0.42;
      for (let i = 0; i < (tiny ? 1 : 3); i++) {
        const oy = sy + (i - 1) * hexPx * 0.16 + jy() * 0.3;
        ctx.beginPath();
        ctx.moveTo(sx - rg, oy);
        ctx.quadraticCurveTo(sx, oy + hexPx * 0.09, sx + rg, oy); // a curved terrace bund
        ctx.stroke();
      }
      return;
    }
    if (mark === 'terrace') {
      // stepped hill terraces: dry stone risers stacked up the slope
      ctx.fillStyle = 'rgba(174,158,96,0.26)';
      ctx.beginPath(); ctx.arc(sx, sy, hexPxRaw * 0.54, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(120,98,52,0.75)';
      ctx.lineWidth = Math.max(1, hexPx * 0.032);
      const tg = hexPx * 0.4;
      for (let i = 0; i < (tiny ? 2 : 4); i++) {
        const oy = sy + (i - 1.5) * hexPx * 0.14;
        ctx.beginPath();
        ctx.moveTo(sx - tg, oy + hexPx * 0.03);
        ctx.lineTo(sx + tg, oy - hexPx * 0.03); // a gently tilted riser
        ctx.stroke();
      }
      return;
    }
    if (mark === 'city') {
      // cleared ground first (audit V15): a built hex kept its raw biome FILL,
      // so a metropolis in the woods read as forest with specks of roof right
      // up to the walls. The settled wash — cleared earth, same idiom as the
      // farm washes — makes built-up country read as ground people actually
      // stripped and packed, at every tier that inherits the mark.
      // near-opaque (was 0.3): a built hex is cleared EARTH, not tinted grass,
      // so the biome never shows through the town (owner: every town tile its
      // own texture). Baked into the terrain buffer, so this costs nothing/frame.
      ctx.fillStyle = 'rgba(188,170,116,0.82)';
      ctx.beginPath(); ctx.arc(sx, sy, hexPxRaw * 0.56, 0, 7); ctx.fill();
      // rooftops: a huddle of little gabled blocks
      const gs = hexPx * 0.11;
      for (let i = 0; i < (tiny ? 2 : 4); i++) {
        const x = sx + jx() * 0.7, y = sy + jy() * 0.7;
        const w2 = gs * (0.9 + rng() * 0.5), h2 = gs * (0.7 + rng() * 0.4);
        ctx.fillStyle = 'rgba(74,62,50,0.8)';
        ctx.fillRect(x - w2 / 2, y - h2 / 2, w2, h2);
        ctx.strokeStyle = 'rgba(24,18,12,0.7)';
        ctx.lineWidth = Math.max(0.8, hexPx * 0.018);
        ctx.beginPath(); ctx.moveTo(x - w2 / 2, y); ctx.lineTo(x + w2 / 2, y); ctx.stroke(); // roof ridge
      }
      return;
    }
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
  interface ClaimSet {
    owner: string; color: string; ti: number;
    hexes: Array<[number, number]>;
    set: Set<string>;
    /** Frontier hexes only, as [q, r, edgeMask] — bit k set means edge k faces
     *  someone else. Precomputed: see rebuildClaims. */
    border: Array<[number, number, number]>;
    /** The same frontier as ordered, Chaikin-smoothed world-space polylines
     *  (audit V7): borders stroke as coastlines, not 60-mile staircases. */
    loops: Array<Array<[number, number]>>;
    /** World-space vertical extent, for culling a realm that's off-screen. */
    y0: number; y1: number;
  }
  const claimSets: ClaimSet[] = [];
  let claimsEpoch = 0; // bumped by rebuildClaims — keys the claims buffer
  const worldCorner = (cx: number, cy: number, R: number, k: number): [number, number] => {
    const a = Math.PI / 180 * (60 * k - 30);
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  /** Chain the frontier edge soup (corner k → k+1 per hex, consistent winding)
   *  into ordered polylines, then cut every corner once (Chaikin ¼) so the
   *  staircase reads as a drawn border at region zoom while staying true to
   *  the claimed hexes. Corners are keyed on a 64-ft grid to absorb float
   *  noise; a chain that reaches the world seam simply breaks there (the two
   *  halves draw as separate runs). Built once per rebuild, not per frame. */
  function borderLoops(ti: number, border: Array<[number, number, number]>): Array<Array<[number, number]>> {
    const R = hexR(ti);
    const key = (x: number, y: number) => Math.round(x / 64) + ',' + Math.round(y / 64);
    interface BEdge { a: [number, number]; b: [number, number]; used?: boolean }
    const edges: BEdge[] = [];
    const byStart = new Map<string, BEdge[]>();
    for (const [q, r, mask] of border) {
      const [cx, cy] = hexCenter(ti, q, r);
      for (let k = 0; k < 6; k++) {
        if (!(mask & (1 << k))) continue;
        const e: BEdge = { a: worldCorner(cx, cy, R, k), b: worldCorner(cx, cy, R, k + 1) };
        edges.push(e);
        const s = key(e.a[0], e.a[1]);
        const lst = byStart.get(s);
        if (lst) lst.push(e); else byStart.set(s, [e]);
      }
    }
    const loops: Array<Array<[number, number]>> = [];
    for (const e0 of edges) {
      if (e0.used) continue;
      e0.used = true;
      const home = key(e0.a[0], e0.a[1]);
      const pts: Array<[number, number]> = [e0.a, e0.b];
      let closed = false;
      for (let guard = 0; guard < edges.length; guard++) {
        const tail = pts[pts.length - 1]!;
        const nx = byStart.get(key(tail[0], tail[1]))?.find((e) => !e.used);
        if (!nx) break;
        nx.used = true;
        if (key(nx.b[0], nx.b[1]) === home) { closed = true; break; }
        pts.push(nx.b);
      }
      if (pts.length < 3) { loops.push(pts); continue; }
      const out: Array<[number, number]> = [];
      const n = pts.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const p = pts[i]!, q2 = pts[(i + 1) % n]!;
        out.push([p[0] * 0.75 + q2[0] * 0.25, p[1] * 0.75 + q2[1] * 0.25]);
        out.push([p[0] * 0.25 + q2[0] * 0.75, p[1] * 0.25 + q2[1] * 0.75]);
      }
      if (closed) out.push(out[0]!); // duplicate the seam point: the polyline closes itself
      else { out.unshift(pts[0]!); out.push(pts[n - 1]!); } // open chains keep their true ends
      loops.push(out);
    }
    return loops;
  }
  function rebuildClaims(): void {
  claimsEpoch++; // the political picture changed — the claims buffer re-renders
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
      // Which edges are frontier is a property of the CLAIM, not of the camera,
      // but drawClaims used to re-derive it every frame: 6 set lookups per hex
      // per repaint. That was free for a few hand-painted realms and is not
      // free for Earth's 23,503 — 141k lookups a frame, at exactly the zoom
      // where you want the political map. Work it out once, here.
      const border: Array<[number, number, number]> = [];
      let y0 = Infinity, y1 = -Infinity;
      for (const [q, r] of g.hexes) {
        let mask = 0;
        for (let k = 0; k < 6; k++) {
          if (!g.set.has((q + EDGE_DIRS[k]![0]) + ',' + (r + EDGE_DIRS[k]![1]))) mask |= 1 << k;
        }
        if (mask) border.push([q, r, mask]);
        const cy = hexCenter(ti, q, r)[1];
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
      }
      claimSets.push({ owner, color, ti, hexes: g.hexes, set: g.set, border, loops: borderLoops(ti, border), y0, y1 });
    }
  }
  }
  rebuildClaims();
  rebuildBiomePaint();

  // ---------- province borders from the admin-1 raster (#3b slice 2, D16) ----
  // A province's EDITABLE claim is world-tier (D16) and draws hex-grain; its
  // TRUE shape lives in the admin-1 raster. At close zoom the real state
  // lines draw as thin dashed atlas lines: unit↔unit edges only (a coast
  // belongs to the country loops), extracted once, chained, corner-cut, and
  // mapped into world space. On a SEEDED Earth the continents drift — a
  // first-order inverse of the same warp keeps the lines on the drifted
  // ground (exact on the canonical blank-seed Earth, where drift is 0).
  let provinceLines: Array<{ pts: Array<[number, number]>; y0: number; y1: number }> | null = null;
  const subOwners = new Set(claimOwners.filter((id) => (world.entities[id]?.tags ?? []).includes('subrealm')));
  const loadProvinceLines = async (): Promise<void> => {
    const m = await import('./earthAdmin1.ts');
    const grid = await m.earthAdmin1Grid();
    provinceLines = extractProvinceLines(grid, m.EARTH_ADMIN1_W, m.EARTH_ADMIN1_H);
    repaint();
  };
  function extractProvinceLines(grid: Uint16Array, gw: number, gh: number): Array<{ pts: Array<[number, number]>; y0: number; y1: number }> {
    // lattice segments between two DIFFERENT nonzero units, chained as
    // undirected edges (either endpoint continues a chain)
    interface PE { a: number; b: number; used?: boolean }
    const edges: PE[] = [];
    const byEnd = new Map<number, PE[]>();
    const K = gw + 1; // corner key = row * (gw+1) + col
    const at = (e: PE, from: number) => (e.a === from ? e.b : e.a);
    const link = (a: number, b: number): void => {
      const e: PE = { a, b };
      edges.push(e);
      for (const k of [a, b]) { const l = byEnd.get(k); if (l) l.push(e); else byEnd.set(k, [e]); }
    };
    for (let r = 0; r < gh; r++) {
      for (let c = 0; c < gw; c++) {
        const v = grid[r * gw + c]!;
        if (!v) continue;
        const right = grid[r * gw + (c + 1) % gw]!;
        if (right && right !== v && c + 1 < gw) link(r * K + (c + 1), (r + 1) * K + (c + 1));
        if (r + 1 < gh) {
          const below = grid[(r + 1) * gw + c]!;
          if (below && below !== v) link((r + 1) * K + c, (r + 1) * K + (c + 1));
        }
      }
    }
    const out: Array<{ pts: Array<[number, number]>; y0: number; y1: number }> = [];
    const toWorldPt = (k: number): [number, number] => {
      const gx = k % K, gy = Math.floor(k / K);
      const x = (gx / gw) * cfg.circumFt;
      const y = ((gy / gh) * 2 - 1) * (cfg.heightFt / 2);
      // first-order inverse of the continental-drift warp: subtract the
      // offset the forward warp would add at this point
      const [wx, wy] = driftedXY(cfg, x, y);
      return [x - (wx - x), y - (wy - y)];
    };
    for (const e0 of edges) {
      if (e0.used) continue;
      e0.used = true;
      const keys: number[] = [e0.a, e0.b];
      // grow forward from the tail, then backward from the head
      for (const end of [1, 0] as const) {
        for (let guard = 0; guard < edges.length; guard++) {
          const tip = end ? keys[keys.length - 1]! : keys[0]!;
          const nx = byEnd.get(tip)?.find((e) => !e.used);
          if (!nx) break;
          nx.used = true;
          const nk = at(nx, tip);
          if (end) keys.push(nk); else keys.unshift(nk);
        }
      }
      let pts = keys.map(toWorldPt);
      // two Chaikin passes: the lattice staircase reads as a drawn line
      for (let pass = 0; pass < 2; pass++) {
        if (pts.length < 3) break;
        const sm: Array<[number, number]> = [pts[0]!];
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i]!, q = pts[i + 1]!;
          sm.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
          sm.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
        }
        sm.push(pts[pts.length - 1]!);
        pts = sm;
      }
      let y0 = Infinity, y1 = -Infinity;
      for (const [, py] of pts) { if (py < y0) y0 = py; if (py > y1) y1 = py; }
      out.push({ pts, y0, y1 });
    }
    return out;
  }

  // ---------- travel time (Phase D, batch 33) ----------
  // 🥾: tap a start and a destination; the tool routes over roads and wild
  // country, fords rivers (bridges spare you), and answers in days.
  const WORLD_TI = TIERS.findIndex((t2) => t2.id === 'world');
  let travelRoads: Map<string, string> | null = null;
  let travelRivers: Set<string> | null = null;
  let travelFlow: Map<string, string> | null = null; // river hex → downstream hex
  let travelPorts: Map<string, 1 | 2> | null = null; // boat service (batch 36)
  let travelPortals: Array<[number, number]> | null = null; // 500k+ metropolises (batch 37)
  type TravelMethods = { ride: boolean; boat: boolean; portal: boolean; custom: boolean };
  type TravelSettings = {
    customTravel?: { label: string; miPerDay?: number; road?: number; land?: number; water?: number; air?: number };
    portalNetwork?: boolean;
    travelMethods?: TravelMethods;
  };
  const travelSettings = (): TravelSettings =>
    ((world as { settings?: TravelSettings }).settings ??= {});
  // which methods the GM allows on a measured trip (owner, batch 56): tick them
  // on and off — "only walking and boarding", "horseback and portals" — and the
  // route re-plans on exactly that subset. Walking is always the floor.
  const travelMethods = (): TravelMethods =>
    (travelSettings().travelMethods ??= { ride: true, boat: true, portal: true, custom: true });
  const RANK: Record<string, number> = { highway: 3, road: 2, dirt: 1, path: 1 };
  function buildTravelLayers(): void {
    if (travelRoads) return;
    travelRoads = new Map();
    travelRivers = new Set();
    travelFlow = new Map();
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
      if (kind === 'river') {
        // river polylines run source → mouth (the bake's flow tracing), so
        // consecutive stamped hexes give the CURRENT's direction for boats
        let prevK: string | null = null;
        stampLine(rt.pts, (k) => {
          travelRivers!.add(k);
          if (prevK && prevK !== k && !travelFlow!.has(prevK)) travelFlow!.set(prevK, k);
          prevK = k;
        });
      } else if (ROAD_REAL_FT[kind]) stampLine(rt.pts, (k) => {
        const cur = travelRoads!.get(k);
        if (!cur || (RANK[kind] ?? 0) > (RANK[cur] ?? 0)) travelRoads!.set(k, kind);
      });
    }
    // ports (owner, batch 36): river towns of 10k+ run boats downstream and
    // to sea; 50k+ cities keep magically-driven hulls that climb the current
    travelPorts = new Map();
    travelPortals = [];
    const portalSeen = new Set<string>();
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!ent || ent.deleted || ent.kind !== 'settlement') continue;
      const pop = Number((ent.fields ?? {}).population ?? 0);
      if (pop < 10_000) continue;
      const xn = ((a.x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
      const [q, r] = pointToHex(WORLD_TI, xn, a.y);
      const k = q + ',' + r;
      // a metropolis of 500k+ keeps a standing portal (owner, batch 37) —
      // arcane, not nautical, so no waterway required
      if (pop >= 500_000 && !portalSeen.has(k)) { portalSeen.add(k); travelPortals.push([q, r]); }
      let onWaterway = travelRivers.has(k);
      if (!onWaterway) {
        for (const [dq2, dr2] of EDGE_DIRS) {
          const nb = hexInfoAt(WORLD_TI, q + dq2!, r + dr2!).b;
          if (nb === 'water' || nb === 'deep') { onWaterway = true; break; }
        }
      }
      if (!onWaterway) continue;
      const level: 1 | 2 = pop >= 50_000 ? 2 : 1;
      if ((travelPorts.get(k) ?? 0) < level) travelPorts.set(k, level);
    }
  }
  const bridgeAnchors = (plane.anchors ?? []).filter((a) => a.icon === 'bridge');
  let travelPlan: TravelPlan | null = null;
  let customPlan: TravelPlan | null = null; // the custom method's OWN route (batch 37)
  // an ordered list of stops (batch 47): start, then each waypoint, then the
  // end — the route is planned leg by leg and summed
  let travelStops: Array<[number, number]> = []; // world hex q,r each
  // combine per-leg plans into one route (batch 47 — multi-point trips)
  function combinePlans(plans: TravelPlan[]): TravelPlan {
    const out: TravelPlan = { miles: 0, footDays: 0, mountedDays: 0, boatDays: 0, roadShare: 0, fords: 0, pts: [], modes: [] };
    let roadWeighted = 0, totalPts = 0;
    for (const [i, p] of plans.entries()) {
      out.miles += p.miles; out.footDays += p.footDays; out.mountedDays += p.mountedDays;
      out.boatDays += p.boatDays; out.fords += p.fords;
      roadWeighted += p.roadShare * p.pts.length; totalPts += p.pts.length;
      for (let j = i === 0 ? 0 : 1; j < p.pts.length; j++) { out.pts.push(p.pts[j]!); out.modes.push(p.modes[j]!); }
    }
    out.footDays = Math.round(out.footDays * 10) / 10;
    out.mountedDays = Math.round(out.mountedDays * 10) / 10;
    out.boatDays = Math.round(out.boatDays * 10) / 10;
    out.roadShare = totalPts ? roadWeighted / totalPts : 0;
    return out;
  }
  function planLegs(opts: { boats?: boolean; portals?: boolean } = {}): TravelPlan | null {
    if (travelStops.length < 2) return null;
    const plans: TravelPlan[] = [];
    for (let i = 0; i < travelStops.length - 1; i++) {
      const p = planTravel(travelDeps(opts), travelStops[i]!, travelStops[i + 1]!);
      if (!p) return null;
      plans.push(p);
    }
    return combinePlans(plans);
  }
  function planCustomLegs(prof: { label: string; road?: number; land?: number; water?: number; air?: number }): TravelPlan | null {
    if (travelStops.length < 2) return null;
    const plans: TravelPlan[] = [];
    for (let i = 0; i < travelStops.length - 1; i++) {
      const p = planCustom(travelDeps(), prof, travelStops[i]!, travelStops[i + 1]!);
      if (!p) return null;
      plans.push(p);
    }
    return combinePlans(plans);
  }
  // additive modes (owner, batch 39): each option can be planned WITHOUT the
  // others, so the banner can say what boats or portals each add
  function travelDeps(opts: { boats?: boolean; portals?: boolean } = {}) {
    buildTravelLayers();
    return {
      circumFt: cfg.circumFt,
      biomeOf: (q: number, r: number) => hexInfoAt(WORLD_TI, q, r).b as string,
      roadOf: (q: number, r: number) => travelRoads!.get(q + ',' + r) ?? null,
      riverAt: (q: number, r: number) => travelRivers!.has(q + ',' + r),
      riverFlowOf: (q: number, r: number) => travelFlow!.get(q + ',' + r) ?? null,
      portAt: (q: number, r: number): 0 | 1 | 2 => (opts.boats === false ? 0 : travelPorts!.get(q + ',' + r) ?? 0),
      // the network is optional: the ⚡ layer toggle douses every portal at once
      portals: () => (opts.portals === false || travelSettings().portalNetwork === false ? [] : travelPortals!),
      bridgeNear: (x: number, y: number) =>
        bridgeAnchors.some((b2) => Math.abs(wrapDx(b2.x - x)) < 45 * 5280 && Math.abs(b2.y - y) < 45 * 5280),
      centerOf: (q: number, r: number) => hexCenter(WORLD_TI, q, r),
      canon: (q: number, r: number): [number, number] => {
        const [cx2, cy2] = hexCenter(WORLD_TI, q, r);
        const xn = ((cx2 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
        return pointToHex(WORLD_TI, xn, cy2);
      },
      // open-water legs obey the wind + current (item #31c/#31d): the same
      // fields the 🌬 overlay draws now price the boat A*'s edges, so the
      // arrows on the map and the travel time finally tell one story
      seaSpeed: (ax: number, ay: number, bx: number, by: number, powered: boolean) =>
        boatLegSpeed(cfg, ax, ay, bx, by, powered),
    };
  }
  function travelPrompt(step: 1 | 2): void {
    hexInfo.hidden = false;
    hexInfo.innerHTML = step === 1
      ? '<b>🥾 Travel time</b> — tap the START point'
      : '<b>🥾 Travel time</b> — now tap the DESTINATION';
  }
  function showTravelPlan(): void {
    // additive modes (owner, batch 39): "foot is the fastest road path; foot
    // and portal the fastest path to the portal city; add boat, add that as
    // a calculation" — the base is the honest overland march, and each
    // available mode is shown as what it ADDS
    const m = travelMethods();
    const nStops = travelStops.length;
    // plan on exactly the enabled subset (walking is always the floor)
    const plan = planLegs({ boats: m.boat, portals: m.portal });
    travelPlan = plan;
    // custom method (griffons, barges, magical wagons) on its own A*
    const ct = travelSettings().customTravel;
    const prof = m.custom && ct ? {
      label: ct.label,
      road: ct.road ?? ct.miPerDay,
      land: ct.land ?? ct.miPerDay,
      water: ct.water,
      air: ct.air,
    } : null;
    customPlan = prof ? planCustomLegs(prof) : null;
    hexInfo.hidden = false;
    // ---- the banner, laid out to READ (owner, batch 56): a title line, a row
    // of method toggles, then one line per result — not one crammed line ----
    const hasPortals = travelDeps().portals().length >= 2;
    const chip = (on: boolean, key: string, glyph: string, label: string, dim = false): string =>
      `<button type="button" class="mv-tmethod" data-k="${key}" title="${label}"${dim ? ' disabled' : ''} style="` +
      `border:1px solid ${on ? '#6fd3e0' : 'rgba(255,255,255,.22)'};border-radius:11px;padding:2px 8px;margin:0 3px 0 0;` +
      `background:${on ? 'rgba(111,211,224,.18)' : 'transparent'};color:${on ? '#dff6fa' : 'rgba(255,255,255,.6)'};` +
      `font-size:12px;cursor:${dim ? 'default' : 'pointer'};opacity:${dim ? .4 : 1}">${glyph} ${label}${on ? '' : ''}</button>`;
    const chips = [
      chip(true, 'walk', '🥾', 'walk', true),
      chip(m.ride, 'ride', '🐎', 'ride'),
      chip(m.boat, 'boat', '⛵', 'boat'),
      chip(m.portal && hasPortals, 'portal', '⚡', 'portal', !hasPortals),
      chip(m.custom, 'custom', '✨', ct ? escT(ct.label) : 'custom'),
    ].join('');
    const stopTag = nStops > 2 ? ` · <span style="opacity:.75">${nStops - 2} stop${nStops > 3 ? 's' : ''}</span>` : '';
    let rows: string;
    if (!plan) {
      rows = `<div style="opacity:.85">🥾 No route on the chosen methods — open water or terrain bars the way.</div>`;
    } else {
      const road = `<span style="opacity:.7">${Math.round(plan.roadShare * 100)}% on roads${plan.fords ? `, ${plan.fords} ford${plan.fords > 1 ? 's' : ''}` : ''}${plan.boatDays > 0.05 ? `, ${plan.boatDays}d afloat` : ''}</span>`;
      const mDays = Math.ceil(plan.footDays), rDays = Math.ceil(plan.mountedDays);
      const march = cb.onAdvanceDays;
      // primary line: on foot, and (if ride enabled) mounted
      rows = `<div style="margin-top:3px">🥾 <b>on foot ${plan.footDays}d</b>` +
        (m.ride ? ` &nbsp;·&nbsp; 🐎 mounted <b>${plan.mountedDays}d</b>` : '') +
        ` &nbsp; ${road}` +
        (march ? ` <button type="button" class="mv-march" data-days="${mDays}">go 🥾 +${mDays}d</button>` +
          (m.ride ? ` <button type="button" class="mv-march" data-days="${rDays}">🐎 +${rDays}d</button>` : '') : '') +
        `</div>`;
      if (prof) {
        rows += customPlan
          ? `<div style="margin-top:2px">✨ <b>${escT(prof.label)} ${customPlan.footDays}d</b>` +
            (march ? ` <button type="button" class="mv-march" data-days="${Math.ceil(customPlan.footDays)}">go ✨ +${Math.ceil(customPlan.footDays)}d</button>` : '') + `</div>`
          : `<div style="margin-top:2px;opacity:.7">✨ ${escT(prof.label)}: no route on its terrain</div>`;
      }
    }
    hexInfo.innerHTML =
      `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">` +
        `<b>🧭 ${plan ? `≈ ${plan.miles} mi` : 'Trip'}${stopTag}</b>` +
        `<button type="button" class="mv-addstop" title="Add another stop">＋ stop</button>` +
        `<button type="button" class="mv-custom" title="Set a custom travel method">⚙ custom</button>` +
        `<button type="button" class="mv-tclear" title="Clear" style="margin-left:auto">✕</button>` +
      `</div>` +
      `<div style="margin-top:4px">${chips}</div>` +
      rows;
      hexInfo.querySelectorAll<HTMLButtonElement>('.mv-tmethod').forEach((btn) =>
        btn.addEventListener('click', () => {
          const k = btn.dataset.k;
          if (!k || k === 'walk') return;
          const mm = travelMethods();
          const key = k as keyof TravelMethods;
          mm[key] = !mm[key];
          cb.onClaimsEdited?.(); // persist the choice with the world
          showTravelPlan();
          repaint();
        }));
      hexInfo.querySelector('.mv-addstop')?.addEventListener('click', () => {
        hexInfo.innerHTML = '<b>🥾 Add a stop</b> — tap the next place on the trip';
        pickPending = (x2, y2) => {
          travelStops.push(travelStopAt(x2, y2));
          showTravelPlan();
          repaint();
        };
      });
      hexInfo.querySelector('.mv-custom')?.addEventListener('click', () => {
        const cur = ct
          ? [ct.label, ...(['road', 'land', 'water', 'air'] as const).flatMap((mk) => (ct[mk] ? [mk, String(ct[mk])] : []))].join(' ')
            + (ct.miPerDay && !ct.road && !ct.land ? ` ${ct.miPerDay}` : '')
          : 'Griffon air 96';
        const raw = prompt(
          'Custom travel method — a name, then speeds in mi/day.\n' +
          '"Griffon 96" = 96 over any land · or per terrain:\n' +
          '"Roc air 120" · "Barge water 40" · "Wagon road 30 land 10"', cur);
        if (!raw) return;
        const toks = raw.trim().split(/\s+/);
        const labelToks: string[] = [];
        const next: { label: string; road?: number; land?: number; water?: number; air?: number } = { label: '' };
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i]!.toLowerCase();
          if ((t === 'road' || t === 'land' || t === 'water' || t === 'air') && i + 1 < toks.length && /^\d+(\.\d+)?$/.test(toks[i + 1]!)) {
            next[t] = Number(toks[++i]);
          } else if (/^\d+(\.\d+)?$/.test(t) && labelToks.length) {
            // a bare number is the classic form: that fast over any land
            next.land ??= Number(t);
            next.road ??= Number(t);
          } else labelToks.push(toks[i]!);
        }
        next.label = labelToks.join(' ');
        if (!next.label || (!next.road && !next.land && !next.water && !next.air)) {
          alert('Like this: "Griffon 96", or per terrain: "Roc air 120", "Barge water 40 road 12".');
          return;
        }
        travelSettings().customTravel = next;
        cb.onClaimsEdited?.(); // persist with the world
        showTravelPlan();
        repaint();
      });
    hexInfo.querySelectorAll<HTMLButtonElement>('.mv-march').forEach((b2) =>
      b2.addEventListener('click', () => {
        cb.onAdvanceDays?.(Number(b2.dataset.days) || 0); // the journey costs its days
        if (plane.party && travelPlan) { // and the party arrives
          const dest = travelPlan.pts[travelPlan.pts.length - 1]!;
          plane.party = { x: Math.round(dest[0]), y: Math.round(dest[1]) };
          cb.onClaimsEdited?.();
        }
        travelPlan = null;
        customPlan = null;
        travelStops = [];
        hexInfo.hidden = true;
        repaint();
      }));
    hexInfo.querySelector('.mv-tclear')?.addEventListener('click', () => {
      travelPlan = null;
      customPlan = null;
      travelStops = [];
      hexInfo.hidden = true;
      repaint();
    });
  }

  // ---------- M2: painting the borders (owner, batch 10 → 27) ----------
  // "adjustable in the case of a war campaign and the GM is moving borders
  // as the party succeeds or fails" — pick a realm in the legend, drag over
  // hexes to claim them for that crown, toggle erase to cede them.
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
      // a freshly painted lake must suppress the ghosts standing in it, and
      // erasing one lets them return — the ghost caches key on region hexes
      ghostCache.clear();
      featureCache.clear();
      resourceCache.clear();
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

  /**
   * Show only the crowns whose ground is actually on screen (owner, item #29).
   *
   * Earth has ~500 of them (182 when this was written; the province batches
   * grew the roster), and a list that long is not a legend, it's a phone
   * book. Off a rAF-debounce rather than per frame: this walks hexes and pokes
   * the DOM, and neither belongs in a pan.
   */
  let legendTimer = 0;
  function scheduleClaimLegend(): void {
    if (legendTimer) return;
    legendTimer = window.setTimeout(() => { legendTimer = 0; refreshClaimLegend(); }, 220);
  }
  function refreshClaimLegend(): void {
    const vis = new Set<string>();
    for (const cs of claimSets) {
      const Rpx = hexR(cs.ti) * view.ppf;
      // the vertical extent is exact (latitude doesn't wrap) — reject a realm
      // that can't be on screen before touching a single one of its hexes
      const syTop = (cs.y0 - view.y) * view.ppf + H / 2;
      const syBot = (cs.y1 - view.y) * view.ppf + H / 2;
      if (syBot < -Rpx || syTop > H + Rpx) continue;
      for (const [q, r] of cs.hexes) {
        const [cx, cy] = hexCenter(cs.ti, q, r);
        const [sx, sy] = toScreen(cx, cy);
        if (sx > -Rpx && sx < W + Rpx && sy > -Rpx && sy < H + Rpx) { vis.add(cs.owner); break; }
      }
    }
    let shown = 0;
    legendClaims.querySelectorAll<HTMLElement>('.mv-key[data-owner]').forEach((el) => {
      const on = vis.has(el.dataset.owner!);
      el.hidden = !on;
      if (on) shown++;
    });
    const count = host.querySelector<HTMLElement>('.mv-claimcount');
    if (count) count.textContent = claimOwners.length ? `${shown}/${claimOwners.length}` : '';
  }

  function drawClaims(): void {
    if (!showRealms.checked) return; // the crowns are their own layer (item #27)
    // real state lines take over from hex-grain province strokes once a world
    // hex is broad on screen (#3b slice 2) — the wash keeps nesting either way
    const provinceActive = !!provinceLines && hexR(0) * SQ3 * view.ppf >= 40;
    for (const cs of claimSets) {
      if (hiddenClaims.has(cs.owner)) continue;
      const R = hexR(cs.ti), Rpx = R * view.ppf;
      const hexW = Rpx * SQ3;
      if (hexW < 0.8) continue;
      // Whole realm above or below the view? Skip its hexes entirely. Latitude
      // doesn't wrap, so unlike x this is a safe, exact test — and once you're
      // zoomed into one country, it drops nearly every other crown on Earth
      // before touching a hex.
      const syTop = (cs.y0 - view.y) * view.ppf + H / 2;
      const syBot = (cs.y1 - view.y) * view.ppf + H / 2;
      if (syBot < -Rpx * 2 || syTop > H + Rpx * 2) continue;
      // a one-hex realm at survey zoom is a BADGE, not a lone 60-mile hexagon
      // ringed in the sea (audit V7 — Malta): a small color-coded seal at the
      // claim's centre until you're close enough for its true hex to mean
      // something. Its name label rides the anchor layer as usual.
      if (cs.hexes.length === 1 && hexW < 260) {
        const [cx0, cy0] = hexCenter(cs.ti, cs.hexes[0]![0], cs.hexes[0]![1]);
        const [bx, by] = toScreen(cx0, cy0);
        if (bx >= -20 && bx <= W + 20 && by >= -20 && by <= H + 20) {
          const br = Math.max(3, Math.min(10, hexW * 0.08));
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = 'rgba(20,16,10,0.45)';
          ctx.strokeStyle = cs.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        continue;
      }
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
      // once the true state lines draw, the province's hex-grain stroke
      // retires — two borders for one line reads as a misregistration
      if (provinceActive && subOwners.has(cs.owner)) continue;
      if (hexW < 2) continue; // borders unreadable below this
      ctx.strokeStyle = cs.color;
      ctx.lineWidth = Math.min(5, Math.max(1.2, Rpx * 0.09));
      // the frontier as ordered, corner-cut polylines (audit V7) — worked out
      // at rebuild time, so a repaint strokes and does not think. screenRuns
      // keeps a border that straddles the antipode from ruling a line across
      // the map, same as rivers and roads.
      ctx.beginPath();
      for (const lp of cs.loops) {
        for (const run of screenRuns(lp)) {
          ctx.moveTo(run[0]![0], run[0]![1]);
          for (let i = 1; i < run.length; i++) ctx.lineTo(run[i]![0], run[i]![1]);
        }
      }
      ctx.stroke(); // one stroke for the whole frontier, not one per edge
    }
    // the real state lines (#3b slice 2): dashed, atlas-neutral, CASED like
    // roads so they read on any terrain — the province WASHES stay hex-grain
    // and colored; these carry the true shape
    if (provinceActive && provinceLines) {
      const yTop = view.y - H / view.ppf, yBot = view.y + H / view.ppf;
      // stroke ONLY the on-screen stretches: the dashed stroke below walks
      // the whole path length in dash units, and at street zoom one state
      // line can be millions of pixels long — dashing the off-screen part
      // cost ~200ms/frame (map-perf caught it)
      const pad = 64;
      // a segment's BBOX must overlap the viewport — at street zoom one
      // segment spans the whole screen with both endpoints off it, so an
      // endpoint-in-view test would blank the line entirely
      const hits = (a: [number, number], b: [number, number]) =>
        Math.max(a[0], b[0]) >= -pad && Math.min(a[0], b[0]) <= W + pad &&
        Math.max(a[1], b[1]) >= -pad && Math.min(a[1], b[1]) <= H + pad;
      ctx.beginPath();
      for (const lp of provinceLines) {
        if (lp.y1 < yTop || lp.y0 > yBot) continue;
        for (const run of screenRuns(lp.pts)) {
          let open = false;
          for (let i = 1; i < run.length; i++) {
            if (hits(run[i - 1]!, run[i]!)) {
              if (!open) { ctx.moveTo(run[i - 1]![0], run[i - 1]![1]); open = true; }
              ctx.lineTo(run[i]![0], run[i]![1]);
            } else open = false;
          }
        }
      }
      ctx.strokeStyle = 'rgba(246,238,214,0.55)'; // pale casing under the dash
      ctx.lineWidth = 2.8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(48,36,24,0.8)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.stroke(); // same path, dashed core
      ctx.setLineDash([]);
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
        // seam guard (same as stampLine/drawRoutes): a segment jumping the
        // x-wrap has raw dx ≈ circumFt, and walking it stamps a phantom
        // E–W riverbank band across a whole latitude
        if (Math.abs(bx - ax) > cfg.circumFt / 2) continue;
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
      // no one settles a lake (batch 41): a hex painted to water — a filled
      // depression from the bake, or a GM's brush — grows no ghost. The
      // biome noise says grass, but the paint is the truth.
      const wb = hexInfoAt(REGION_TI, q, r).b;
      if (wb === 'water' || wb === 'deep') {
        ghostCache.set(k, null);
        return null;
      }
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
      // ruins and lairs don't stand in a lake either (batch 41)
      const wb = hexInfoAt(REGION_TI, q, r).b;
      if (wb === 'water' || wb === 'deep') {
        featureCache.set(k, null);
        return null;
      }
      const raw = ghostFeatureAt(cfg, world.seed, plane.id || 'p_surface', q, r);
      g = raw && !settledNearby(raw.x, raw.y) ? { ...raw, gid: ghostId(raw.seedPath) } : null;
      if (featureCache.size > 60000) featureCache.clear();
      featureCache.set(k, g);
    }
    return g;
  }
  // ghost names read over any terrain (batch 42): a dark halo behind a bright
  // face, so "unwritten hamlet" is legible on grass, forest, or desert alike
  function ghostText(text: string, sx: number, sy: number, face: string): void {
    ctx.font = 'italic 11px Georgia, serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(14,18,24,0.85)';
    ctx.strokeText(text, sx, sy);
    ctx.fillStyle = face;
    ctx.fillText(text, sx, sy);
  }
  // ---------- strategic & luxury resources (batch 48) ----------
  const resourceCache = new Map<string, Resource | null>();
  function resourceAtHex(q: number, r: number): Resource | null {
    const [cx0, cy0] = hexCenter(WORLD_TI, q, r);
    const xn = ((cx0 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    const [cq, cr] = pointToHex(WORLD_TI, xn, cy0);
    const k = cq + ',' + cr;
    let v = resourceCache.get(k);
    if (v === undefined) {
      const b = hexInfoAt(WORLD_TI, cq, cr).b as string;
      v = resourceAt(world.seed, plane.id || 'p_surface', cq, cr, b);
      resourceCache.set(k, v);
    }
    return v;
  }
  function drawResources(): void {
    if (!showRes.checked) return;
    if (WORLD_HEXFT * view.ppf < 26) return; // reveal past the continental view
    const R2 = hexR(WORLD_TI);
    const [, y0] = toWorld(0, -40), [, y1] = toWorld(0, H + 40);
    const rMin = Math.floor((2 / 3 * y0) / R2), rMax = Math.ceil((2 / 3 * y1) / R2);
    const halfSpanX = (W / 2 + 40) / view.ppf;
    ctx.textAlign = 'center';
    for (let r = rMin; r <= rMax; r++) {
      const qc = (SQ3 / 3 * view.x) / R2 - r / 2;
      const qSpan = Math.ceil((SQ3 / 3 * halfSpanX) / R2) + 1;
      for (let q = Math.floor(qc - qSpan); q <= Math.ceil(qc + qSpan); q++) {
        const res = resourceAtHex(q, r);
        if (!res) continue;
        const [cx, cy] = hexCenter(WORLD_TI, q, r);
        const [sx, syc] = toScreen(cx, cy);
        const sy = syc + hexR(WORLD_TI) * view.ppf * 0.42; // sit low in the hex, clear of pins
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
        // ring reads the class: green strategic, violet luxury, amber both
        const both = res.strategic && res.luxury;
        ctx.fillStyle = both ? 'rgba(44,36,20,0.85)' : res.strategic ? 'rgba(28,40,24,0.85)' : 'rgba(44,28,52,0.85)';
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 7); ctx.fill();
        ctx.strokeStyle = both ? 'rgba(224,190,110,0.98)' : res.strategic ? 'rgba(150,196,120,0.95)' : 'rgba(214,150,232,0.95)';
        ctx.lineWidth = 1.4; ctx.stroke();
        ctx.font = '11px system-ui';
        ctx.fillStyle = '#f4efdf';
        ctx.fillText(res.glyph, sx, sy + 4);
      }
    }
  }
  // A ghost/hazard HEX ZONE (owner, 2026-07-22): the unwritten & abandoned
  // places used to draw as a fixed ~8px dashed box, so zooming in shrank them
  // to a speck inside a 500 ft hex. Now each is a hex "circle" sized in WORLD
  // FEET, so it scales with the map and reads as an AREA — a danger zone for the
  // hostile ones (abandoned settlements, lairs, dungeons, caves), a lighter
  // sketch for the safe unwritten hamlets. Screen size is clamped so it never
  // floods the viewport at deep zoom nor vanishes far out.
  function hazHexPath(sx: number, sy: number, rad: number): void {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const [ax, ay] = corner(sx, sy, rad, k); if (k) ctx.lineTo(ax, ay); else ctx.moveTo(ax, ay); }
    ctx.closePath();
  }
  function drawGhostZone(sx: number, sy: number, worldRad: number, glyph: string, hostile: boolean, label: string, showLabel: boolean): void {
    const rad = Math.max(hostile ? 24 : 9, Math.min(worldRad * view.ppf, Math.min(W, H) * (hostile ? 0.4 : 0.1)));
    const line = hostile ? 'rgba(210,96,80,0.9)' : 'rgba(238,232,214,0.7)';
    hazHexPath(sx, sy, rad);
    ctx.fillStyle = hostile ? 'rgba(196,72,56,0.11)' : 'rgba(226,216,190,0.06)';
    ctx.fill();
    if (hostile) { // danger stripes hatched across the zone, clipped to the hex
      ctx.save(); hazHexPath(sx, sy, rad); ctx.clip();
      ctx.strokeStyle = 'rgba(196,72,56,0.15)'; ctx.lineWidth = Math.max(2, rad * 0.055);
      const step = Math.max(9, rad * 0.36);
      for (let o = -rad * 2; o < rad * 2; o += step) {
        ctx.beginPath(); ctx.moveTo(sx + o - rad, sy - rad); ctx.lineTo(sx + o + rad, sy + rad); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.setLineDash([Math.max(4, rad * 0.16), Math.max(3, rad * 0.1)]); // the "hex circle"
    ctx.strokeStyle = line; ctx.lineWidth = Math.max(1.4, rad * 0.035);
    hazHexPath(sx, sy, rad); ctx.stroke();
    ctx.setLineDash([]);
    if (hostile || rad > 15) { // the glyph at the heart, sized to the zone but legible
      const gpx = Math.max(12, Math.min(rad * 0.7, 40));
      ctx.font = `${gpx}px system-ui`;
      ctx.fillStyle = hostile ? '#f2b3a6' : '#f4efdf';
      ctx.fillText(glyph, sx, sy + gpx * 0.34);
    }
    if (showLabel) ghostText(label, sx, sy - rad - 3, hostile ? 'rgba(240,170,158,0.95)' : 'rgba(248,244,232,0.92)');
  }
  function drawGhosts(): void {
    if (!showPins.checked || !showGhosts.checked) return;
    const R2 = hexR(REGION_TI);
    const hexPx = 31680 * view.ppf;
    if (hexPx < 20) return; // the unwritten appear once the country is close
    const [, y0] = toWorld(0, -40), [, y1] = toWorld(0, H + 40);
    const rMin = Math.floor((2 / 3 * y0) / R2), rMax = Math.ceil((2 / 3 * y1) / R2);
    const halfSpanX = (W / 2 + 40) / view.ppf;
    const m = Math.min(W, H) * 0.42; // cull margin: a big zone can spill on-screen from off it
    ctx.textAlign = 'center';
    // hazard zones ~3 region-hexes across (1.5 hex radius); safe hamlets ~a third
    const HAZ_FT = 1.5 * 31680, SAFE_FT = 0.32 * 31680;
    for (let r = rMin; r <= rMax; r++) {
      const qc = (SQ3 / 3 * view.x) / R2 - r / 2;
      const qSpan = Math.ceil((SQ3 / 3 * halfSpanX) / R2) + 1;
      for (let q = Math.floor(qc - qSpan); q <= Math.ceil(qc + qSpan); q++) {
        const g = densityGhostAt(q, r);
        if (g && !world.entities[g.gid]) {
          const [sx, sy] = toScreen(g.x, g.y);
          if (sx < -m || sx > W + m || sy < -m || sy > H + m) continue;
          const glyph = g.abandoned ? '🏚️' : g.cls === 'town' ? '🏘️' : '🛖';
          drawGhostZone(sx, sy, g.abandoned ? HAZ_FT : SAFE_FT, glyph, g.abandoned,
            (g.abandoned ? 'abandoned ' : 'unwritten ') + g.cls, hexPx > 90);
          continue;
        }
        const f = densityFeatureAt(q, r);
        if (f && !world.entities[f.gid]) {
          const [sx, sy] = toScreen(f.x, f.y);
          if (sx < -m || sx > W + m || sy < -m || sy > H + m) continue;
          drawGhostZone(sx, sy, HAZ_FT, ANCHOR_ICON[f.kind] ?? '☠️', true, 'unwritten ' + f.kind, hexPx > 90);
        }
      }
    }
  }

  // ---------- roads (batch 11): classes reveal as you zoom ----------
  // Highways surface first, roads next, dirt tracks last. The old thresholds
  // (3e-4 / 1e-3 / 5e-3) hid the ENTIRE network at the ~100-mile survey zoom —
  // the audit's India/China frames showed a dozen cities and not one road, the
  // exact "no roads in India" look the data no longer deserves (queue #39 V2).
  // A real atlas keeps its trunk roads visible at country scale, so: highways
  // from continental zoom, roads at survey zoom, dirt as you close in — each
  // FADING in near its threshold (see drawRoutes) instead of popping.
  const ROUTE_MIN_PPF: Record<string, number> = { highway: 6e-5, road: 2e-4, dirt: 1.5e-3, river: 3e-4, path: 5e-3, seaRoute: 3e-4 };
  // a great river as a FILLED ribbon (batch 44): real width, but breathing —
  // it widens and narrows down its course like a real river, and a soft bank
  // line edges the water. Drawn as one polygon: down the left bank, up the
  // right. The baseline width never drops below a visible floor.
  function drawRiverRibbon(pts: Array<[number, number]>, id: string, riverFt: number): void {
    const baseW = Math.max(3, riverFt * view.ppf); // half handled below; floor keeps it visible
    // split where the SCREEN wraps, not where the world does — see screenRuns
    for (const r of screenRuns(pts)) {
      if (r.length < 2) continue;
      // per-point half-width with gentle seeded variation (0.62–1.0 of base)
      const hw = r.map((_, i) => {
        const n = h32(id + ':' + i, 313) / 4294967295;
        return baseW * 0.5 * (0.62 + 0.38 * n);
      });
      const left: Array<[number, number]> = [], right: Array<[number, number]> = [];
      for (let i = 0; i < r.length; i++) {
        const a = r[Math.max(0, i - 1)]!, b = r[Math.min(r.length - 1, i + 1)]!;
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const nx = -dy, ny = dx; // perpendicular
        const [px, py] = r[i]!;
        left.push([px + nx * hw[i]!, py + ny * hw[i]!]);
        right.push([px - nx * hw[i]!, py - ny * hw[i]!]);
      }
      ctx.beginPath();
      ctx.moveTo(left[0]![0], left[0]![1]);
      for (let i = 1; i < left.length; i++) ctx.lineTo(left[i]![0], left[i]![1]);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]![0], right[i]![1]);
      ctx.closePath();
      ctx.fillStyle = 'rgba(66,106,148,0.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(44,74,110,0.7)'; // bank line
      ctx.lineWidth = 1; ctx.setLineDash([]); ctx.stroke();
    }
  }
  /**
   * Liang–Barsky: the sub-range of a screen segment that is actually in frame,
   * as [t0,t1] in [0,1], or null if none of it is.
   *
   * Anything that walks a line in SCREEN space needs this. World-space work is
   * self-limiting — a hex is a hex — but a screen-space step count grows with
   * the zoom without bound, so at deep zoom an off-screen line costs more than
   * the entire visible map.
   */
  function clipToView(x0: number, y0: number, x1: number, y1: number, m: number): [number, number] | null {
    const dx = x1 - x0, dy = y1 - y0;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 + m, W + m - x0, y0 + m, H + m - y0];
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i]! < 0) return null; continue; } // parallel and outside
      const r = q[i]! / p[i]!;
      if (p[i]! < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [t0, t1];
  }
  // subtle downstream flow markers (owner, batch 55): soft chevron-waves along
  // a river, pointing the way the current runs (polyline order is source→mouth,
  // so downstream is FORWARD along the points). Pale and sparse — a hint, not a
  // decoration — and only when the river is comfortably on screen.
  function drawFlowMarkers(pts: Array<[number, number]>, riverFt: number): void {
    const spacing = 62; // px between marks
    const size = Math.max(3.2, Math.min(9, riverFt * view.ppf * 0.28));
    ctx.strokeStyle = 'rgba(206,228,244,0.55)';
    ctx.lineWidth = Math.max(1, size * 0.26);
    ctx.lineCap = 'round';
    // screenRuns, for the reason spelled out at its definition: this used to
    // test `|bx - ax| > circumFt/2` on the RAW world dx, which is exactly the
    // test that cannot see the item #13 wrap — two points a few feet apart in
    // the world land on opposite screen edges when they straddle the view's
    // ANTIPODE. Batch 109 fixed the river's line and left its arrows behind,
    // so the line stopped being ruled across the map and the current kept
    // marching over the open ocean without it (owner, item #18).
    for (const run of screenRuns(pts)) {
      let acc = spacing;
      for (let i = 0; i < run.length - 1; i++) {
        const [sax, say] = run[i]!, [sbx, sby] = run[i + 1]!;
        const segdx = sbx - sax, segdy = sby - say;
        const segLen = Math.hypot(segdx, segdy);
        if (segLen < 1) continue;
        // How many marks this segment carries, and the phase it hands the next
        // one. Computed WITHOUT drawing, because the count is the whole problem
        // (item #19): segLen is in SCREEN pixels, so at the 50 ft grain one
        // 7.67-mile river segment is 81,000 px long and the old `while (acc <
        // segLen)` walked it 1,306 times — 13 MILLION wave-arrows a frame
        // across Earth's 10,247 segments, essentially all of them off-screen.
        // That was the 9.6-second frame.
        const nMarks = Math.max(0, Math.ceil((segLen - acc) / spacing));
        const vis = clipToView(sax, say, sbx, sby, 40);
        if (vis) {
          const ux = segdx / segLen, uy = segdy / segLen; // downstream tangent
          const px = -uy, py = ux;                         // perpendicular
          // jump straight to the first mark inside the viewport — never iterate
          // the ones outside it
          const from = Math.max(0, Math.ceil((vis[0] * segLen - acc) / spacing));
          const to = Math.min(nMarks - 1, Math.floor((vis[1] * segLen - acc) / spacing));
          for (let k = from; k <= to; k++) {
            const d = acc + k * spacing;
            const cx = sax + ux * d, cy = say + uy * d;
            const tipx = cx + ux * size * 0.6, tipy = cy + uy * size * 0.6;      // ahead = downstream
            const w1x = cx - ux * size * 0.4 + px * size * 0.7, w1y = cy - uy * size * 0.4 + py * size * 0.7;
            const w2x = cx - ux * size * 0.4 - px * size * 0.7, w2y = cy - uy * size * 0.4 - py * size * 0.7;
            ctx.beginPath();
            ctx.moveTo(w1x, w1y); ctx.quadraticCurveTo(tipx, tipy, w2x, w2y); // a soft wave-arrow
            ctx.stroke();
          }
        }
        // carry the phase whether or not we drew, so the marks stay pinned to
        // the river instead of crawling along it as you pan
        acc = acc + nMarks * spacing - segLen;
      }
    }
  }
  function drawRoutes(): void {
    for (const rt of plane.routes ?? []) {
      const kind = rt.kind ?? 'road';
      if (kind === 'river' ? !showRivers.checked : !showRoads.checked) continue;
      let flowRiverFt = 0; // set for navigable rivers, drawn after the line
      // rivers reveal by width class (batch 21): great rivers belong on the
      // continental view like any real map; streams appear as you close in
      const rw = kind === 'river' ? Math.max(1, Math.min(4, rt.w ?? 2)) : 0;
      const minPpf = kind === 'river' ? (rw >= 2 ? 0 : 1e-3) : (ROUTE_MIN_PPF[kind] ?? 1e-3);
      if (view.ppf < minPpf) continue;
      if (kind === 'river') {
        const far = view.ppf < 1e-4; // continental view: rivers thin to atlas lines
        // a river's REAL width in feet — a great river runs near a mile bank
        // to bank, a river ~800 ft, a stream ~250 ft (owner, batch 44)
        const riverFt = rw >= 4 ? 8500 : rw >= 3 ? 5000 : rw >= 2 ? 900 : 260;
        // a GRAND river must read grand: the audit's Amazon was near-indistinguishable
        // from a stream at survey zoom (#39 V8), so the top bands carry more weight
        const atlasW = rw >= 4 ? (far ? 3.5 : 6) : rw >= 3 ? (far ? 2.5 : 4.2) : rw >= 2 ? (far ? 1.3 : 2.1) : 1.3;
        const realPx = riverFt * view.ppf;
        // once the real width clearly beats the atlas line, draw a filled
        // ribbon with natural along-course variation — the great river reads
        // as a body of water covering the hexes, not a hairline
        if (rw >= 2 && view.ppf > 6e-5) flowRiverFt = riverFt;
        if (realPx > atlasW * 2.2 && rw >= 2) {
          drawRiverRibbon(rt.pts, rt.id, riverFt);
          if (flowRiverFt) drawFlowMarkers(rt.pts, flowRiverFt);
          continue;
        }
        ctx.strokeStyle = 'rgba(66,106,148,0.9)';
        ctx.lineWidth = Math.max(atlasW, realPx);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.setLineDash([]);
      } else if (kind === 'seaRoute') {
        ctx.strokeStyle = 'rgba(72,110,150,0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
      } else {
        // A road has a REAL width now (roadField.ts): 100 ft of highway, 40 of
        // road, 10 of dirt track. Same ladder rivers have always had — atlas
        // line when the true width is too fine to see, true width once it
        // isn't. Before this, lineWidth was a flat screen-pixel count, so a
        // highway was 2.6px across a third of Earth (≈21 miles wide) AND 2.6px
        // standing in a 500-foot hex, where it should be a quarter of the hex.
        const roadFt = ROAD_REAL_FT[kind] ?? 40;
        const atlasW = roadAtlasWidth(kind);
        const realPx = roadFt * view.ppf;
        ctx.strokeStyle = kind === 'highway' ? 'rgba(88,66,44,0.95)' : kind === 'dirt' ? 'rgba(128,102,70,0.7)' : 'rgba(106,82,56,0.85)';
        // fade in just above the reveal threshold, so the network emerges like
        // an atlas layer instead of popping on — but never so faint it loses
        // to the terrain under a pin layer (the audit's first cut at 0.35 was
        // invisible over India's olive plains)
        ctx.globalAlpha = Math.max(0.65, Math.min(1, view.ppf / ((ROUTE_MIN_PPF[kind] ?? 1e-3) * 1.8)));
        ctx.lineWidth = roadLineWidth(kind, view.ppf);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        // the dashes are the SYMBOL for an unmade track — once the track is
        // drawn at its true width they stop being a symbol and start being
        // potholes, so they scale with it and retire when the road is real
        ctx.setLineDash(kind === 'dirt' || kind === 'path'
          ? (realPx > atlasW * 2.2 ? [] : [5, 4])
          : []);
      }
      ctx.beginPath();
      let prev: [number, number] | null = null;
      let prevWx: number | null = null;
      for (const [x, y] of rt.pts) {
        // Compare WRAPPED offsets, in world feet. World feet (not screen px)
        // because screen distance grows without bound at deep zoom and used to
        // break every segment — rivers vanished up close. WRAPPED because
        // toScreen wraps each point to the nearest half-world of the view, so a
        // line straddling the view's ANTIPODE jumps edge to edge on screen while
        // its raw world dx stays tiny: the old test never saw it, and the line
        // got ruled clean across the map (item #13).
        const wx = wrapDx(x - view.x);
        const sx = wx * view.ppf + W / 2, sy = (y - view.y) * view.ppf + H / 2;
        const wrapped = prevWx !== null && Math.abs(wx - prevWx) > cfg.circumFt / 2;
        if (prev && !wrapped) {
          // Curve to the MIDPOINT with the previous vertex as control — the
          // straight lineTo chained chords with a visible corner at every
          // vertex, which is why the Nile kinked and the Danube ran
          // ruler-straight at region zoom (audit #39 V8). The curve passes
          // within half a segment of every vertex, so nothing moves far.
          ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + sx) / 2, (prev[1] + sy) / 2);
        } else ctx.moveTo(sx, sy);
        prev = [sx, sy];
        prevWx = wx;
      }
      if (prev) ctx.lineTo(prev[0], prev[1]); // land exactly on the final point (a road's doorstep)
      // Cased roads (audit #39 V2): a thin brown line at survey zoom simply
      // loses to olive terrain — the probe showed India's whole network drawn
      // yet invisible under the other layers. Every atlas solves this the same
      // way: a pale casing under a dark core buys contrast on ANY ground. The
      // path is already built, so the casing is one extra stroke of it.
      if (kind !== 'river' && kind !== 'seaRoute') {
        const coreW = ctx.lineWidth, coreStyle = ctx.strokeStyle, coreDash = ctx.getLineDash();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(246,238,214,0.6)';
        ctx.lineWidth = coreW + 2;
        ctx.stroke();
        ctx.setLineDash(coreDash);
        ctx.strokeStyle = coreStyle;
        ctx.lineWidth = coreW;
      }
      ctx.stroke();
      ctx.globalAlpha = 1; // the road fade-in must not bleed into other layers
      if (flowRiverFt) drawFlowMarkers(rt.pts, flowRiverFt);
    }
    ctx.setLineDash([]);
  }

  // ---------- settlement footprints & landmark art (M4, batch-9 spec) ----------
  // City 2½ mi across at 25k souls (growing with census), town ½ mi,
  // village ¼ mi; dungeons get entrance
  // variants; waterborne places sit on raft platforms. The art appears once
  // its TRUE size is readable on screen and replaces the disc pin, so
  // zooming in feels like approaching the place.
  const FOOT_FT: Record<string, number> = { city: 13200, town: 2640, village: 1320, dungeon: 420, tavern: 180 };
  const HOUSES: Record<string, number> = { city: 64, town: 18, village: 7, tavern: 1 };
  // Footprint diameter from population at fantasy-Victorian URBAN density
  // (MAPS §9b): people pack tighter as a place grows, so density climbs from
  // ~6k/sq mi in a hamlet to ~60k in a metropolis. area = pop / density → a
  // believable width — a 25k city is ~1 mile across (not the old flat 2½ that
  // read as 5k/sq mi farmland), a 1M city ~4½ mi, and a village fills its
  // quarter-mile instead of floating on grass. dungeon/tavern keep their fixed
  // sizes; pop 0 = unknown = a class-typical guess. (Was popScaleOf's log curve,
  // which drew small cities far too wide and megacities slightly too small.)
  const REF_POP: Record<string, number> = { city: 25_000, town: 4_000, village: 400 };
  function densityPerSqMi(pop: number): number {
    const lp = Math.log10(Math.max(300, pop));
    return 6_000 + 54_000 * Math.min(1, Math.max(0, (lp - 2.7) / 3.6));
  }
  function settleFt(cls: string, pop: number): number {
    if (REF_POP[cls] === undefined) return FOOT_FT[cls] ?? 1_000; // dungeon/tavern: fixed
    const p = pop || REF_POP[cls]!;
    const dia = 2 * Math.sqrt((p / densityPerSqMi(p)) / Math.PI) * 5280;
    const floor = cls === 'city' ? 3_200 : cls === 'town' ? 1_500 : 850;
    const ceil = cls === 'city' ? 42_000 : cls === 'town' ? 4_600 : 2_400;
    return Math.max(floor, Math.min(ceil, dia));
  }
  // house/block/wall detail holds a constant screen size as the CITY grows:
  // scale = this footprint ÷ the class's reference footprint.
  function scaleOf(cls: string, pop: number): number {
    if (REF_POP[cls] === undefined) return 1;
    return settleFt(cls, pop) / settleFt(cls, REF_POP[cls]!);
  }
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

  // A seeded irregular hull for the built-up area — one silhouette per seed,
  // reused as the opaque ground, the block-fabric clip, and the wall line, so
  // no two settlements share a shape (owner: differing city shapes).
  const ROOF_TONES = ['#8a6a48', '#7d5f42', '#8f7250', '#725640', '#846540'];
  function hullPoints(id: string, sx: number, sy: number, R: number, segs: number,
                      base: number, jit: number, salt: number): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wr = R * (base + rng01(id, salt + i) * jit);
      pts.push([sx + Math.cos(a) * wr, sy + Math.sin(a) * wr]);
    }
    return pts;
  }
  function tracePoly(pts: Array<[number, number]>): void {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i]![0], pts[i]![1]); else ctx.moveTo(pts[i]![0], pts[i]![1]); }
    ctx.closePath();
  }

  // a hamlet's chapel: a little nave with a spire and a cross — the landmark
  // that says "a farming community lives here", the village equivalent of the
  // city keep. Sized to the settlement, drawn only when big enough to read.
  function drawChapel(x: number, y: number, s: number, rot: number): void {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#7a6048'; ctx.strokeStyle = 'rgba(25,20,14,0.8)'; ctx.lineWidth = 1;
    ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7); ctx.strokeRect(-s * 0.5, -s * 0.35, s, s * 0.7);
    ctx.fillStyle = '#6d5138'; // the tower/spire end
    ctx.fillRect(-s * 0.5, -s * 0.62, s * 0.32, s * 0.32); ctx.strokeRect(-s * 0.5, -s * 0.62, s * 0.32, s * 0.32);
    if (s > 6) { // a cross atop the spire
      ctx.strokeStyle = 'rgba(35,28,18,0.9)'; ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(-s * 0.34, -s * 0.62); ctx.lineTo(-s * 0.34, -s * 0.84);
      ctx.moveTo(-s * 0.42, -s * 0.76); ctx.lineTo(-s * 0.26, -s * 0.76);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDungeon(id: string, sx: number, sy: number, px: number): void {
    const v = h32(id, 999) % 7;
    const R = px / 2;
    const dark = '#241d16', stone = '#8f8578', line = 'rgba(25,20,14,0.85)';
    // a worn approach: a faint trodden track people beat to the entrance, and a
    // scatter of tumbled rubble around it — the mark of an old, dangerous place.
    ctx.strokeStyle = 'rgba(120,104,78,0.55)';
    ctx.lineWidth = Math.max(1, px * 0.05); ctx.lineCap = 'round';
    const pa = rng01(id, 20) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(sx + Math.cos(pa) * R * 1.15, sy + Math.sin(pa) * R * 1.15);
    ctx.lineTo(sx + Math.cos(pa) * R * 0.35, sy + Math.sin(pa) * R * 0.35); ctx.stroke();
    ctx.fillStyle = 'rgba(90,84,74,0.7)';
    for (let i = 0; i < 5; i++) {
      const a = rng01(id, 21 + i) * Math.PI * 2, rr = R * (0.75 + rng01(id, 26 + i) * 0.5);
      const rs = Math.max(1, R * (0.06 + rng01(id, 12 + i) * 0.06));
      ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, rs, 0, 7); ctx.fill();
    }
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
    } else if (v === 4) { // sinkhole
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.ellipse(sx, sy, R * 0.8, R * 0.55, 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = stone;
      ctx.stroke();
    } else if (v === 5) { // ruined tower: a broken, crenellated stump with a dark doorway
      ctx.fillStyle = stone;
      ctx.beginPath();
      ctx.moveTo(sx - R * 0.42, sy + R * 0.7); ctx.lineTo(sx - R * 0.42, sy - R * 0.5);
      ctx.lineTo(sx - R * 0.24, sy - R * 0.5); ctx.lineTo(sx - R * 0.24, sy - R * 0.72); // a broken merlon
      ctx.lineTo(sx - R * 0.06, sy - R * 0.72); ctx.lineTo(sx - R * 0.06, sy - R * 0.5);
      ctx.lineTo(sx + R * 0.18, sy - R * 0.62); // the top sheared off on a slant
      ctx.lineTo(sx + R * 0.42, sy - R * 0.3); ctx.lineTo(sx + R * 0.42, sy + R * 0.7);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark; // the doorway
      ctx.fillRect(sx - R * 0.14, sy + R * 0.2, R * 0.28, R * 0.5);
    } else { // mine adit: a timbered shaft mouth cut into a low spoil bank
      ctx.fillStyle = '#7a6f60';
      ctx.beginPath(); ctx.arc(sx, sy + R * 0.35, R * 0.9, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = dark; // the shaft
      ctx.fillRect(sx - R * 0.28, sy - R * 0.15, R * 0.56, R * 0.5);
      ctx.strokeStyle = '#4a3b2a'; ctx.lineWidth = Math.max(1.5, px * 0.045); // the timber frame
      ctx.strokeRect(sx - R * 0.28, sy - R * 0.15, R * 0.56, R * 0.5);
    }
  }

  function drawFootprint(cls: string, id: string, sx: number, sy: number, px: number, waterborne: boolean, scale = 1): void {
    const R = px / 2;
    const bpx = px / scale; // class-base footprint px: houses stay house-sized while the CITY grows
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

    const isCity = cls === 'city', isTown = cls === 'town';
    // one irregular hull per seed — filled as opaque cleared ground, clipped to
    // for the block fabric, then stroked as the wall. This is the fix for
    // "little houses but the ground is still grass": the built-up area is now
    // packed earth, so no biome ever shows between the roofs.
    const segs = isCity ? (scale >= 1.5 ? 22 : 16) : isTown ? 14 : 11;
    const hull = hullPoints(id, sx, sy, R, segs, isCity ? 0.52 : 0.46, isCity ? 0.12 : 0.2, 40);
    if (!waterborne) {
      if (cls !== 'tavern') { // the foodshed: tilled fields ring every settlement
        const fringe = hullPoints(id, sx, sy, R * (isCity || isTown ? 1.3 : 1.4), segs, isCity ? 0.52 : 0.46, isCity ? 0.12 : 0.2, 40);
        ctx.fillStyle = 'rgba(150,138,84,0.34)';
        tracePoly(fringe); ctx.fill();
      }
      ctx.fillStyle = '#b3a271'; // opaque packed earth — the cleared ground itself
      tracePoly(hull); ctx.fill();
      ctx.fillStyle = 'rgba(120,100,72,0.45)'; // the busy trodden heart reads darker
      ctx.beginPath(); ctx.arc(sx, sy, R * 0.42, 0, 7); ctx.fill();
    }
    if ((isCity || isTown) && !waterborne) {
      // BLOCK FABRIC: a dense, jittered, rotated grid of rooftops clipped to the
      // hull. The THIN insets between blocks are the streets (packed earth, never
      // grass), so it reads as a continuous roofscape — a CITY, not a scatter of
      // huts on a lawn. Cheap fillRects (≤256), lighter than the old 240 rotated
      // house sprites, so perf parity holds. Denser + smaller as the city grows.
      ctx.save();
      tracePoly(hull); ctx.clip();
      ctx.translate(sx, sy);
      ctx.rotate(rn(7) * Math.PI);
      const gridN = isCity ? Math.max(9, Math.min(16, Math.round(4 * Math.sqrt(scale) + 6))) : 7;
      const cell = (R * 1.95) / gridN;
      for (let gy = 0; gy < gridN; gy++) {
        for (let gx = 0; gx < gridN; gx++) {
          const seed = 100 + gy * 20 + gx;
          if (rn(seed) < 0.08) continue; // an occasional yard, plaza or empty lot
          const inset = cell * (0.08 + rn(seed + 400) * 0.1); // a thin street gap
          const bw = Math.max(1, cell - inset * 2), bh = Math.max(1, cell - inset * 2);
          const lx = (gx - (gridN - 1) / 2) * cell + (rn(seed + 800) - 0.5) * cell * 0.18;
          const ly = (gy - (gridN - 1) / 2) * cell + (rn(seed + 1200) - 0.5) * cell * 0.18;
          ctx.fillStyle = ROOF_TONES[(gx + gy * 3 + (h32(id, gx * 37 + gy) & 3)) % ROOF_TONES.length]!;
          ctx.fillRect(lx - bw / 2, ly - bh / 2, bw, bh);
        }
      }
      ctx.restore();
      // trunk avenues cut across the fabric on top — the roads INTO the city
      ctx.strokeStyle = 'rgba(198,180,124,0.85)';
      ctx.lineWidth = Math.max(1.5, bpx * 0.03);
      ctx.lineCap = 'round';
      const a0 = rn(90) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(sx - Math.cos(a0) * R, sy - Math.sin(a0) * R);
      ctx.lineTo(sx + Math.cos(a0) * R, sy + Math.sin(a0) * R);
      const a1 = a0 + Math.PI / 2 + (rn(91) - 0.5) * 0.5;
      ctx.moveTo(sx - Math.cos(a1) * R * 0.9, sy - Math.sin(a1) * R * 0.9);
      ctx.lineTo(sx + Math.cos(a1) * R * 0.9, sy + Math.sin(a1) * R * 0.9);
      ctx.stroke();
    } else {
      // village / hamlet: a farming community — a lane through it, a green off
      // the lane, cottages clustered along the way, and a chapel at its heart
      // (the village equivalent of the city keep). A lone tavern stays a single
      // house; a raft village stays a bare scatter.
      const tiny = cls === 'tavern';
      if (!tiny && !waterborne) {
        const la = rn(90) * Math.PI; // the lane runs through
        ctx.strokeStyle = 'rgba(150,132,98,0.85)';
        ctx.lineWidth = Math.max(1, bpx * 0.028); ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(la) * R, sy - Math.sin(la) * R);
        ctx.lineTo(sx + Math.cos(la) * R, sy + Math.sin(la) * R);
        ctx.stroke();
        // a village green: a grassy commons just off the lane
        ctx.fillStyle = 'rgba(120,140,84,0.8)';
        ctx.beginPath();
        ctx.ellipse(sx + Math.cos(la + 1.5) * R * 0.3, sy + Math.sin(la + 1.5) * R * 0.3, R * 0.2, R * 0.14, la, 0, 7);
        ctx.fill();
      }
      const n = Math.min(48, Math.round((HOUSES[cls] ?? 7) * scale ** 1.4));
      for (let i = 0; i < n; i++) {
        const a = rn(i * 3 + 1) * Math.PI * 2;
        const rr = Math.sqrt(rn(i * 3 + 2)) * R * 0.6 * (waterborne ? 0.85 : 1);
        const s = Math.max(1.5, bpx * (tiny ? 0.5 : 0.12)) * (0.7 + rn(i * 3 + 3) * 0.6);
        drawHouse(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, s, rn(i * 7 + 4) * Math.PI);
      }
      if (!tiny && !waterborne && bpx * 0.17 >= 3.5) { // the chapel marks the heart
        drawChapel(sx + (rn(93) - 0.5) * R * 0.3, sy + (rn(94) - 0.5) * R * 0.3, Math.max(3.5, bpx * 0.17), rn(95) * 0.5 - 0.25);
      }
    }
    if (isCity) { // the wall traces the hull, a keep marks the heart
      ctx.strokeStyle = '#4a3b2a';
      ctx.lineWidth = Math.max(1.5, bpx * 0.018);
      ctx.lineJoin = 'round';
      tracePoly(hull); ctx.stroke();
      if (scale >= 1.6) { // a big city keeps its old inner wall inside the sprawl
        const inner = hullPoints(id, sx, sy, R * 0.5, 15, 0.46, 0.1, 70);
        ctx.lineWidth = Math.max(1, bpx * 0.013);
        tracePoly(inner); ctx.stroke();
      }
      const ks = Math.max(3, bpx * 0.07);
      ctx.fillStyle = '#6d5138';
      ctx.fillRect(sx - ks / 2, sy - ks / 2, ks, ks);
      ctx.strokeStyle = 'rgba(25,20,14,0.8)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx - ks / 2, sy - ks / 2, ks, ks);
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
      const pop = Number((ent.fields ?? {}).population ?? 0);
      const scale = scaleOf(cls, pop);
      const px = settleFt(cls, pop) * view.ppf;
      if (px < 12) continue; // too small — the pin carries it
      // once you're INSIDE the place the sketch has done its job: fade it
      // out instead of drawing screen-filling houses (interiors are G5's)
      const maxDim = Math.max(W, H);
      const fade = Math.max(0, Math.min(1, 2 - px / (maxDim * 1.2)));
      if (fade <= 0) { footprinted.set(a.entityId, px); continue; }
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -px || sx > W + px || sy < -px || sy > H + px) continue;
      ctx.globalAlpha = fade;
      drawFootprint(cls, a.entityId, sx, sy, px, a.icon === 'waterborne', scale);
      ctx.globalAlpha = 1;
      footprinted.set(a.entityId, px);
    }
  }

  const TIER_FT: Record<string, number> = { world: 316800, region: 31680, locale: 500 };
  // settlement visibility follows POPULATION (owner, batch 11): a
  // million-soul metropolis and capitals read at world scale, quarter-million
  // cities at the next band, 50k at the next, everything by street level
  function visibilityFt(a: { tier: string; promoted?: boolean }, ent: { kind: string; fields?: Record<string, unknown> }): number {
    let rung: number;
    if (ent.kind === 'settlement') {
      const pop = Number((ent.fields ?? {}).population ?? 0);
      // Only WORLD-class cities are unconditional: "1M+ always shows" put
      // ~500 pins on the full-Earth view at once and the map read as a rash
      // (audit #39 V1). The ladder now steps: alpha cities always, millionaire
      // cities one zoom notch in, quarter-million towns the notch after.
      rung = pop >= 8_000_000 ? Infinity
        : pop >= 4_000_000 ? 1_200_000
        : pop >= 1_000_000 ? 316_800
        : pop >= 250_000 ? 150_000
        : pop >= 50_000 ? 31680
        : pop >= 1_000 ? 5280
        : 500;
    } else {
      rung = TIER_FT[a.tier] ?? 31680;
    }
    // Promotion FLOORS visibility at the millionaire rung instead of bypassing
    // declutter (owner, D12): a promoted pin reads from a continent away — but
    // not from space. The bake's 264 promoted cities were the last world-zoom
    // crowd (V1's second half); the census can only raise the floor, never cut it.
    return Math.max(rung, a.promoted ? 316_800 : 0);
  }
  /**
   * Is this anchor actually ON the map right now? The hit-test MUST ask the same
   * question the draw does, or a tap selects something that isn't there — a pin
   * after the pins layer was switched off, or a small town's pin the zoom has
   * decluttered away. `drawAnchors` (draw) and `select` (pick) share this one
   * predicate so they cannot drift; they had drifted, and tapping where a hidden
   * pin used to be still opened its card.
   */
  function anchorVisible(
    a: { entityId: string; tier: string; icon?: string; promoted?: boolean },
    ent: { kind: string; deleted?: boolean; fields?: Record<string, unknown> } | undefined,
  ): boolean {
    if (!ent || ent.deleted) return false;
    const visFt = visibilityFt(a, ent);
    // decluttered at this zoom (only alpha metropolises always show; a
    // promotion floors visFt at the millionaire rung inside visibilityFt, D12)
    if (visFt !== Infinity && visFt * view.ppf < 4) return false;
    if (a.icon === 'label') {
      // a name written on the map: geography rides the "labels" toggle, a realm's
      // own name rides "realms" (the political layer), and a hidden claim's name
      // goes with it. Mirrors the label branch of drawAnchors exactly.
      const pol = claimColor.get(a.entityId);
      if (pol ? !showRealms.checked : !showLabels.checked) return false;
      if (hiddenClaims.has(a.entityId)) return false;
      return true;
    }
    return showPins.checked; // everything else is a pin
  }
  // ---------- label placement (M4 declutter, batch 28) ----------
  // Every map name goes through one queue: higher-priority labels place
  // first, and anything that would overlap an already-placed name stays
  // silent this frame (the pin still shows; the name returns with room).
  interface LabelReq { x: number; y: number; text: string; font: string; size: number; fill: string; prio: number }
  function placeLabels(queue: LabelReq[]): void {
    queue.sort((a, b) => b.prio - a.prio);
    const boxes: Array<[number, number, number, number]> = [];
    // The legend is map furniture: a name that slides under it is unreadable
    // (audit V6 — "Calheim", "Crimson M…"). Its rect joins the occupied boxes
    // FIRST, so every label treats it exactly like another placed name.
    const legendEl = host.querySelector<HTMLElement>('.mv-legend');
    if (legendEl) {
      const cr = canvas.getBoundingClientRect(), lr = legendEl.getBoundingClientRect();
      boxes.push([lr.left - cr.left - 4, lr.top - cr.top - 4, lr.width + 8, lr.height + 8]);
    }
    for (const L of queue) {
      ctx.font = L.font;
      const w = ctx.measureText(L.text).width + 6;
      const h = L.size + 4;
      // a name at the viewport edge nudges back on screen — by at most half
      // its width, so it stays visibly tied to its anchor (V6's other half)
      let lx = L.x;
      if (lx - w / 2 < 2) lx = Math.min(L.x + w / 2, 2 + w / 2);
      else if (lx + w / 2 > W - 2) lx = Math.max(L.x - w / 2, W - 2 - w / 2);
      const bx = lx - w / 2, by = L.y - L.size;
      let hit = false;
      for (const [ox, oy, ow, oh] of boxes) {
        if (bx < ox + ow && bx + w > ox && by < oy + oh && by + h > oy) { hit = true; break; }
      }
      if (hit) continue;
      boxes.push([bx, by, w, h]);
      // A HALO, not a drop shadow (owner, item #26). A 1px dark offset does
      // nothing for a realm's name, because a realm's name is drawn in its own
      // territory's colour — a pale gold or sage that sits right on top of
      // savanna and grass. The map already strokes its selected-hex caption
      // this way; labels never got it.
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.5, L.size * 0.3);
      ctx.strokeStyle = 'rgba(10,14,20,0.9)';
      ctx.strokeText(L.text, lx, L.y);
      ctx.fillStyle = L.fill;
      ctx.fillText(L.text, lx, L.y);
    }
  }
  function drawAnchors(): void {
    // NB: no `if (!showPins.checked) return` here any more. Realm names and the
    // named geography are ALSO drawn from this loop, so bailing out at the top
    // made the whole political layer hostage to the pin toggle (owner, item
    // #27). The pin check now sits on the pins themselves, below.
    ctx.textAlign = 'center';
    const labels: LabelReq[] = [];
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      // one visibility rule for draw AND hit-test (anchorVisible): deleted,
      // zoom-declutter, and every layer toggle (labels/realms/pins/hidden claim)
      if (!anchorVisible(a, ent as { kind: string; deleted?: boolean; fields?: Record<string, unknown> })) continue;
      const visFt = visibilityFt(a, ent as { kind: string; fields?: Record<string, unknown> });
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -260 || sx > W + 260 || sy < -40 || sy > H + 40) continue;
      if (a.icon === 'label') {
        // a name written on the map itself — oceans, ranges, lakes, the
        // continent, and POLITICAL owners (batch 13): a claim owner's name
        // takes its territory's color (visibility settled by anchorVisible)
        const pol = claimColor.get(a.entityId);
        const size = Math.max(13, Math.min(30, (TIER_FT[a.tier] ?? 316800) * view.ppf * 0.09));
        labels.push({ x: sx, y: sy, text: ent.name, size,
          font: `italic ${size}px Georgia, 'Times New Roman', serif`,
          fill: pol ?? 'rgba(240,236,222,0.82)',
          prio: pol ? 90 : a.tier === 'world' ? 80 : 60 });
        continue;
      }
      // everything below here IS a pin; anchorVisible already applied the pins toggle
      const waterborne = a.icon === 'waterborne';
      // grain feeder towns wear a wheat sheaf (batch 42) so the country that
      // FEEDS a city reads at a glance, distinct from an ordinary market town
      const isFarmTown = (ent.tags ?? []).includes('farm-town');
      // industrial camps wear their trade's tool (batch 49): a mine ⛏, a
      // lumber camp 🪓, a stock town 🐎 — the working country reads at a glance
      const indTag = (ent.tags ?? []).find((t) => t.startsWith('industry-'));
      const INDUSTRY_GLYPH: Record<string, string> = {
        mine: '⛏️', quarry: '🪨', lumber: '🪓', ranch: '🐎', saltern: '🧂',
      };
      const glyph = isFarmTown ? '🌾'
        : indTag ? (INDUSTRY_GLYPH[indTag.slice('industry-'.length)] ?? '⚒️')
        : (ANCHOR_ICON[a.icon ?? ''] ?? KIND_ICON[ent.kind]);
      // a luxury-trade town wears a richer gold ring and a small ✦ (batch 50):
      // its warehouses carry gems, spice, furs — wealth beyond its own fields
      const prosperous = (ent.tags ?? []).includes('prosperous');
      const ring = waterborne ? '#6fd3e0' : prosperous ? '#ffd24a' : '#ffd479';
      const drawWealth = (px3: number, py3: number): void => {
        ctx.font = '9px system-ui';
        ctx.fillStyle = 'rgba(20,16,6,0.85)';
        ctx.fillText('✦', px3 + 0.4, py3 + 3.4);
        ctx.fillStyle = 'rgba(255,214,74,0.98)';
        ctx.fillText('✦', px3, py3 + 3);
      };
      // name priority follows the visibility ladder: metropolises outrank
      // cities outrank towns — the atlas rule, applied to collisions too
      const prio = Math.max(a.promoted ? 70 : 0,
        visFt === Infinity ? 75 : visFt >= 316800 ? 65 : visFt >= 31680 ? 55 : visFt >= 5280 ? 45 : 35);
      // a lit portal crowns its metropolis (batch 40): the ⚡ spark marks
      // where the network answers, and douses with the legend toggle
      const portalHere = ent.kind === 'settlement'
        && Number((ent.fields ?? {}).population ?? 0) >= 500_000
        && travelSettings().portalNetwork !== false;
      const drawSpark = (px3: number, py3: number): void => {
        ctx.fillStyle = 'rgba(30,18,44,0.9)';
        ctx.beginPath(); ctx.arc(px3, py3, 6, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(205,130,255,0.95)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(px3, py3, 6, 0, 7); ctx.stroke();
        ctx.font = '8px system-ui';
        ctx.fillStyle = 'rgba(225,170,255,1)';
        ctx.fillText('⚡', px3, py3 + 3);
      };
      let labelY: number;
      const footPx = footprinted.get(a.entityId);
      if (footPx !== undefined) {
        // the footprint art IS the marker now — just name it
        labels.push({ x: sx, y: sy - footPx / 2 - 5, text: ent.name, size: 13, font: '13px system-ui', fill: '#f4efdf', prio });
        if (portalHere) drawSpark(sx + footPx / 2 * 0.7, sy - footPx / 2 * 0.7);
        if (prosperous) drawWealth(sx - footPx / 2 * 0.7, sy - footPx / 2 * 0.7);
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
        if (prosperous) drawWealth(sx + 9, sy - 9);
        labelY = sy - 16;
      } else {
        ctx.fillStyle = '#1c2129';
        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill();
        ctx.strokeStyle = ring; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.stroke();
        if (prosperous) drawWealth(sx + 6, sy - 6);
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
      if (portalHere) drawSpark(sx + (glyph ? 10 : 6), sy - (glyph ? 10 : 6));
      labels.push({ x: sx, y: labelY, text: ent.name, size: 13, font: '13px system-ui', fill: '#f4efdf', prio });
    }
    placeLabels(labels);
  }

  const FT_PER_KM = 3280.84;
  function niceScale(): [number, string] {
    // storage is always feet; display honors settings.unitsDisplay (Q21).
    // under a mile, count in FEET (or metres) rather than decimal miles (batch 47)
    const metric = (world as { settings?: { unitsDisplay?: string } }).settings?.unitsDisplay === 'metric';
    const targetFt = 120 / view.ppf;
    const bigUnit = metric ? FT_PER_KM : 5280;
    const smallUnit = metric ? 3.28084 : 1; // m or ft
    if (targetFt < bigUnit) {
      const smallSteps = metric ? [10, 25, 50, 100, 250, 500] : [50, 100, 250, 500, 1000, 2500];
      const units = targetFt / smallUnit;
      let best = smallSteps[0]!;
      for (const s of smallSteps) if (s <= units) best = s;
      return [best * smallUnit, `${best} ${metric ? 'm' : 'ft'}`];
    }
    const perUnit = bigUnit;
    const units = targetFt / perUnit;
    const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
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
  let texSig = ''; // what the cached texture was built FROM
  const TEXW = 1024, TEXH = 512; // 4× the old fidelity (owner, batch 25)
  const PREW = 256, PREH = 128;  // the progressive first paint (audit V19)
  let refineToken = 0;
  /** Fill equirect rows [j0, j1) of a w×h texture with terrain colors. */
  function paintTexRows(d: Uint8ClampedArray, w: number, h: number, j0: number, j1: number): void {
    for (let j = j0; j < j1; j++) {
      const y = ((j + 0.5) / h - 0.5) * cfg.heightFt;
      for (let i = 0; i < w; i++) {
        const x = ((i + 0.5) / w) * cfg.circumFt;
        const e = elevationAt(cfg, x, y, 5);
        const b = (paintedBiomeAt(x, y) as BiomeId | null) ?? biomeAt(cfg, x, y, 5);
        let [r, g, bl] = COLORS[b];
        if (b === 'deep' || b === 'water') {
          // ~20% brighter than the first cut — the audit globe read as a night
          // side next to the bright flat map (#39 V5)
          const f = Math.max(0, Math.min(1, (e - 0.3) / 0.2));
          r = 36 + 40 * f; g = 58 + 70 * f; bl = 86 + 84 * f;
        } else {
          const f = 0.95 + (e - 0.5) * 0.7;
          r *= f; g *= f; bl *= f;
        }
        const k = (j * w + i) * 4;
        d[k] = r; d[k + 1] = g; d[k + 2] = bl; d[k + 3] = 255;
      }
    }
  }
  /** Composite the great rivers onto the equirect and return the final
   *  ImageData — they ride the "rivers" layer toggle exactly like the flat
   *  map (a toggle flip re-keys the texture). */
  function finishTex(img: ImageData, w: number, h: number): ImageData {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const octx = off.getContext('2d')!;
    octx.putImageData(img, 0, 0);
    if (showRivers.checked) {
      octx.strokeStyle = 'rgba(66,106,148,0.9)';
      octx.lineJoin = 'round';
      const ws = w / TEXW; // river widths were tuned at full res
      for (const rt of plane.routes ?? []) {
        if (rt.kind !== 'river' || (rt.w ?? 1) < 2) continue;
        octx.lineWidth = Math.max(0.5, ((rt.w ?? 2) >= 3 ? 1.7 : 1.0) * ws);
        octx.beginPath();
        let pu = -1;
        for (const [x, y] of rt.pts) {
          const u = (((x / cfg.circumFt) % 1 + 1) % 1) * w;
          const v = (y / cfg.heightFt + 0.5) * h;
          if (pu >= 0 && Math.abs(u - pu) < w / 2) octx.lineTo(u, v);
          else octx.moveTo(u, v);
          pu = u;
        }
        octx.stroke();
      }
    }
    return octx.getImageData(0, 0, w, h);
  }
  function buildGlobeTexture(): void {
    // The texture is a cache of (terrain + paint + rivers-toggle): key it on
    // those, or painted lakes never reach the globe and the rivers layer
    // toggle is ignored there (the globe must obey the legend — item #34).
    const sig = `${terrainEpoch}|${showRivers.checked ? 1 : 0}`;
    if (tex && texSig === sig) return;
    texSig = sig;
    const token = ++refineToken;
    // PROGRESSIVE first paint (audit V19): the full 1024×512 bake is ~524k
    // noise samples and blocked the main thread ~7.5s before the sphere ever
    // appeared. A 256×128 preview costs 1/16 of that — the globe shows in
    // well under a second, soft — and the full texture then bakes 2 rows per
    // event-loop turn and swaps in seamlessly (the spin repaints every frame;
    // a still globe gets one explicit redraw).
    const pre = new ImageData(PREW, PREH);
    paintTexRows(pre.data, PREW, PREH, 0, PREH);
    tex = finishTex(pre, PREW, PREH);
    const full = new ImageData(TEXW, TEXH);
    let row = 0;
    const step = (): void => {
      if (token !== refineToken) return; // superseded — terrain or toggles changed
      const end = Math.min(TEXH, row + 2);
      paintTexRows(full.data, TEXW, TEXH, row, end);
      row = end;
      if (row < TEXH) { setTimeout(step, 0); return; }
      tex = finishTex(full, TEXW, TEXH);
      if (globeMode && !(autoSpin && !globeDragging)) drawGlobe();
    };
    setTimeout(step, 0);
  }
  function drawGlobe(): void {
    buildGlobeTexture(); // no-op when the cached texture's inputs are unchanged
    if (!tex) return;
    const R = Math.min(W, H) * 0.42;
    const cx = W / 2, cy = H / 2;
    const S = Math.max(2, Math.floor(2 * R * DPR));
    const img = ctx.createImageData(S, S);
    const o = img.data, td = tex.data;
    const half = S / 2, Rd = R * DPR;
    const ct = Math.cos(globeTilt), st = Math.sin(globeTilt);
    const tw = tex.width, th = tex.height;
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
        // bilinear sample against the texture's OWN size — during the V19
        // progressive bake this is the soft 256×128 preview, then full res
        const fu = u * tw - 0.5, fv = v * th - 0.5;
        const i0 = Math.floor(fu), j0 = Math.max(0, Math.min(th - 2, Math.floor(fv)));
        const du = fu - i0, dv = fv - j0;
        const i0w = ((i0 % tw) + tw) % tw, i1w = (i0w + 1) % tw;
        const t00 = (j0 * tw + i0w) * 4, t10 = (j0 * tw + i1w) * 4;
        const t01 = ((j0 + 1) * tw + i0w) * 4, t11 = ((j0 + 1) * tw + i1w) * 4;
        const shade = 0.74 + 0.26 * Math.pow(nz, 0.8); // limb darkening, gentler than the first cut (#39 V5)
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
    // capitals ride the sphere — behind the same layer toggles as the flat
    // map: the dot is a PIN, the name is a LABEL (globe obeys the legend)
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    if (showPins.checked || showLabels.checked) {
      const cands: Array<{ sx: number; sy: number; name: string; pop: number; nzA: number }> = [];
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
        if (showPins.checked) {
          ctx.fillStyle = '#ffd479';
          ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, 7); ctx.fill();
        }
        cands.push({ sx, sy, name: ent.name, pop: Number((ent.fields ?? {}).population ?? 0), nzA });
      }
      // Names collision-thin, biggest city first, and fade toward the limb —
      // every near-side capital used to print its name at full strength, and
      // the audit globe wore an unreadable smear over each dense coast (#39 V5)
      if (showLabels.checked) {
        cands.sort((p, q) => q.pop - p.pop);
        const used: Array<[number, number, number, number]> = [];
        for (const c of cands) {
          if (c.nzA < 0.3) continue; // too foreshortened to read at the limb
          const w = ctx.measureText(c.name).width + 8, h = 14;
          const bx = c.sx - w / 2, by = c.sy - 18;
          if (used.some(([ox, oy, ow, oh]) => bx < ox + ow && bx + w > ox && by < oy + oh && by + h > oy)) continue;
          used.push([bx, by, w, h]);
          ctx.fillStyle = `rgba(244,239,223,${(0.45 + 0.5 * c.nzA).toFixed(2)})`;
          ctx.fillText(c.name, c.sx, c.sy - 6);
        }
      }
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
  partyBtn.addEventListener('click', () => {
    exitPaint();
    hexInfo.hidden = false;
    hexInfo.innerHTML = '<b>🚩 The party</b> — tap where they stand (teleportation goes anywhere)';
    pickPending = (x, y) => {
      plane.party = { x: Math.round(x), y: Math.round(y) };
      cb.onClaimsEdited?.(); // persist the camp
      repaint();
    };
  });
  // Travel stops live on the WORLD lattice (60-mi hexes), where a tap on a
  // coastal city — or anywhere on land narrower than a hex, like the toe of a
  // peninsula — often lands in the SEA's half of its hex, and the planner
  // refuses to start or end in open water (V25: "No route" from your own
  // port). Snap a watery pick to the walkable world hex nearest the tap
  // within two rings (~120 mi); a true open-ocean pick stays put, and the
  // banner still says why nothing plans.
  function travelStopAt(x: number, y: number): [number, number] {
    const xn = ((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    const [q0, r0] = pointToHex(WORLD_TI, xn, y);
    const walkable = (q2: number, r2: number): boolean => {
      const b2 = hexInfoAt(WORLD_TI, q2, r2).b;
      return b2 !== 'water' && b2 !== 'deep';
    };
    if (walkable(q0, r0)) return [q0, r0];
    for (let ring = 1; ring <= 2; ring++) {
      let bq = 0, br = 0, bd = Infinity;
      let cq = q0, cr = r0 - ring; // ring corner (EDGE_DIRS[4] scaled), then walk the six sides
      for (const [dq, dr] of EDGE_DIRS) {
        for (let s2 = 0; s2 < ring; s2++) {
          if (walkable(cq, cr)) {
            const [hx2, hy2] = hexCenter(WORLD_TI, cq, cr);
            const d2 = Math.abs(wrapDx(hx2 - xn)) + Math.abs(hy2 - y);
            if (d2 < bd) { bd = d2; bq = cq; br = cr; }
          }
          cq += dq; cr += dr;
        }
      }
      if (bd < Infinity) return [bq, br];
    }
    return [q0, r0];
  }
  travelBtn.addEventListener('click', () => {
    exitPaint();
    travelPlan = null;
    customPlan = null;
    travelStops = [];
    repaint();
    const pickDest = (): void => {
      pickPending = (x2, y2) => {
        travelStops.push(travelStopAt(x2, y2));
        showTravelPlan(); // plans every mode combination from here — "＋ stop" adds more
        repaint();
      };
    };
    if (plane.party) { // the journey starts where the party stands
      travelStops = [travelStopAt(plane.party.x, plane.party.y)];
      hexInfo.hidden = false;
      hexInfo.innerHTML = '<b>🥾 Travel time</b> — from the party 🚩: tap the DESTINATION';
      pickDest();
      return;
    }
    travelPrompt(1);
    pickPending = (x1, y1) => {
      travelStops = [travelStopAt(x1, y1)];
      travelPrompt(2);
      pickDest();
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
  // mid-zoom-gesture: draw() scales the terrain buffer instead of re-rendering it,
  // and a short debounce re-renders crisp once the wheel/pinch stops.
  let zooming = false, zoomSettle = 0;

  // ---------- the terrain buffer (pan smoothness) ----------
  //
  // The terrain — thousands of filled hexagons a frame — is the map's dominant
  // draw cost (measured: ~50 ms at the continental view, half the frame). But at
  // a FIXED zoom it is invariant up to a screen translation: pan a few pixels and
  // every hex is the same colour in the same world place, just shifted. So render
  // it ONCE into an offscreen canvas a margin wider than the viewport, and while
  // panning within that margin, blit the buffer at the shifted offset instead of
  // re-drawing every hexagon. A pan frame drops from ~50 ms to a single drawImage.
  //
  // The buffer is re-rendered only when it can no longer answer the question:
  // the zoom changed, a biome was painted (terrainEpoch), a layer toggle or the
  // canvas size changed, the art marks moved (anchor count), or the pan has
  // carried the viewport past the buffer's margin. All of that is folded into a
  // signature compared each frame; nothing else needs to invalidate by hand.
  //
  // Zoom IS accelerated too (owner: "zooming to the finest grain is still
  // extremely slow"): a wheel notch changes ppf, and re-rasterising thousands of
  // hexes + per-hex art every notch is the ~50ms cost. But the buffer is a
  // picture of the terrain — during a zoom gesture, blit it SCALED (one
  // drawImage) for instant, slightly-soft feedback, and re-render crisp once the
  // wheel settles (the `zooming` debounce below). So the signature is split: the
  // ppf lives apart (a pure zoom scales the blit), everything else forces a real
  // re-render as before.
  const TBUF_MARGIN = 224; // px of slack around the viewport before a re-render
  let tbuf: HTMLCanvasElement | null = null;
  let tbctx: CanvasRenderingContext2D | null = null;
  let tbufStatic = '', tbufPpf = 0, tbufX = 0, tbufY = 0, tbufW = 0, tbufH = 0;
  // true when the buffer was rendered mid-gesture WITHOUT its crossfade
  // veils — the settle re-render swaps in the full picture
  let tbufCheap = false;
  const terrainStaticSig = (): string =>
    `${showArt.checked ? 1 : 0}|${showRelief.checked ? 1 : 0}|${terrainEpoch}|${(plane.anchors ?? []).length}|${W}x${H}x${DPR}`;
  function renderTerrainBuffer(cheap = false): void {
    // never let the fine-grain band start a render that will thrash the
    // hexInfo cache mid-way — sweep BETWEEN renders, keep room for ~170k.
    // UNLESS the settle sweep just warmed this exact view (batch 277): then
    // the cache holds precisely what this render is about to read, and
    // clearing it would re-run the cold evaluation the sweep just amortised.
    if (cache.size > 220000 && warmDone !== warmSig()) cache.clear();
    const cssW = W + 2 * TBUF_MARGIN, cssH = H + 2 * TBUF_MARGIN;
    if (!tbuf) { tbuf = document.createElement('canvas'); tbctx = tbuf.getContext('2d')!; }
    const pxW = Math.ceil(cssW * DPR), pxH = Math.ceil(cssH * DPR);
    if (tbuf.width !== pxW || tbuf.height !== pxH) { tbuf.width = pxW; tbuf.height = pxH; }
    // point the shared ctx/W/H at the buffer so drawTier renders into it, centred
    // (toScreen keys off W/2,H/2, so the wider W,H push the viewport-equivalent
    // region to the buffer's middle and draw the margin all around it)
    const sCtx = ctx, sW = W, sH = H;
    ctx = tbctx!; W = cssW; H = cssH;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgb(29,47,71)';
    ctx.fillRect(0, 0, cssW, cssH);
    // Mid-gesture (cheap), the base tier also rides a coarser floor: a base
    // sitting at 8–14px is ~25k–50k hexes, and first-touch field evaluation
    // for a fresh band ran ~0.5s INSIDE the wheel gesture. The scaled blit
    // is already carrying the fine texture from the previous buffer; the
    // gesture render only needs to fill the uncovered margin, and the
    // settle pass paints the true base ~130ms after the wheel stops.
    let baseTi8 = 0, baseTi = 0;
    for (let i = 0; i < TIERS.length; i++) {
      if (TIERS[i]!.hexFt * view.ppf >= 8) baseTi8 = i;
      if (TIERS[i]!.hexFt * view.ppf >= (cheap ? 14 : 8)) baseTi = i;
    }
    let owesSettle = baseTi !== baseTi8;
    for (let ti = baseTi; ti < TIERS.length; ti++) {
      const a = ti === baseTi ? 1 : tierAlpha(ti);
      if (a <= 0) break;
      // Mid-gesture, skip the crossfade veils too: an overlay tier is 4–8px
      // hexes — 50k–190k of them for a translucent texture, the 1.7-SECOND
      // freeze the deep-zoom audit caught while wheeling out at fine grain.
      if (cheap && ti !== baseTi) { owesSettle = true; break; }
      drawTier(ti, a);
    }
    ctx = sCtx; W = sW; H = sH;
    tbufX = view.x; tbufY = view.y; tbufW = cssW; tbufH = cssH;
    tbufStatic = terrainStaticSig(); tbufPpf = view.ppf;
    tbufCheap = owesSettle; // only a render that actually cut a corner owes a settle pass
  }

  // ---------- the chunked settle sweep (deep-zoom follow-up, batch 277) ----------
  // Batch 271 stopped the freeze inside the GESTURE by never rendering for
  // coverage mid-wheel — but the settle render of a never-visited band still
  // paid ~0.5s of cold field evaluation in a single frame, at rest. Same
  // medicine, finer dose: before any non-forced terrain render, sweep the
  // exact hex set the render will read through hexInfoAt in ≤8ms rAF slices.
  // The memo cache IS the progress — an aborted sweep loses nothing and a
  // restarted one skips its warm prefix at Map.get speed — so when the sweep
  // completes, the render it gates is the measured ~60ms warm render. The
  // stale buffer keeps blitting meanwhile (background can show at its edges
  // for a few frames, the trade the gesture already made); crispness arrives
  // as soon as it can be paid for without ever blocking a frame.
  const WARM_BUDGET_MS = 8;
  let warmJob = 0; // rAF id of the pending slice (0 = idle)
  let warmTi = -1, warmR = NaN, warmQ = NaN; // sweep cursor (-1 = fresh)
  let warmFor = '';  // the quantized view+static signature the cursor serves
  let warmDone = ''; // the last signature a sweep fully completed for
  // x/y quantized to half the buffer margin: a small pan keeps the cursor,
  // a real move restarts the sweep (whose warm prefix then skips fast)
  const warmSig = (): string =>
    `${Math.round(view.x * view.ppf / (TBUF_MARGIN / 2))},${Math.round(view.y * view.ppf / (TBUF_MARGIN / 2))}` +
    `|${view.ppf}|${terrainStaticSig()}`;
  /** One budgeted slice of the sweep. True = the whole set is warm. */
  function warmSlice(): boolean {
    const sig = warmSig();
    if (warmDone === sig) return true;
    if (warmFor !== sig) {
      warmFor = sig; warmTi = -1;
      // make room up front so the sweep itself can never trip hexInfoAt's
      // 300k in-fill clear halfway through and lose its own warm prefix
      if (cache.size > 220000) cache.clear();
    }
    const cssW = W + 2 * TBUF_MARGIN, cssH = H + 2 * TBUF_MARGIN;
    // the settle render's exact tier list: the 8px base + every veil above it
    let baseTi = 0;
    for (let i = 0; i < TIERS.length; i++) if (TIERS[i]!.hexFt * view.ppf >= 8) baseTi = i;
    if (warmTi < 0) { warmTi = baseTi; warmR = NaN; warmQ = NaN; }
    const t0 = performance.now();
    let n = 0;
    for (; warmTi < TIERS.length; warmTi++, warmR = NaN) {
      if (warmTi !== baseTi && tierAlpha(warmTi) <= 0) break;
      // drawTier's own range math at the buffer's width/height (renderTerrain-
      // Buffer renders centred into viewport + 2×margin)
      const R = hexR(warmTi), Rpx = R * view.ppf;
      const y0 = view.y - (cssH / 2 + Rpx * 2) / view.ppf, y1 = view.y + (cssH / 2 + Rpx * 2) / view.ppf;
      const rMin = Math.floor((2 / 3 * y0) / R) - 1, rMax = Math.ceil((2 / 3 * y1) / R) + 1;
      const halfSpanX = (cssW / 2 + Rpx * 2) / view.ppf;
      const qSpan = Math.ceil((SQ3 / 3 * halfSpanX) / R) + 2;
      if (Number.isNaN(warmR)) { warmR = rMin; warmQ = NaN; }
      for (; warmR <= rMax; warmR++, warmQ = NaN) {
        if (Math.abs(1.5 * R * warmR) > cfg.heightFt / 2 + R * 2) continue; // bounded N–S
        const qc = (SQ3 / 3 * view.x) / R - warmR / 2;
        const q1 = Math.ceil(qc + qSpan);
        if (Number.isNaN(warmQ)) warmQ = Math.floor(qc - qSpan);
        for (; warmQ <= q1; warmQ++) {
          hexInfoAt(warmTi, warmQ, warmR);
          if (++n >= 128) {
            n = 0;
            if (performance.now() - t0 >= WARM_BUDGET_MS) return false;
          }
        }
      }
    }
    warmDone = warmFor;
    return true;
  }
  /** Keep slicing in the background until the sweep completes, then repaint. */
  function ensureWarmJob(): void {
    if (warmJob) return;
    const step = (): void => {
      warmJob = 0;
      // a new gesture supersedes the sweep (the settle draw revives it), and
      // a torn-down map (remount, interior descent) must not keep sweeping
      if (zooming || !canvas.isConnected) return;
      if (warmSlice()) { repaint(); return; }
      warmJob = requestAnimationFrame(step);
    };
    warmJob = requestAnimationFrame(step);
  }

  // ---------- the political-layer buffer (perf audit P1, 2026-07-18) ----------
  // The full-Earth pan sat at p95 ~58ms with realms on and ~19ms with them
  // off (medians vsync-locked either way): washes over 39k hexes, screenRuns
  // border walks, and their per-frame garbage were REBUILT sixty times a
  // second, and the GC pauses ticked under an otherwise clean pan. But the
  // political picture only changes on a claim edit, a legend toggle, or a
  // zoom settle — the terrain buffer's exact invalidation conditions. Same
  // treatment: drawClaims renders once into a TRANSPARENT buffer (it
  // composites over the terrain blit), and a pan frame costs one drawImage.
  // While a claim brush is down the buffer steps aside and drawClaims runs
  // live — painting bumps claimsEpoch per brushed hex, and re-rendering the
  // whole buffer per hex would make the brush drag.
  let cbuf: HTMLCanvasElement | null = null;
  let cbctx: CanvasRenderingContext2D | null = null;
  let cbufSig = '', cbufPpf = 0, cbufX = 0, cbufY = 0, cbufW = 0, cbufH = 0;
  const claimsSig = (): string =>
    `${showRealms.checked ? 1 : 0}|${claimsEpoch}|${provinceLines ? provinceLines.length : 0}|` +
    `${[...hiddenClaims].sort().join(',')}|${W}x${H}x${DPR}`;
  function renderClaimsBuffer(): void {
    const cssW = W + 2 * TBUF_MARGIN, cssH = H + 2 * TBUF_MARGIN;
    if (!cbuf) { cbuf = document.createElement('canvas'); cbctx = cbuf.getContext('2d')!; }
    const pxW = Math.ceil(cssW * DPR), pxH = Math.ceil(cssH * DPR);
    if (cbuf.width !== pxW || cbuf.height !== pxH) { cbuf.width = pxW; cbuf.height = pxH; }
    const sCtx = ctx, sW = W, sH = H;
    ctx = cbctx!; W = cssW; H = cssH;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    drawClaims();
    ctx = sCtx; W = sW; H = sH;
    cbufX = view.x; cbufY = view.y; cbufW = cssW; cbufH = cssH;
    cbufSig = claimsSig(); cbufPpf = view.ppf;
  }

  // ---------- winds & currents overlay (item #31, owner: "an overlay") ----------
  // A sparse arrow field, off by default (the 🌬 toggle). Winds everywhere on the
  // base grid; ocean currents on the interleaved grid over the sea, so the two
  // sit side by side rather than on top of each other — at a glance, the trade
  // belts and westerlies over the land and the gyres turning on the water. Both
  // are sampled analytically (windField/currentField), so it costs a couple of
  // hundred cheap lookups a frame and never touches the cached terrain buffer.
  function drawWindOverlay(): void {
    if (!showWind.checked) return;
    const STEP = 60;
    const arrow = (sx: number, sy: number, fe: number, fn: number, sea: boolean): void => {
      const spd = Math.hypot(fe, fn);
      if (spd < 0.05) return; // a calm draws nothing
      const dx = fe / spd, dy = -fn / spd; // geographic [east, north] → screen [+x, −y]
      const L = 7 + 9 * Math.min(1, spd / 0.9);
      const a = Math.atan2(dy, dx);
      const alpha = 0.3 + 0.45 * Math.min(1, spd / 0.9);
      ctx.strokeStyle = (sea ? 'rgba(108,196,236,' : 'rgba(238,242,250,') + alpha.toFixed(2) + ')';
      ctx.lineWidth = sea ? 1.6 : 1.2;
      ctx.beginPath();
      ctx.moveTo(sx - dx * L, sy - dy * L);
      ctx.lineTo(sx + dx * L, sy + dy * L);
      ctx.lineTo(sx + dx * L - Math.cos(a - 0.5) * 4.5, sy + dy * L - Math.sin(a - 0.5) * 4.5);
      ctx.moveTo(sx + dx * L, sy + dy * L);
      ctx.lineTo(sx + dx * L - Math.cos(a + 0.5) * 4.5, sy + dy * L - Math.sin(a + 0.5) * 4.5);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    const half = cfg.heightFt / 2;
    for (let sx = STEP / 2; sx < W; sx += STEP) {
      for (let sy = STEP / 2; sy < H; sy += STEP) {
        const [wx, wy] = toWorld(sx, sy);
        if (Math.abs(wy) > half) continue; // beyond the poles
        const [we, wn] = windAt(cfg, wx, wy);
        arrow(sx, sy, we, wn, false);
      }
    }
    for (let sx = STEP; sx < W; sx += STEP) {
      for (let sy = STEP; sy < H; sy += STEP) {
        const [wx, wy] = toWorld(sx, sy);
        if (Math.abs(wy) > half) continue;
        const cur = currentAt(cfg, wx, wy);
        if (cur) arrow(sx, sy, cur[0], cur[1], true);
      }
    }
  }

  function draw(): void {
    raf = 0;
    if (globeMode) { if (cardAt) closeCard(); drawGlobe(); return; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgb(29,47,71)';
    ctx.fillRect(0, 0, W, H);
    // terrain: blit the cached buffer, re-rendering it only on a real miss. A
    // pan shifts the blit; a zoom SCALES it (s = how much the view zoomed since
    // the buffer was drawn). Re-render when a non-zoom input changed (paint,
    // toggle, resize, anchors), when the scaled buffer no longer covers the
    // viewport, when a zoom has SETTLED (want it crisp), or when it's magnified
    // so far the softness shows.
    let dxp = wrapDx(tbufX - view.x) * view.ppf, dyp = (tbufY - view.y) * view.ppf;
    let s = tbuf ? view.ppf / tbufPpf : 1;
    const covers = !!tbuf && tbufW * s >= W + 2 * Math.abs(dxp) && tbufH * s >= H + 2 * Math.abs(dyp);
    const zoomed = Math.abs(s - 1) > 1e-6;
    // Coverage breaks do NOT force a render mid-gesture (deep-zoom audit):
    // zooming out of a fresh band, the forced render ran ~0.5–1.7s of cold
    // field evaluation INSIDE the wheel gesture — a hard freeze. Games ship
    // the alternative: keep blitting the scaled buffer, let its edges run
    // out into the ocean background for the last few notches, and paint the
    // full picture at settle. s>12 keeps the extreme zoom-IN crisp (few
    // hexes, cheap); everything else waits for the wheel to stop.
    const forced = !tbuf || tbufStatic !== terrainStaticSig();
    if (forced || (!covers && !zooming)
      || (zoomed && (!zooming || s > 12)) || (tbufCheap && !zooming)) {
      // Chunked settle (batch 277): a non-forced render of a never-visited
      // band pays ~0.5s of cold field evaluation — never pay it inside a
      // frame. Run one budgeted warm slice now and render only once the
      // sweep reports the band warm (for an already-seen band that is this
      // same frame — a warm sweep is Map.gets); otherwise keep blitting the
      // stale buffer while rAF slices finish the job and repaint. Forced
      // renders (first paint, toggles, paint strokes) still run sync — they
      // must answer immediately; mid-gesture renders stay cheap as before.
      if (forced || zooming || warmSlice()) {
        renderTerrainBuffer(zooming);
        dxp = 0; dyp = 0; s = 1; // freshly centred and 1:1 at the current zoom
      } else ensureWarmJob();
    }
    // 1:1 blit rounds to whole device pixels and copies crisp; a scaled (zooming)
    // blit smooths, since it's magnifying a picture rather than copying it.
    const sm = ctx.imageSmoothingEnabled;
    if (s === 1) { dxp = Math.round(dxp * DPR) / DPR; dyp = Math.round(dyp * DPR) / DPR; ctx.imageSmoothingEnabled = false; }
    else ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tbuf!, (W / 2 + dxp) - tbufW * s / 2, (H / 2 + dyp) - tbufH * s / 2, tbufW * s, tbufH * s);
    ctx.imageSmoothingEnabled = sm;
    // political layer: one composited blit (perf audit P1) — live only while
    // a brush is down (claimsEpoch churns per painted hex)
    if (paintOwner || paintBiome) drawClaims();
    else if (showRealms.checked && claimSets.length) {
      let cdx = wrapDx(cbufX - view.x) * view.ppf, cdy = (cbufY - view.y) * view.ppf;
      let cs = cbuf ? view.ppf / cbufPpf : 1;
      const cCovers = !!cbuf && cbufW * cs >= W + 2 * Math.abs(cdx) && cbufH * cs >= H + 2 * Math.abs(cdy);
      const cZoomed = Math.abs(cs - 1) > 1e-6;
      if (!cbuf || cbufSig !== claimsSig() || (!cCovers && !zooming) || (cZoomed && (!zooming || cs > 12))) {
        renderClaimsBuffer(); // same rule as terrain: no coverage renders mid-gesture
        cdx = 0; cdy = 0; cs = 1;
      }
      const smc = ctx.imageSmoothingEnabled;
      if (cs === 1) { cdx = Math.round(cdx * DPR) / DPR; cdy = Math.round(cdy * DPR) / DPR; ctx.imageSmoothingEnabled = false; }
      else ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cbuf!, (W / 2 + cdx) - cbufW * cs / 2, (H / 2 + cdy) - cbufH * cs / 2, cbufW * cs, cbufH * cs);
      ctx.imageSmoothingEnabled = smc;
    }
    drawRoutes();
    drawFootprints();
    drawGhosts();
    drawResources();
    drawWindOverlay();
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
      // the hex names its own SIZE beneath it, in the border colour (batch 44)
      const hf = TIERS[selected.t]!.hexFt;
      const metricSel = (world as { settings?: { unitsDisplay?: string } }).settings?.unitsDisplay === 'metric';
      const sizeStr = metricSel
        ? (hf >= 3280.84 ? `${Math.round(hf / 3280.84 * 10) / 10} km` : `${Math.round(hf / 3.28084)} m`)
        : (hf >= 5280 ? `${Math.round(hf / 5280 * 10) / 10} mi` : `${Math.round(hf)} ft`);
      ctx.font = '600 12px system-ui';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(14,18,24,0.9)';
      ctx.strokeText(sizeStr, sx, sy + R + 15);
      ctx.fillStyle = '#ffd479';
      ctx.fillText(sizeStr, sx, sy + R + 15);
    }
    if (plane.party) { // 🚩 the party stands here, over everything
      const [px2, py2] = toScreen(plane.party.x, plane.party.y);
      if (px2 > -40 && px2 < W + 40 && py2 > -40 && py2 < H + 40) {
        ctx.strokeStyle = 'rgba(214,69,52,0.95)';
        ctx.fillStyle = 'rgba(214,69,52,0.95)';
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(px2, py2); ctx.lineTo(px2, py2 - 18); ctx.stroke(); // the pole
        ctx.beginPath(); ctx.moveTo(px2, py2 - 18); ctx.lineTo(px2 + 13, py2 - 14.5); ctx.lineTo(px2, py2 - 11); ctx.closePath(); ctx.fill(); // the pennant
        ctx.strokeStyle = 'rgba(244,239,223,0.9)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(px2, py2, 5, 0, 7); ctx.stroke(); // ground ring
      }
    }
    if (travelPlan || customPlan) { // the measured routes ride above everything
      // land legs amber, water legs blue, portal jumps violet, custom pale
      const legKind = (p3: TravelPlan, i: number): string => {
        if (i === 0) return 'x';
        if (p3.modes[i] === 'p') return 'portal';
        if (p3.modes[i] === 'c' || p3.modes[i - 1] === 'c') return 'custom';
        if (p3.modes[i] !== 'w' || p3.modes[i - 1] !== 'w') return 'boat';
        return 'land';
      };
      const LEG_STYLE: Record<string, [string, number, number[]]> = {
        land: ['rgba(255,180,70,0.95)', 3, [8, 6]],
        boat: ['rgba(90,190,235,0.95)', 3, [8, 6]],
        portal: ['rgba(205,130,255,0.9)', 2, [2, 6]],
        custom: ['rgba(235,170,255,0.8)', 2, [4, 7]],
      };
      for (const p3 of [customPlan, travelPlan]) { // custom beneath the main route
        if (!p3) continue;
        for (const kind of ['custom', 'land', 'boat', 'portal']) {
          const [color, lw, dash] = LEG_STYLE[kind]!;
          ctx.setLineDash(dash);
          ctx.beginPath();
          let prevT: [number, number] | null = null;
          let prevWx2: number | null = null;
          for (let i = 0; i < p3.pts.length; i++) {
            const [x2, y2] = p3.pts[i]!;
            // compare WRAPPED offsets like drawRoutes: toScreen wraps every
            // point to the view's half-world, so at the view's ANTIPODE two
            // near points land on opposite screen edges while their raw dx is
            // tiny — the raw test ruled the trip line across the whole map
            const wx2 = wrapDx(x2 - view.x);
            const sx2 = wx2 * view.ppf + W / 2, sy2 = (y2 - view.y) * view.ppf + H / 2;
            const wrapped = prevWx2 !== null && Math.abs(wx2 - prevWx2) > cfg.circumFt / 2;
            if (prevT && legKind(p3, i) === kind && !wrapped) ctx.lineTo(sx2, sy2);
            else ctx.moveTo(sx2, sy2);
            prevT = [sx2, sy2];
            prevWx2 = wx2;
          }
          // a dark casing under the dash (V23, judged from the first real sea
          // shot): amber on dark forest and blue on open water both read at a
          // glance when the dash is lifted off the ground — same path, same
          // dash pattern, two strokes
          ctx.strokeStyle = 'rgba(12,18,26,0.8)'; ctx.lineWidth = lw + 2.4; ctx.stroke();
          ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      // stop markers (batch 47): a numbered dot at each waypoint on the trip
      if (travelStops.length > 2) {
        for (const [i, [q, r]] of travelStops.entries()) {
          const [wx, wy] = hexCenter(WORLD_TI, q, r);
          const [sx2, sy2] = toScreen(wx, wy);
          if (sx2 < -20 || sx2 > W + 20 || sy2 < -20 || sy2 > H + 20) continue;
          ctx.fillStyle = 'rgba(255,180,70,0.95)';
          ctx.beginPath(); ctx.arc(sx2, sy2, 7, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(20,16,10,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#201810'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center';
          ctx.fillText(String(i + 1), sx2, sy2 + 3);
        }
      }
    }
    drawAnchors();
    drawDescendHint(); // "keep zooming to enter" over an enterable pin at the ceiling
    positionCard(); // the card rides its pin through pan and zoom
    scheduleClaimLegend(); // "which realms am I looking at?" (item #29)
    const [ft, label] = niceScale();
    scaleEl.innerHTML = `<span class="mv-unit" title="Switch miles/kilometres">${label}</span><i style="width:${ft * view.ppf}px"></i>`;
    writeViewHash();
  }
  const repaint = () => { if (!raf) raf = requestAnimationFrame(draw); };
  if (cfg.landform === 'earth' && subOwners.size) void loadProvinceLines();

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
  // ─── the locale→site descent (MAPS §3.1, nested-spaces epic) ─────────────
  // The globe's mirror at the OTHER extreme: pushing past the zoom-in
  // ceiling while an enterable pin sits under the gesture crosses into its
  // interior map — world → dungeon in one continuous gesture. A couple of
  // notches must accumulate so a single flick can't teleport you.
  const MAX_PPF = 8;
  let descendCharge = 0;
  let descendCoolT = 0;
  function enterableNear(px: number, py: number, r: number): { id: string; sx: number; sy: number; ax: number; ay: number } | null {
    if (!cb.onEnterSite || !cb.canEnter) return null;
    let best: { id: string; sx: number; sy: number; ax: number; ay: number } | null = null;
    let bestD = r;
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!ent || !anchorVisible(a, ent as { kind: string; deleted?: boolean; fields?: Record<string, unknown> })) continue;
      if (a.icon === 'label' || !cb.canEnter(a.entityId)) continue;
      const [sx, sy] = toScreen(a.x, a.y);
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) { bestD = d; best = { id: a.entityId, sx, sy, ax: a.x, ay: a.y }; }
    }
    return best;
  }
  function drawDescendHint(): void {
    if (view.ppf < MAX_PPF * 0.999) return;
    const t = enterableNear(W / 2, H / 2, Math.min(W, H) * 0.4);
    if (!t) return;
    const charged = descendCharge > 0;
    ctx.beginPath();
    ctx.arc(t.sx, t.sy, charged ? 30 : 24, 0, Math.PI * 2);
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = charged ? 3 : 1.8;
    ctx.strokeStyle = charged ? 'rgba(255,212,121,0.95)' : 'rgba(255,212,121,0.6)';
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '600 11px system-ui';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(14,18,24,0.9)';
    const hint = charged ? 'entering…' : 'keep zooming to enter';
    ctx.strokeText(hint, t.sx, t.sy + (charged ? 46 : 40));
    ctx.fillStyle = 'rgba(255,212,121,0.95)';
    ctx.fillText(hint, t.sx, t.sy + (charged ? 46 : 40));
  }

  const zoomAt = (f: number, px: number, py: number) => {
    // zoom-out floor = the whole world exactly filling the width ("fit
    // world"); pushing past it rolls the map up into the globe
    const minPpf = W > 0 ? W / cfg.circumFt : 6e-6;
    if (f < 1 && view.ppf <= minPpf * 1.0001) { enterGlobe(); return; }
    if (f > 1 && view.ppf >= MAX_PPF * 0.999) {
      // overzoom at the ceiling: charge toward the pin under the gesture
      const t = enterableNear(px, py, 160) ?? enterableNear(W / 2, H / 2, Math.min(W, H) * 0.4);
      if (t) {
        descendCharge++;
        clearTimeout(descendCoolT);
        descendCoolT = window.setTimeout(() => { descendCharge = 0; repaint(); }, 900);
        if (descendCharge >= 3) {
          descendCharge = 0;
          closeCard();
          cb.onEnterSite!(t.id);
          return;
        }
        repaint();
        return;
      }
    }
    if (f < 1) descendCharge = 0;
    const [wx, wy] = toWorld(px, py);
    view.ppf = Math.max(minPpf, Math.min(MAX_PPF, view.ppf * f));
    const [nx, ny] = toWorld(px, py);
    view.x += wrapDx(wx - nx); view.y += wy - ny; clampY();
    // pin magnetism: cursor-anchored zoom MULTIPLIES any offset, so a pin a
    // few px off the cursor is off-screen long before the ceiling — nobody
    // keeps a pin under thirty notches. Deep zoom-in near an enterable pin
    // eases the camera onto it, so the descent gesture can actually land.
    if (f > 1 && view.ppf > 0.5) {
      const t = enterableNear(px, py, 220) ?? enterableNear(W / 2, H / 2, 220);
      if (t) {
        view.x += wrapDx(t.ax - view.x) * 0.3;
        view.y += (t.ay - view.y) * 0.3;
        clampY();
      }
    }
    // scale the cached terrain this frame; re-render crisp when the gesture rests
    zooming = true;
    clearTimeout(zoomSettle);
    zoomSettle = window.setTimeout(() => { zooming = false; repaint(); }, 130);
    repaint();
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

  // ─── the peek card (owner, item #17) ──────────────────────────────────────
  // Tapping a pin called onSelectEntity, and navigate() CLOSES the map — so a
  // glance at a city cost you your place on the map and the zoom back in. The
  // card answers "what is this" where you stand; "More" is that old jump, kept
  // for when you actually want the page, its editor and its cross-links.
  const KIND_LABEL: Record<string, string> = Object.fromEntries(REGISTRY.kinds.map((k) => [k.id, k.label]));
  const MENTION_RE = /\{@e (e_[a-z0-9]{14})(?:\|([^}]*))?\}/g;
  /** Pinned to the entity's WORLD point rather than the tap, so it rides along
   *  with its subject as you pan instead of drifting onto open sea. */
  let cardAt: { id: string; x: number; y: number } | null = null;
  const closeCard = (): void => { cardAt = null; card.hidden = true; };
  const unmention = (s: string): string =>
    s.replace(MENTION_RE, (_m, id: string, label?: string) => label || world.entities[id]?.name || '');

  /** The first prose the page offers — mention syntax flattened, blocks the
   *  author marked secret left out. */
  function briefOf(e: EntityRecord): string {
    const hush = new Set(e.secretBlocks ?? []);
    for (const b of e.body ?? []) {
      if (b.type !== 'paragraph' || hush.has(b.id)) continue;
      const t = unmention(String((b as { text?: string }).text ?? '')).replace(/\s+/g, ' ').trim();
      if (t.length > 2) return t.length > 220 ? t.slice(0, 219).replace(/\s+\S*$/, '') + '…' : t;
    }
    return '';
  }

  /** Up to three hard facts. Scanning past a city, "Population 210,000" tells
   *  you more than another sentence of prose does. */
  function factsOf(e: EntityRecord): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const [k, v] of Object.entries(e.fields ?? {})) {
      if (out.length >= 3 || v === '' || v == null) continue;
      const s = unmention(
        typeof v === 'object' && 'ref' in v ? (world.entities[v.ref]?.name ?? '')
        : typeof v === 'object' && 'date' in v ? v.date
        : Array.isArray(v) ? v.join(', ')
        : typeof v === 'number' ? v.toLocaleString()
        : String(v)
      ).trim();
      if (!s || s.length > 46) continue; // a paragraph in a field is not a fact
      out.push([k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim(), s]);
    }
    return out;
  }

  /** Where it sits — nearest parent first. */
  function crumbOf(e: EntityRecord): string {
    const parts: string[] = [];
    let p = e.parentId ? world.entities[e.parentId] : undefined;
    for (let i = 0; p && i < 3; i++) {
      parts.push(p.name);
      p = p.parentId ? world.entities[p.parentId] : undefined;
    }
    return parts.join(' · ');
  }

  function showCard(a: { entityId: string; x: number; y: number; icon?: string }): void {
    const e = world.entities[a.entityId];
    if (!e) return;
    cardAt = { id: a.entityId, x: a.x, y: a.y };
    hexInfo.hidden = true; // one panel at a time
    selected = null;
    const glyph = ANCHOR_ICON[a.icon ?? ''] ?? KIND_ICON[e.kind] ?? '📍';
    const crumb = crumbOf(e);
    const brief = briefOf(e);
    const facts = factsOf(e);
    card.innerHTML =
      `<div class="mv-cardhead"><span class="mv-cardglyph">${glyph}</span>` +
      `<span class="mv-cardname" title="${escT(e.name)}">${escT(e.name)}</span>` +
      `<button type="button" class="mv-cardx" title="Close">×</button></div>` +
      `<div class="mv-cardkind">${escT(KIND_LABEL[e.kind] ?? e.kind)}${crumb ? ` · ${escT(crumb)}` : ''}</div>` +
      (facts.length ? `<div class="mv-cardfacts">${facts.map(([k, v]) => `<span><b>${escT(k)}</b> ${escT(v)}</span>`).join('')}</div>` : '') +
      (brief ? `<p class="mv-cardbrief">${escT(brief)}</p>`
             : `<p class="mv-cardbrief mv-cardempty">Nothing written here yet.</p>`) +
      `<button type="button" class="mv-cardmore">More →</button>` +
      // a site-capable pin can be ENTERED from the map — the descend rung
      // between the hex world and its interiors (nested-spaces epic)
      (cb.onEnterSite && cb.canEnter?.(a.entityId) ? `<button type="button" class="mv-cardmore mv-cardenter">🏰 Enter</button>` : '');
    card.hidden = false;
    card.style.visibility = 'hidden'; // laid out but unseen: measure, then place
    card.querySelector('.mv-cardx')!.addEventListener('click', closeCard);
    card.querySelector('.mv-cardmore:not(.mv-cardenter)')!.addEventListener('click', () => {
      const id = cardAt?.id;
      closeCard();
      if (id) cb.onSelectEntity(id);
    });
    card.querySelector('.mv-cardenter')?.addEventListener('click', () => {
      const id = cardAt?.id;
      closeCard();
      if (id) cb.onEnterSite?.(id);
    });
    positionCard();
    repaint();
  }

  /** Keep the card beside its pin and inside the frame. draw() calls this, so
   *  it tracks pan and zoom for free. */
  function positionCard(): void {
    if (!cardAt) return;
    const [sx, sy] = toScreen(cardAt.x, cardAt.y);
    const cw = card.offsetWidth || 265, ch = card.offsetHeight || 120;
    if (sx < -cw || sx > W + cw || sy < -ch || sy > H + ch) { // subject gone; so is the card
      card.style.visibility = 'hidden';
      return;
    }
    card.style.visibility = 'visible';
    card.style.left = `${Math.round(Math.min(Math.max(8, sx + 16), Math.max(8, W - cw - 8)))}px`;
    card.style.top = `${Math.round(Math.min(Math.max(8, sy - ch / 2), Math.max(8, H - ch - 8)))}px`;
  }

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
    if (travelPlan || customPlan) {
      // a finished trip and its readout live and die together (audit V24): an
      // ordinary tap used to swap the 🧭 banner for a hex card while the route
      // line stayed drawn — a measurement with its numbers gone. The banner's
      // own buttons (chips, ＋ stop, march) live off-canvas and never get here.
      travelPlan = null; customPlan = null; travelStops = [];
    }
    // a VISIBLE anchor within 14px wins; otherwise select the hex. anchorVisible
    // is the same rule the draw uses, so you can never tap a pin that isn't on
    // the map — pins layer off, or a small pin the zoom has decluttered away.
    // Among the hits, the NEAREST pin wins; a near-tie (pins essentially on the
    // same spot) goes to the LAST-drawn, which the paint order puts on top —
    // first-hit-in-array-order used to open the pin visually underneath.
    const hits: Array<{ a: NonNullable<typeof plane.anchors>[number]; d: number }> = [];
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!anchorVisible(a, ent as { kind: string; deleted?: boolean; fields?: Record<string, unknown> })) continue;
      const [sx, sy] = toScreen(a.x, a.y);
      const d = Math.hypot(sx - px, sy - py);
      if (d < 14) hits.push({ a, d });
    }
    if (hits.length) {
      const dmin = Math.min(...hits.map((h) => h.d));
      const near = hits.filter((h) => h.d <= dmin + 2);
      showCard(near[near.length - 1]!.a); // topmost of the nearest
      return;
    }
    closeCard(); // tapping the ground dismisses the card
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
    // does something unwritten live under this tap? — gated by the SAME layer
    // toggles that gate drawGhosts, or a hidden ghost stays tappable and
    // offers "Write it in" for a thing the user cannot see (draw-vs-check
    // drift, the anchorVisible lesson again)
    let ghost: ((GhostSettlement | GhostFeature) & { gid: string }) | null = null;
    let ghostDesc = '';
    if (showPins.checked && showGhosts.checked && 31680 * view.ppf >= 20) {
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
    // elevation + this hex's own size (owner, batch 44): a rough altitude from
    // the terrain field (0.5 = sea level), and the hex's span
    const altFt = Math.round((info.e - 0.5) * 38000);
    const elevStr = info.b === 'deep' ? 'deep water' : info.b === 'water' ? 'shallows'
      : altFt <= 30 ? 'sea level' : `≈ ${altFt.toLocaleString()} ft`;
    const hfI = TIERS[ti]!.hexFt;
    const metricI = (world as { settings?: { unitsDisplay?: string } }).settings?.unitsDisplay === 'metric';
    const hexSizeStr = metricI
      ? (hfI >= 3280.84 ? `${Math.round(hfI / 3280.84 * 10) / 10} km` : `${Math.round(hfI / 3.28084)} m`)
      : (hfI >= 5280 ? `${Math.round(hfI / 5280 * 10) / 10} mi` : `${Math.round(hfI)} ft`);
    // the resource the land carries here (batch 48) — a world-hex fact
    const xnR = ((cx % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    const [wqR, wrR] = pointToHex(WORLD_TI, xnR, cy);
    const resHere = resourceAtHex(wqR, wrR);
    const resStr = resHere ? ` · ${resHere.glyph} ${resHere.label} <span style="opacity:.7">(${resourceClass(resHere)})</span>` : '';
    // Is there a road here? (owner: "perhaps it will be easier to detect where
    // roads are?") — this panel knew the biome, the altitude, the hex's span and
    // what the land yields, and nothing whatever about the road running through
    // it, because until roadField.ts a road had no width and so no presence in
    // the world to ask about. Tolerance is the hex's INSCRIBED circle (hexFt is
    // flat-to-flat, so its inradius is hexFt/2): a road clipping a far corner is
    // not really "in" this hex, and at world grain that circle is 30 miles.
    const roadHere = roadFieldOf().kindAt(cx, cy, hfI / 2);
    const roadStr = roadHere
      ? ` · 🛣 ${roadHere} <span style="opacity:.7">(${ROAD_REAL_FT[roadHere]} ft wide)</span>`
      : '';
    hexInfo.innerHTML = `<b>${TIERS[ti]!.id}:${q},${r}</b> · ${info.b} · <span style="opacity:.8">${elevStr} · ⬡ ${hexSizeStr}</span>${resStr}${roadStr}` +
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

  // Every checkbox in the Layers box repaints. This was a hand-listed array of
  // the eight that existed at the time, so adding a ninth ("realms", item #27)
  // produced a toggle that toggled nothing: the flag flipped, no repaint was
  // ever scheduled, and the canvas just sat there. Ask the DOM instead — a new
  // layer is now wired by existing.
  host.querySelectorAll<HTMLInputElement>('.mv-layers input[type="checkbox"]')
    .forEach((el) => el.addEventListener('change', repaint));
  // minimize the whole legend to a corner tab (owner, batch 42): the map is
  // busy, and sometimes you just want to see it
  const legendEl = host.querySelector<HTMLElement>('.mv-legend')!;
  host.querySelector<HTMLButtonElement>('.mv-legmin')!.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const min = legendEl.classList.toggle('mv-legend-min');
    host.querySelector<HTMLButtonElement>('.mv-legmin')!.textContent = min ? '+' : '–';
  });
  // ⚡ the portal network is a WORLD setting, not a display layer: toggling it
  // persists and any measured route re-plans without the jumps
  showPortals.checked = travelSettings().portalNetwork !== false;
  showPortals.addEventListener('change', () => {
    travelSettings().portalNetwork = showPortals.checked;
    cb.onClaimsEdited?.();
    if (travelStops.length >= 2) showTravelPlan();
    repaint();
  });
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
    destroy() {
      // cancel EVERYTHING scheduled, not just the spin: a pending draw frame
      // runs on a detached canvas, and the hash/legend timers rewrite the URL
      // and poke the DOM for a map that no longer exists
      cancelAnimationFrame(spinRaf); cancelAnimationFrame(raf);
      clearTimeout(zoomSettle); clearTimeout(hashTimer); clearTimeout(legendTimer);
      globeMode = false; ro.disconnect(); host.innerHTML = '';
    },
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
