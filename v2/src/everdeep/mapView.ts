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
import type { WorldDoc } from '../engine/worldStore.ts';

interface PlaneLike {
  id: string;
  terrain?: { waterPct?: number; climate?: string; landform?: string; continents?: number; circumFt?: number; heightFt?: number };
  anchors?: Array<{ entityId: string; x: number; y: number; tier: string; icon?: string; promoted?: boolean }>;
  claims?: Record<string, string[]>;
}

export interface MapHandle {
  destroy(): void;
  focusEntity(id: string): void;
  refresh(): void;
}

export interface MapCallbacks {
  onSelectEntity(id: string): void;
  onAddHere(x: number, y: number, hexLabel: string): void;
}

const TIERS: Array<{ id: string; hexFt: number; renderOnly?: boolean }> = [
  { id: 'world', hexFt: 316800 },
  { id: 'region', hexFt: 31680 },
  { id: 'mile', hexFt: 5280, renderOnly: true },
  { id: 'locale', hexFt: 500 },
];
const SQ3 = Math.sqrt(3);

const COLORS: Record<BiomeId, [number, number, number]> = {
  deep: [29, 47, 71], water: [52, 84, 118], beach: [201, 185, 138],
  snow: [223, 228, 232], tundra: [168, 176, 162], taiga: [74, 107, 82],
  desert: [211, 176, 120], savanna: [179, 163, 95], grass: [125, 155, 90],
  forest: [79, 122, 69], jungle: [58, 107, 61], hills: [138, 132, 104], mountain: [122, 115, 104],
};
const LANDSET = new Set<BiomeId>(['beach', 'snow', 'tundra', 'taiga', 'desert', 'savanna', 'grass', 'forest', 'jungle', 'hills', 'mountain']);
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

  // start over the first anchor, else over the first claim hex, else origin
  const firstAnchor = (plane.anchors ?? [])[0];
  const view = { x: firstAnchor?.x ?? 0, y: firstAnchor?.y ?? 0, ppf: 0.00002 };
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

  function drawClaims(): void {
    const entries = Object.entries(plane.claims ?? {});
    if (!entries.length) return;
    const ti = 1; // claims are region hexes
    const R = hexR(ti), Rpx = R * view.ppf;
    if (Rpx * SQ3 < 3) return;
    for (const [owner, addrs] of entries) {
      const color = claimColor.get(owner);
      if (!color) continue;
      const set = new Set(addrs);
      for (const addr of addrs) {
        const m = /^region:(-?\d+),(-?\d+)$/.exec(addr);
        if (!m) continue;
        const q = Number(m[1]), r = Number(m[2]);
        const [cx, cy] = hexCenter(ti, q, r);
        const [sx, sy] = toScreen(cx, cy);
        if (sx < -Rpx * 2 || sx > W + Rpx * 2 || sy < -Rpx * 2 || sy > H + Rpx * 2) continue;
        for (let k = 0; k < 6; k++) {
          const nq = q + EDGE_DIRS[k]![0], nr = r + EDGE_DIRS[k]![1];
          if (set.has(`region:${nq},${nr}`)) continue; // interior edge
          const [ax, ay] = corner(sx, sy, Rpx, k), [bx, by] = corner(sx, sy, Rpx, k + 1);
          ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, Rpx * 0.09);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
      }
    }
  }

  const TIER_FT: Record<string, number> = { world: 316800, region: 31680, locale: 500 };
  function drawAnchors(): void {
    if (!showPins.checked) return;
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    for (const a of plane.anchors ?? []) {
      const ent = world.entities[a.entityId];
      if (!ent || ent.deleted) continue;
      // declutter like a road atlas: a tavern (locale pin) appears only when
      // its tier's hexes are visibly sized; promoted pins always show
      if (!a.promoted && (TIER_FT[a.tier] ?? 31680) * view.ppf < 4) continue;
      const [sx, sy] = toScreen(a.x, a.y);
      if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
      ctx.fillStyle = '#1c2129';
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ffd479'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.stroke();
      ctx.fillStyle = '#10141a';
      ctx.fillText(ent.name, sx + 1, sy - 8);
      ctx.fillStyle = '#f4efdf';
      ctx.fillText(ent.name, sx, sy - 9);
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
    for (let ti = 0; ti < TIERS.length; ti++) {
      const a = ti === 0 ? 1 : tierAlpha(ti);
      if (a <= 0) break;
      drawTier(ti, a);
    }
    drawClaims();
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
    repaint();
  }

  const clampY = () => { view.y = Math.max(-cfg.heightFt / 2, Math.min(cfg.heightFt / 2, view.y)); };
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false, pinch = 0;
  const zoomAt = (f: number, px: number, py: number) => {
    const [wx, wy] = toWorld(px, py);
    view.ppf = Math.max(6e-6, Math.min(8, view.ppf * f));
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
    let ti = 0;
    for (let i = 0; i < TIERS.length; i++) if (tierAlpha(i) > 0.5 && !TIERS[i]!.renderOnly) ti = i;
    const [wx, wy] = toWorld(px, py);
    const [q, r] = pointToHex(ti, wx, wy);
    selected = { t: ti, q, r };
    const info = hexInfoAt(ti, q, r);
    const [cx, cy] = hexCenter(ti, q, r);
    hexInfo.hidden = false;
    hexInfo.innerHTML = `<b>${TIERS[ti]!.id}:${q},${r}</b> · ${info.b}
      <button type="button" class="mv-add">+ Add here</button>`;
    hexInfo.querySelector('.mv-add')?.addEventListener('click', () => {
      cb.onAddHere(cx, cy, `${TIERS[ti]!.id}:${q},${r}`);
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
      if (a) { view.x = a.x; view.y = a.y; view.ppf = Math.max(view.ppf, 0.002); clampY(); repaint(); }
    },
  };
}
