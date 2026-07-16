// The world map widget (M1): hex terrain viewer mounted INSIDE /world/
// beside the tree (tree↔map merge, PLAN §6.1). Renders the plane's ghost
// terrain from terrain.ts (x-periodic — panning wraps seamlessly), entity
// anchors, kingdom claim outlines, a legend, and lets the user select
// entities or add new ones from a hex ("+ Add here").

import {
  biomeAt, coastDistAt, detailAt, elevationAt, octFor,
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
import { buildRoadField, ROAD_REAL_FT } from './roadField.ts';
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
  const ctx = canvas.getContext('2d')!;
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
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const [ax, ay] = corner(sx, sy, Rpx + 0.6, k);
          k ? ctx.lineTo(ax, ay) : ctx.moveTo(ax, ay);
        }
        ctx.closePath();
        ctx.fillStyle = reliefOn ? reliefColor(e) : shade(b, e, jitter);
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
  let artMarksAnchorCount = -1;
  function artMarksNow(): Map<string, ArtMark> {
    const n = (plane.anchors ?? []).length;
    if (artMarks && artMarksAnchorCount === n) return artMarks;
    artMarksAnchorCount = n;
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
          // built-up hexes read as rooftops on any land; farmland beyond
          if (hexDist <= cityRad) { if (b2 !== 'water' && b2 !== 'deep') put(q2 + ',' + r2, 'city'); }
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
    /** World-space vertical extent, for culling a realm that's off-screen. */
    y0: number; y1: number;
  }
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
      claimSets.push({ owner, color, ti, hexes: g.hexes, set: g.set, border, y0, y1 });
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
          const xn2 = ((x2 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
          travelStops.push(pointToHex(WORLD_TI, xn2, y2));
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
   * Earth has 182 of them, and a list of 182 is not a legend, it's a phone
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
      // only the frontier hexes, and only their outward edges — both worked out
      // at rebuild time, so a repaint strokes and does not think
      ctx.beginPath();
      for (const [q, r, mask] of cs.border) {
        const [cx, cy] = hexCenter(cs.ti, q, r);
        const [sx, sy] = toScreen(cx, cy);
        if (sx < -Rpx * 2 || sx > W + Rpx * 2 || sy < -Rpx * 2 || sy > H + Rpx * 2) continue;
        for (let k = 0; k < 6; k++) {
          if (!(mask & (1 << k))) continue; // interior edge
          const [ax, ay] = corner(sx, sy, Rpx, k), [bx, by] = corner(sx, sy, Rpx, k + 1);
          ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        }
      }
      ctx.stroke(); // one stroke for the whole frontier, not one per edge
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
  function drawGhosts(): void {
    if (!showPins.checked || !showGhosts.checked) return;
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
            ghostText((g.abandoned ? 'abandoned ' : 'unwritten ') + g.cls, sx, sy - s + 1,
              g.abandoned ? 'rgba(240,170,158,0.95)' : 'rgba(248,244,232,0.92)');
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
          if (hexPx > 34) ghostText('unwritten ' + f.kind, sx, sy - 8, 'rgba(240,170,158,0.95)');
        }
      }
    }
  }

  // ---------- roads (batch 11): classes reveal as you zoom ----------
  // highways surface first (third zoom band), roads next, dirt tracks last
  const ROUTE_MIN_PPF: Record<string, number> = { highway: 3e-4, road: 1e-3, dirt: 5e-3, river: 3e-4, path: 5e-3, seaRoute: 3e-4 };
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
        const atlasW = rw >= 4 ? (far ? 3 : 4.6) : rw >= 3 ? (far ? 2.2 : 3.4) : rw >= 2 ? (far ? 1.3 : 2.1) : 1.3;
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
        const atlasW = kind === 'highway' ? 2.6 : kind === 'dirt' ? 1.2 : 1.8;
        const realPx = roadFt * view.ppf;
        ctx.strokeStyle = kind === 'highway' ? 'rgba(88,66,44,0.95)' : kind === 'dirt' ? 'rgba(128,102,70,0.7)' : 'rgba(106,82,56,0.85)';
        ctx.lineWidth = Math.max(atlasW, realPx);
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
        if (prev && !wrapped) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        prev = [sx, sy];
        prevWx = wx;
      }
      ctx.stroke();
      if (flowRiverFt) drawFlowMarkers(rt.pts, flowRiverFt);
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
      // A HALO, not a drop shadow (owner, item #26). A 1px dark offset does
      // nothing for a realm's name, because a realm's name is drawn in its own
      // territory's colour — a pale gold or sage that sits right on top of
      // savanna and grass. The map already strokes its selected-hex caption
      // this way; labels never got it.
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.5, L.size * 0.3);
      ctx.strokeStyle = 'rgba(10,14,20,0.9)';
      ctx.strokeText(L.text, L.x, L.y);
      ctx.fillStyle = L.fill;
      ctx.fillText(L.text, L.x, L.y);
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
      if (!ent || ent.deleted) continue;
      // declutter like a road atlas; promoted pins and metropolises always show
      const visFt = visibilityFt(a, ent as { kind: string; fields?: Record<string, unknown> });
      if (!a.promoted && visFt !== Infinity && visFt * view.ppf < 4) continue;
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -260 || sx > W + 260 || sy < -40 || sy > H + 40) continue;
      if (a.icon === 'label') {
        // a name written on the map itself — oceans, ranges, lakes, the
        // continent, and POLITICAL owners (batch 13): a claim owner's name
        // takes its territory's color
        const pol = claimColor.get(a.entityId);
        // a realm's NAME is part of the political layer, not of the labels:
        // "realms" turns the crowns off, wash, border and name together
        if (pol ? !showRealms.checked : !showLabels.checked) continue;
        if (hiddenClaims.has(a.entityId)) continue; // hidden claim hides its name
        const size = Math.max(13, Math.min(30, (TIER_FT[a.tier] ?? 316800) * view.ppf * 0.09));
        labels.push({ x: sx, y: sy, text: ent.name, size,
          font: `italic ${size}px Georgia, 'Times New Roman', serif`,
          fill: pol ?? 'rgba(240,236,222,0.82)',
          prio: pol ? 90 : a.tier === 'world' ? 80 : 60 });
        continue;
      }
      if (!showPins.checked) continue; // everything below here IS a pin
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
  travelBtn.addEventListener('click', () => {
    exitPaint();
    travelPlan = null;
    customPlan = null;
    travelStops = [];
    repaint();
    const pickDest = (): void => {
      pickPending = (x2, y2) => {
        const xn2 = ((x2 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
        travelStops.push(pointToHex(WORLD_TI, xn2, y2));
        showTravelPlan(); // plans every mode combination from here — "＋ stop" adds more
        repaint();
      };
    };
    if (plane.party) { // the journey starts where the party stands
      const xn = ((plane.party.x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
      travelStops = [pointToHex(WORLD_TI, xn, plane.party.y)];
      hexInfo.hidden = false;
      hexInfo.innerHTML = '<b>🥾 Travel time</b> — from the party 🚩: tap the DESTINATION';
      pickDest();
      return;
    }
    travelPrompt(1);
    pickPending = (x1, y1) => {
      const xn = ((x1 % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
      travelStops = [pointToHex(WORLD_TI, xn, y1)];
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
  function draw(): void {
    raf = 0;
    if (globeMode) { if (cardAt) closeCard(); drawGlobe(); return; }
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
    drawResources();
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
          ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash);
          ctx.beginPath();
          let prevT: [number, number] | null = null;
          let prevWx2: number | null = null;
          for (let i = 0; i < p3.pts.length; i++) {
            const [x2, y2] = p3.pts[i]!;
            const [sx2, sy2] = toScreen(x2, y2);
            const wrapped = prevWx2 !== null && Math.abs(x2 - prevWx2) > cfg.circumFt / 2;
            if (prevT && legKind(p3, i) === kind && !wrapped) ctx.lineTo(sx2, sy2);
            else ctx.moveTo(sx2, sy2);
            prevT = [sx2, sy2];
            prevWx2 = x2;
          }
          ctx.stroke();
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
    positionCard(); // the card rides its pin through pan and zoom
    scheduleClaimLegend(); // "which realms am I looking at?" (item #29)
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
      `<button type="button" class="mv-cardmore">More →</button>`;
    card.hidden = false;
    card.style.visibility = 'hidden'; // laid out but unseen: measure, then place
    card.querySelector('.mv-cardx')!.addEventListener('click', closeCard);
    card.querySelector('.mv-cardmore')!.addEventListener('click', () => {
      const id = cardAt?.id;
      closeCard();
      if (id) cb.onSelectEntity(id);
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
    // an anchor within 14px wins; otherwise select the hex
    for (const a of plane.anchors ?? []) {
      const [sx, sy] = toScreen(a.x, a.y);
      if (Math.hypot(sx - px, sy - py) < 14 && world.entities[a.entityId] && !world.entities[a.entityId]!.deleted) {
        showCard(a);
        return;
      }
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
