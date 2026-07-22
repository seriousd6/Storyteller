// The site editor — the ground-tier canvas (MAPS.md M3). One mount function
// in the mapView.ts mold: mountSite(host, world, siteId, cb) → handle. Renders
// a square-grid site (dungeon / cave / building / settlement plan) and lets
// the user AUTHOR it: paint cells, carve rooms, punch doors, key areas with
// notes, stack floors, reroll the generated base. Every edit goes through
// sites.writeCellOverride so a generated floor stores only deltas.
//
// The synthesis the tool survey pointed at: Watabou generates but won't let
// you edit; Dungeon Scrawl edits but won't generate. This surface does both.

import {
  siteById, childSites, touchSite, effectiveCells, writeCellOverride, cellKey, parseCellKey, removeSite,
  type SiteRec, type SiteFloor, type SiteCell, type SiteArea, type CellType, type BuildRole,
} from './sites.ts';
import { cellsFor, parseGenerator } from './siteGen.ts';
import { rerollFloor, addFloor, makeSubSite, furnishSite, refreshChildContext, relayWithContext } from './siteOps.ts';
import { buildUvtt, buildOpd } from './siteExport.ts';
import { rid, newEntity, type WorldDoc } from '../engine/worldStore.ts';

export interface SiteViewCallbacks {
  /** The world changed — persist it (callers debounce). */
  onDirty(): void;
  onExit?(): void;
  /** Descend into a nested sub-site (the caller remounts). */
  onOpenSite?(siteId: string): void;
  /** A pinned cell's page was opened — the caller leaves the editor and
   *  navigates its wiki. */
  onSelectEntity?(entityId: string): void;
  /** A keyed area's bound body block, rendered read-only in the key panel. */
  resolveBlock?(blockId: string): string | null;
  /** Mint a treasure-hoard page for this seed (the host runs the composite
   *  and adds the entity to the world); the editor pins what comes back.
   *  The seed is deterministic per cell — same cell, same hoard. */
  rollHoard?(seed: string): Promise<{ id: string } | null>;
  playerView?: boolean;
  title?: string;
  /** Deep links (LAYERED-SPACES §3): open on this floor's z instead of 0. */
  initialZ?: number;
  /** Fired when the visible floor changes, so the host can keep its URL
   *  honest (`/s:<siteId>/fl:<z>`). */
  onNavigate?(siteId: string, z: number): void;
}

export interface SiteHandle {
  destroy(): void;
  refresh(): void;
  renderPng(pxPerCell?: number, hideSecrets?: boolean): HTMLCanvasElement;
  readonly siteId: string;
}

type Tool = 'select' | 'pan' | 'room' | 'floor' | 'wall' | 'door' | 'secret' | 'stairs' | 'water' | 'hazard' | 'erase' | 'key';

const PAINT: Partial<Record<Tool, CellType>> = {
  floor: 'floor', wall: 'wall', door: 'door', secret: 'secret',
  stairs: 'stairs', water: 'water', hazard: 'hazard',
};

const PAINT_HINT = ' — Shift+drag: straight line · double-click: fill region';
const TOOLS: Array<{ id: Tool; icon: string; label: string }> = [
  { id: 'select', icon: '⇱', label: 'Select / inspect (V, Esc) — drag a selected key to move it, its corners to resize' },
  { id: 'pan', icon: '✋', label: 'Pan (H — or drag with space / middle button)' },
  { id: 'room', icon: '▣', label: 'Room (R) — drag a rectangle: floor inside, walls around' },
  { id: 'floor', icon: '·', label: 'Paint floor (F)' + PAINT_HINT },
  { id: 'wall', icon: '▦', label: 'Paint wall (W)' + PAINT_HINT },
  { id: 'door', icon: '🚪', label: 'Door (D)' + PAINT_HINT },
  { id: 'secret', icon: '🤫', label: 'Secret door (X) — players see a wall' },
  { id: 'stairs', icon: '𝌆', label: 'Stairs (T)' },
  { id: 'water', icon: '≈', label: 'Water (A)' + PAINT_HINT },
  { id: 'hazard', icon: '⚠', label: 'Hazard (Z)' + PAINT_HINT },
  { id: 'erase', icon: '⌫', label: 'Erase to void (E)' + PAINT_HINT },
  { id: 'key', icon: '🔖', label: 'Key (K) — drag a rectangle to label an area' },
];
const HOTKEYS: Record<string, Tool> = {
  v: 'select', h: 'pan', r: 'room', f: 'floor', w: 'wall', d: 'door',
  x: 'secret', t: 'stairs', a: 'water', z: 'hazard', e: 'erase', k: 'key',
};

// the parchment-and-ink palette (matches the hex map's hand-drawn mood).
// The audit's screenshots showed streets, yards, and empty parchment as
// three near-identical creams — so the GROUND sits a clear step darker
// than paved floor now: pale streets read as light lines between dark
// building masses, and dungeon interiors get figure-ground for free.
const C = {
  page: '#c9bc9c', parchment: '#e2d4b2', gridline: 'rgba(92, 74, 44, 0.12)',
  floor: '#f7f0dc', wall: '#4a4132', wallEdge: '#332c20', door: '#a06b32',
  stairs: '#6b5b44', water: '#8fb3cc', waterEdge: '#6f93ac', hazard: '#c26b4a',
  ink: '#3f3626', label: 'rgba(63, 54, 38, 0.85)', accent: '#8a5a2b',
  shadow: 'rgba(58, 48, 30, 0.16)',
};

// R3 building-role tints: jewel accents against the dark #4a4132 house-mass,
// staying inside the parchment mood — a few of these among hundreds of dark
// blocks is what makes a skyline instead of one grey slab.
const ROLE_FILL: Partial<Record<BuildRole, string>> = {
  inn: '#7a4b32',       // warm ale-brown
  temple: '#63697a',    // cool slate
  keep: '#55524c',      // heavy cold grey (the citadel)
  market: '#9a7a3a',    // ochre halls
  guild: '#876a3a',     // darker ochre
  civic: '#6e3f4a',     // burgundy — seat of law
  mill: '#6b5333',      // timber
  warehouse: '#6b5333', // timber
  garden: '#8ea36a',    // green court — tints garden FLOOR cells (R4), not walls
};

// theme tints (interior role-theming): a generated floor whose gen string
// carries ?theme=… shifts the ground and ink a shade — bone-pale crypts,
// ember-warm hellmouths, mossy warrens. Subtle on purpose; the parchment
// mood stays (each tint keeps ground a step below its floor).
const THEME_TINT: Record<string, Partial<typeof C>> = {
  undead: { page: '#c4bda9', parchment: '#ddd8c4', floor: '#f6f4ec', wall: '#403d35' },
  fiend: { page: '#c9ac91', parchment: '#dfcba6', floor: '#f7e9d3', wall: '#4a2f26', hazard: '#c0432e' },
  aberration: { page: '#bdb2c0', parchment: '#d8cfda', floor: '#f2ecf4', wall: '#3f3547', water: '#9a8fc4' },
  construct: { page: '#b9b6ad', parchment: '#d7d3c7', floor: '#f1efe8', wall: '#3c3d3e' },
  beast: { page: '#b9bd9a', parchment: '#d7d8bb', floor: '#f2f3df', wall: '#41442f' },
  dragon: { page: '#ccb489', parchment: '#e1d0a4', floor: '#f8edcf', wall: '#4c3a24' },
  fey: { page: '#b3c2a3', parchment: '#d4dec3', floor: '#eff5e4', wall: '#39422f' },
  giant: { page: '#b7b3ab', parchment: '#d5d1c6', floor: '#efece5', wall: '#3b3833' },
  humanoid: {},
};

const CSS = `
.sv-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--color-surface);color:var(--color-ink)}
.sv-bar{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--color-border);flex-wrap:wrap}
.sv-bar .sv-title{font-family:var(--font-display);font-size:var(--text-lg);margin:0 8px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40ch}
.sv-title .sv-crumb{cursor:pointer;opacity:.72;text-decoration:none;color:inherit}
.sv-title .sv-crumb:hover{opacity:1;text-decoration:underline}
.sv-title .sv-sep{opacity:.45;margin:0 3px;font-size:var(--text-sm)}
.sv-btn{border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-ink);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:var(--text-sm);line-height:1.4}
.sv-btn:hover{border-color:var(--color-accent)}
.sv-btn.on{background:var(--color-accent);color:var(--color-accent-contrast);border-color:var(--color-accent)}
.sv-btn:disabled{opacity:.45;cursor:default}
.sv-tools{display:flex;gap:2px;flex-wrap:wrap}
.sv-tools .sv-btn{min-width:30px;text-align:center;padding:3px 5px}
.sv-floors{display:flex;gap:2px;align-items:center;margin-left:4px}
.sv-spacer{flex:1}
.sv-body{display:flex;flex:1;min-height:0}
.sv-canvashost{flex:1;min-width:0;position:relative}
.sv-canvashost canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
.sv-panel{width:270px;border-left:1px solid var(--color-border);overflow-y:auto;padding:8px;font-size:var(--text-sm)}
.sv-panel h4{margin:2px 0 6px;font-family:var(--font-display)}
.sv-key{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;cursor:pointer;border:1px solid transparent}
.sv-key:hover{border-color:var(--color-border)}
.sv-key.on{border-color:var(--color-accent);background:color-mix(in srgb, var(--color-accent) 8%, transparent)}
.sv-key .k{opacity:.6;font-size:.85em}
.sv-inspect{margin-top:10px;border-top:1px solid var(--color-border);padding-top:8px;display:flex;flex-direction:column;gap:6px}
.sv-inspect input,.sv-inspect textarea{width:100%;box-sizing:border-box;background:var(--color-bg);color:var(--color-ink);border:1px solid var(--color-border);border-radius:6px;padding:4px 6px;font:inherit}
.sv-inspect textarea{min-height:70px;resize:vertical}
.sv-blocktext{background:var(--color-bg);border:1px dashed var(--color-border);border-radius:6px;padding:6px;white-space:pre-wrap;max-height:180px;overflow:auto;font-size:.92em}
.sv-menu{position:absolute;z-index:30;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:4px;display:flex;flex-direction:column;min-width:160px}
.sv-menu button{text-align:left;border:0;background:none;color:var(--color-ink);padding:6px 10px;border-radius:6px;cursor:pointer;font:inherit}
.sv-menu button:hover{background:color-mix(in srgb, var(--color-accent) 12%, transparent)}
.sv-note{opacity:.65;font-size:.85em}
.sv-dlg{position:absolute;inset:0;background:#0006;z-index:40;display:flex;align-items:center;justify-content:center}
.sv-dlg-card{background:var(--color-surface);border:1px solid var(--color-border);border-radius:10px;padding:14px 16px;min-width:260px;max-width:min(92%,380px);display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 32px rgba(0,0,0,.3)}
.sv-dlg-card h4{margin:0;font-family:var(--font-display)}
.sv-dlg-card label{display:flex;gap:8px;align-items:center;justify-content:space-between;font-size:var(--text-sm)}
.sv-dlg-card input{width:110px;background:var(--color-bg);color:var(--color-ink);border:1px solid var(--color-border);border-radius:6px;padding:4px 6px;font:inherit}
.sv-dlg-btns{display:flex;gap:8px;justify-content:flex-end}
.sv-primary{background:var(--color-accent);color:var(--color-accent-contrast);border-color:var(--color-accent)}
@media (max-width: 760px){ .sv-panel{display:none} }
`;

function injectCss(): void {
  if (document.getElementById('sv-style')) return;
  const s = document.createElement('style');
  s.id = 'sv-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function mountSite(host: HTMLElement, world: WorldDoc, siteId: string, cb: SiteViewCallbacks): SiteHandle {
  injectCss();
  const found = siteById(world, siteId);
  if (!found) throw new Error(`site ${siteId} not found`);
  const site: SiteRec = found; // explicit: closures below outlive the narrowing
  const entity = world.entities[site.entityId];
  const gmView = !cb.playerView;

  // THE CONTEXT CONTRACT (LAYERED-SPACES §2): on open, follow the parent's
  // current geometry. Unedited floors re-lay silently (base re-derives, the
  // seed-stable area bindings survive); hand-edited floors get an OFFER in
  // the panel instead of a forced redraw.
  let staleCtx: ReturnType<typeof refreshChildContext> | null = null;
  if (gmView && site.parentSiteId) {
    const r = refreshChildContext(world, site);
    if (r.state === 'updated') cb.onDirty();
    else if (r.state === 'stale-edited') staleCtx = r;
  }

  // ---------- state ----------
  let fi = Math.max(0, site.floors.findIndex((f) => (f.z ?? 0) === (cb.initialZ ?? 0)));
  let tool: Tool = 'select';
  let scale = 16, ox = 0, oy = 0, DPR = 1;
  let eff: Record<string, SiteCell> = {};
  let base: Record<string, SiteCell> | null = null;
  let selectedArea: string | null = null;
  let selectedCell: [number, number] | null = null;
  let hoverArea: string | null = null;
  let dragRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let spaceHeld = false;
  let destroyed = false;
  interface UndoEntry {
    fi: number;
    before: Map<string, SiteCell | undefined>;
    after: Map<string, SiteCell | undefined>;
    /** area edits ride the same stack: null side = the area didn't exist */
    area?: { id: string; before: SiteArea | null; after: SiteArea | null };
  }
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];
  let stroke: Map<string, SiteCell | undefined> | null = null;

  const floor = (): SiteFloor => site.floors[fi]!;
  const regen = (g: { generator: string; seed: string; genVersion?: number }, w: number, h: number) => cellsFor(g, w, h);

  // child-map previews for the blit (LAYERED-SPACES §3): a child's entry
  // floor rendered small, built lazily, cached for this mount's lifetime
  // (child edits happen in the child's own mount; returning remounts us)
  const kidThumbs = new Map<string, HTMLCanvasElement | null>();
  function kidThumb(kid: SiteRec): HTMLCanvasElement | null {
    const hit = kidThumbs.get(kid.id);
    if (hit !== undefined) return hit;
    let cnv: HTMLCanvasElement | null = null;
    const f0 = kid.floors.find((f) => (f.z ?? 0) === 0) ?? kid.floors[0];
    if (f0) {
      const cells2 = effectiveCells(f0, regen);
      const pxc = Math.max(2, Math.min(6, Math.floor(360 / Math.max(f0.w, f0.h))));
      cnv = document.createElement('canvas');
      cnv.width = f0.w * pxc;
      cnv.height = f0.h * pxc;
      const c2 = cnv.getContext('2d')!;
      c2.fillStyle = PAL.parchment;
      c2.fillRect(0, 0, cnv.width, cnv.height);
      for (const [k, cell] of Object.entries(cells2)) {
        const [x, y] = parseCellKey(k);
        c2.fillStyle = cell.t === 'wall' ? (cell.role ? ROLE_FILL[cell.role] ?? PAL.wall : PAL.wall)
          : cell.t === 'water' ? PAL.water
          : cell.t === 'door' || cell.t === 'secret' ? PAL.door
          : cell.t === 'hazard' ? PAL.hazard
          : cell.role ? ROLE_FILL[cell.role] ?? PAL.floor // garden-court tint (R4)
          : PAL.floor;
        c2.fillRect(x * pxc, y * pxc, pxc, pxc);
      }
    }
    kidThumbs.set(kid.id, cnv);
    return cnv;
  }
  let PAL = { ...C };
  function invalidate(): void {
    const f = floor();
    base = f.gen ? cellsFor(f.gen, f.w, f.h) : null;
    eff = effectiveCells(f, regen);
    // the theme rides in the generator string; the palette follows it
    const theme = f.gen ? parseGenerator(f.gen.generator)?.opts.theme : undefined;
    PAL = { ...C, ...(theme ? THEME_TINT[theme] ?? {} : {}) };
    lurkCache.clear();
    rebuildCache();
    requestDraw();
  }

  // ---------- chrome ----------
  // The breadcrumb trail (LAYERED-SPACES.md §3): the parentSiteId chain as
  // clickable crumbs — Everspire ▸ Docks Ward ▸ The Gilded Eel — so a deep
  // stack always answers "where am I" and any ancestor is one click up.
  function crumbTrailHtml(): string {
    const chain: SiteRec[] = [];
    let cur: SiteRec | undefined = site;
    for (let i = 0; cur && i < 6; i++) {
      chain.unshift(cur);
      cur = cur.parentSiteId ? siteById(world, cur.parentSiteId) : undefined;
    }
    const nameOf = (s: SiteRec): string => world.entities[s.entityId]?.name ?? 'Space';
    if (chain.length === 1) return escapeHtml(cb.title ?? entity?.name ?? 'Space');
    return chain.map((s, i) => i === chain.length - 1
      ? `<span>${escapeHtml(nameOf(s))}</span>`
      : `<a class="sv-crumb" data-crumb="${escapeAttr(s.id)}" title="Up to ${escapeAttr(nameOf(s))}">${escapeHtml(nameOf(s))}</a>`,
    ).join('<span class="sv-sep">▸</span>');
  }
  host.innerHTML = `<div class="sv-root">
    <div class="sv-bar">
      ${cb.onExit ? '<button class="sv-btn" data-act="exit" title="Back">←</button>' : ''}
      <span class="sv-title">${crumbTrailHtml()}</span>
      <span class="sv-tools">${TOOLS.map((t) => `<button class="sv-btn${t.id === tool ? ' on' : ''}" data-tool="${t.id}" title="${t.label}">${t.icon}</button>`).join('')}</span>
      <span class="sv-floors" data-floors></span>
      <span class="sv-spacer"></span>
      <button class="sv-btn" data-act="undo" title="Undo (Ctrl+Z)">↶</button>
      <button class="sv-btn" data-act="redo" title="Redo (Ctrl+Y)">↷</button>
      <button class="sv-btn" data-act="reroll" title="Reroll this floor's generated layout">🎲</button>
      <button class="sv-btn" data-act="resize" title="Resize the grid">📐</button>
      <button class="sv-btn" data-act="export" title="Export">⤓</button>
    </div>
    <div class="sv-body">
      <div class="sv-canvashost"><canvas></canvas></div>
      <aside class="sv-panel" data-panel></aside>
    </div>
  </div>`;
  const root = host.querySelector('.sv-root') as HTMLElement;
  const canvas = host.querySelector('canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const canvasHost = host.querySelector('.sv-canvashost') as HTMLElement;
  const panel = host.querySelector('[data-panel]') as HTMLElement;

  function renderFloorTabs(): void {
    const el = host.querySelector('[data-floors]') as HTMLElement;
    el.innerHTML = site.floors.map((f, i) =>
      `<button class="sv-btn${i === fi ? ' on' : ''}" data-fi="${i}" title="z=${f.z ?? 0}">${escapeHtml(f.label || `z${f.z ?? 0}`)}</button>`,
    ).join('') + `<button class="sv-btn" data-act="addfloor" title="Add or remove floors">＋</button>`;
    el.querySelectorAll<HTMLButtonElement>('[data-fi]').forEach((b) =>
      b.addEventListener('click', () => {
        fi = Number(b.dataset.fi);
        selectedArea = null;
        cb.onNavigate?.(site.id, floor().z ?? 0);
        invalidate(); renderFloorTabs(); renderPanel();
      }));
    el.querySelector('[data-act="addfloor"]')?.addEventListener('click', (ev) => floorMenu(ev as MouseEvent));
  }

  // ---------- panel (the key page) ----------
  function renderPanel(): void {
    const f = floor();
    const areas = f.areas ?? [];
    const sel = areas.find((a) => a.id === selectedArea);
    const kids = childSites(world, site.id);
    const kidByEntity = new Map(kids.map((k) => [k.entityId, k]));
    panel.innerHTML = `
      ${staleCtx?.fresh && gmView ? `<div class="sv-note" style="border:1px solid var(--color-border);border-radius:6px;padding:6px 8px;margin-bottom:8px">
        The city around this ward changed since it was laid out.
        <button class="sv-btn" data-act="matchctx" style="margin-top:4px">↻ Re-lay to match (drops cell edits)</button>
      </div>` : ''}
      <h4>Key</h4>
      ${areas.length ? '' : '<div class="sv-note">No keyed areas yet — use the 🔖 tool to label one.</div>'}
      ${areas.map((a) => `<div class="sv-key${a.id === selectedArea ? ' on' : ''}" data-area="${a.id}">
        <span>${escapeHtml(a.label)}</span><span class="k">${escapeHtml(a.kind ?? '')}</span>
      </div>`).join('')}
      ${sel ? `<div class="sv-inspect">
        <input data-alabel value="${escapeAttr(sel.label)}" aria-label="Area label">
        <textarea data-anote placeholder="Notes for this area…">${escapeHtml(sel.note ?? '')}</textarea>
        ${sel.blockId && cb.resolveBlock ? blockHtml(cb.resolveBlock(sel.blockId)) : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${sel.kind === 'building' || sel.kind === 'district' || sel.kind === 'room'
            ? `<button class="sv-btn" data-act="interior">${kidByEntity.has(sel.entityId ?? '') ? 'Open interior →' : 'Create interior →'}</button>` : ''}
          <button class="sv-btn" data-act="delarea">🗑 Remove key</button>
        </div>
      </div>` : ''}
      ${cellPanelHtml()}
      <div class="sv-note" style="margin-top:10px">${f.w}×${f.h} cells · ${site.cellFt} ft/cell${(() => {
        const ft = Math.max(f.w, f.h) * site.cellFt;
        return ft >= 2640 ? ` · ≈ ${(ft / 5280).toFixed(1)} mi across` : ` · ${ft.toLocaleString()} ft across`;
      })()}${f.gen ? ' · generated' : ' · hand-drawn'}</div>
      ${site.parentSiteId ? `<button class="sv-btn" style="margin-top:6px" data-act="up">↑ Up to parent site</button>` : ''}`;
    panel.querySelectorAll<HTMLElement>('[data-area]').forEach((el) =>
      el.addEventListener('click', () => { selectArea(el.dataset.area!, true); }));
    panel.querySelector<HTMLInputElement>('[data-alabel]')?.addEventListener('change', (ev) => {
      if (!sel) return;
      const before = { ...sel };
      sel.label = (ev.target as HTMLInputElement).value;
      pushAreaUndo(before, { ...sel });
      touchSite(site); cb.onDirty(); renderPanel(); requestDraw();
    });
    panel.querySelector<HTMLTextAreaElement>('[data-anote]')?.addEventListener('change', (ev) => {
      if (!sel) return;
      const before = { ...sel };
      sel.note = (ev.target as HTMLTextAreaElement).value;
      pushAreaUndo(before, { ...sel });
      touchSite(site); cb.onDirty();
    });
    panel.querySelector('[data-act="interior"]')?.addEventListener('click', () => {
      if (!sel) return;
      const sid = makeSubSite(world, site, sel, fi);
      cb.onDirty();
      cb.onOpenSite?.(sid);
    });
    panel.querySelector('[data-act="delarea"]')?.addEventListener('click', () => {
      if (!sel) return;
      const f2 = floor();
      pushAreaUndo({ ...sel }, null);
      f2.areas = (f2.areas ?? []).filter((a) => a.id !== sel.id);
      selectedArea = null;
      touchSite(site); cb.onDirty(); renderPanel(); requestDraw();
    });
    panel.querySelector('[data-act="up"]')?.addEventListener('click', () => {
      if (site.parentSiteId) cb.onOpenSite?.(site.parentSiteId);
    });
    panel.querySelector('[data-act="matchctx"]')?.addEventListener('click', () => {
      if (!staleCtx?.fresh) return;
      if (!confirm('Re-lay this map to match the city around it? Painted cell edits on this floor are dropped (keys keep their names and links).')) return;
      relayWithContext(world, site, staleCtx.fresh);
      staleCtx = null;
      cb.onDirty();
      invalidate();
      renderPanel();
    });
    wireCellPanel();
  }
  const blockHtml = (text: string | null): string =>
    text ? `<div class="sv-blocktext">${escapeHtml(text)}</div>` : '';

  // ---------- the cell inspector: per-cell entity pins ----------
  // "the quest's prize is in room 12" needs an address finer than a room:
  // cells[].entityId is the schema's seam for it. Select a cell → pin any
  // page of the world to it (or mint a note), and a pinned cell opens its
  // page. Pins ride the override channel like every other edit.
  /** A hazard cell speaks its room's rolled Trap line (the body already
   *  carries one for ~half the rooms; the map's ⚠ was mute until now). */
  function trapLineAt(cx: number, cy: number): string | null {
    if (!cb.resolveBlock) return null;
    const a = areaAt(cx, cy);
    if (!a?.blockId) return null;
    const text = cb.resolveBlock(a.blockId);
    const m = text && /^(?:Trap|Hazard of the Den): (.*)$/m.exec(text);
    return m ? m[1]! : null;
  }
  function cellPanelHtml(): string {
    if (!selectedCell) return '';
    const [cx, cy] = selectedCell;
    const cell = eff[cellKey(cx, cy)];
    const ft = site.cellFt;
    const trap = gmView && cell?.t === 'hazard' ? trapLineAt(cx, cy) : null;
    const head = `<div class="sv-inspect"><div class="sv-note">Cell ${cx},${cy} · ${cell?.t ?? 'void'} · ${ft} ft</div>` +
      (trap ? `<div class="sv-note">⚠ ${escapeHtml(trap)}</div>` : '');
    if (!cell || cell.t === 'wall') return `${head}</div>`;
    if (cell.entityId) {
      const pinned = world.entities[cell.entityId];
      return `${head}
        <div>📌 <b>${escapeHtml(pinned?.name ?? 'a missing page')}</b> <span class="k">${escapeHtml(pinned?.kind ?? '')}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${pinned && cb.onSelectEntity ? '<button class="sv-btn" data-act="openpin">Open page →</button>' : ''}
          <button class="sv-btn" data-act="unpin">Unpin</button>
        </div></div>`;
    }
    return `${head}
      <input data-pinsearch placeholder="📌 Pin a page here — type to search…" autocomplete="off">
      <div data-pinhits></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="sv-btn" data-act="pinnote">＋ New note at this cell</button>
        ${gmView && cb.rollHoard ? '<button class="sv-btn" data-act="rollhoard" title="Roll a treasure hoard and pin it to this cell">💰 Roll a hoard here</button>' : ''}
      </div></div>`;
  }
  function wireCellPanel(): void {
    if (!selectedCell) return;
    const [cx, cy] = selectedCell;
    panel.querySelector('[data-act="openpin"]')?.addEventListener('click', () => {
      const id = eff[cellKey(cx, cy)]?.entityId;
      if (id) cb.onSelectEntity?.(id);
    });
    panel.querySelector('[data-act="unpin"]')?.addEventListener('click', () => writePin(cx, cy, null));
    panel.querySelector('[data-act="rollhoard"]')?.addEventListener('click', async () => {
      if (!cb.rollHoard) return;
      // deterministic per cell: the same cell of the same floor rolls the
      // same hoard on every device (the site's own seed discipline)
      const f = floor();
      const seed = `${f.gen?.seed ?? `${site.id}/z${f.z ?? fi}`}/hoard:${cx},${cy}`;
      const minted = await cb.rollHoard(seed);
      if (!minted) return;
      writePin(cx, cy, minted.id);
    });
    const search = panel.querySelector<HTMLInputElement>('[data-pinsearch]');
    const hits = panel.querySelector<HTMLElement>('[data-pinhits]');
    search?.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      if (!hits) return;
      if (q.length < 2) { hits.innerHTML = ''; return; }
      const found = Object.values(world.entities)
        .filter((e) => !e.deleted && e.name.toLowerCase().includes(q))
        .slice(0, 10);
      hits.innerHTML = found.map((e) =>
        `<div class="sv-key" data-pin="${e.id}"><span>${escapeHtml(e.name)}</span><span class="k">${escapeHtml(e.kind)}</span></div>`).join('');
      hits.querySelectorAll<HTMLElement>('[data-pin]').forEach((el) =>
        el.addEventListener('click', () => writePin(cx, cy, el.dataset.pin!)));
    });
    panel.querySelector('[data-act="pinnote"]')?.addEventListener('click', () => {
      const name = (search?.value.trim() || 'Marked spot');
      const note = newEntity('note', name, entity?.id);
      world.entities[note.id] = note;
      writePin(cx, cy, note.id);
    });
  }
  function writePin(cx: number, cy: number, entityId: string | null): void {
    const f = floor();
    const k = cellKey(cx, cy);
    const cur = eff[k];
    if (!cur || cur.t === 'wall') return;
    const before = new Map<string, SiteCell | undefined>([[k, f.cells[k] ? { ...f.cells[k]! } : undefined]]);
    writeCellOverride(f, k, entityId ? { t: cur.t, entityId } : { t: cur.t }, base?.[k] ?? null);
    const after = new Map<string, SiteCell | undefined>([[k, f.cells[k] ? { ...f.cells[k]! } : undefined]]);
    undoStack.push({ fi, before, after });
    redoStack.length = 0;
    touchSite(site); cb.onDirty();
    patchEff(k);
    patchCache(cx, cy);
    renderPanel(); requestDraw();
  }

  function selectArea(id: string, center: boolean): void {
    selectedArea = id;
    const a = (floor().areas ?? []).find((x) => x.id === id);
    if (a && center) {
      ox = canvas.clientWidth / 2 - (a.x + a.w / 2) * scale;
      oy = canvas.clientHeight / 2 - (a.y + a.h / 2) * scale;
    }
    renderPanel(); requestDraw();
  }

  // ---------- menus ----------
  function popMenu(ev: MouseEvent, items: Array<[string, () => void]>): void {
    document.querySelectorAll('.sv-menu').forEach((m) => m.remove());
    const m = document.createElement('div');
    m.className = 'sv-menu';
    const r = root.getBoundingClientRect();
    m.style.left = `${Math.min(ev.clientX - r.left, r.width - 180)}px`;
    m.style.top = `${ev.clientY - r.top + 6}px`;
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { m.remove(); fn(); });
      m.appendChild(b);
    }
    root.style.position = 'relative';
    root.appendChild(m);
    setTimeout(() => document.addEventListener('click', function once(e) {
      if (!m.contains(e.target as Node)) { m.remove(); document.removeEventListener('click', once); }
    }), 0);
  }

  /** A small in-editor modal — the last chrome that fell back to the
   *  browser's prompt()/confirm() dialogs. Resolves the field values on
   *  OK, null on cancel/Escape/backdrop. */
  function svDialog(opts: {
    title: string;
    body?: string;
    fields?: Array<{ id: string; label: string; value: string; type?: string }>;
    okLabel?: string;
  }): Promise<Record<string, string> | null> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sv-dlg';
      overlay.innerHTML = `<div class="sv-dlg-card">
        <h4>${escapeHtml(opts.title)}</h4>
        ${opts.body ? `<div class="sv-note">${escapeHtml(opts.body)}</div>` : ''}
        ${(opts.fields ?? []).map((f) =>
          `<label>${escapeHtml(f.label)} <input data-id="${escapeAttr(f.id)}" type="${f.type ?? 'text'}" value="${escapeAttr(f.value)}"></label>`).join('')}
        <div class="sv-dlg-btns">
          <button class="sv-btn" data-cancel>Cancel</button>
          <button class="sv-btn sv-primary" data-ok>${escapeHtml(opts.okLabel ?? 'OK')}</button>
        </div>
      </div>`;
      const done = (val: Record<string, string> | null): void => { overlay.remove(); resolve(val); };
      overlay.addEventListener('click', (e) => { if (e.target === overlay) done(null); });
      overlay.querySelector('[data-cancel]')?.addEventListener('click', () => done(null));
      overlay.querySelector('[data-ok]')?.addEventListener('click', () => {
        const out: Record<string, string> = {};
        overlay.querySelectorAll<HTMLInputElement>('input[data-id]').forEach((i) => { out[i.dataset.id!] = i.value; });
        done(out);
      });
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') (overlay.querySelector('[data-ok]') as HTMLElement | null)?.click();
        if (e.key === 'Escape') done(null);
        e.stopPropagation(); // dialog keys never reach the tool hotkeys
      });
      root.style.position = 'relative';
      root.appendChild(overlay);
      const first = overlay.querySelector<HTMLInputElement>('input');
      (first ?? overlay.querySelector<HTMLElement>('[data-ok]'))?.focus();
      first?.select();
    });
  }

  function floorMenu(ev: MouseEvent): void {
    const items: Array<[string, () => void]> = [
      ['＋ Floor above', () => { fi = addFloor(world, site, fi, 'above'); afterStructuralChange(); }],
      ['＋ Floor below', () => { fi = addFloor(world, site, fi, 'below'); afterStructuralChange(); }],
    ];
    if (site.floors.length > 1) items.push(['🗑 Remove this floor', () => {
      void svDialog({ title: `Remove floor “${floor().label}”?`, body: 'Its edits are lost.', okLabel: 'Remove' }).then((v) => {
        if (!v) return;
        site.floors.splice(fi, 1);
        fi = Math.max(0, fi - 1);
        afterStructuralChange();
      });
    }]);
    popMenu(ev, items);
  }

  function afterStructuralChange(): void {
    selectedArea = null;
    undoStack.length = 0; redoStack.length = 0;
    touchSite(site); cb.onDirty();
    invalidate(); renderFloorTabs(); renderPanel();
  }

  // walls and portals are GM-side data in every VTT, but the embedded map
  // IMAGE is what players look at — so the image always masks secret doors;
  // a playerView mount strips them from the walls/portals too. Both
  // extensions ship because some importers filter pickers by .dd2vtt.
  function downloadUvtt(ext: 'uvtt' | 'dd2vtt'): void {
    const f = floor();
    const px = Math.max(8, Math.min(64, Math.floor(8192 / Math.max(f.w, f.h))));
    const uvtt = buildUvtt(eff, f.w, f.h, renderPng(px, true), px, { hideSecrets: !gmView });
    download(new Blob([JSON.stringify(uvtt)], { type: 'application/json' }), `${fileName()}.${ext}`);
  }
  function exportMenu(ev: MouseEvent): void {
    popMenu(ev, [
      ['PNG image', () => {
        const c = renderPng();
        c.toBlob((blob) => { if (blob) download(blob, `${fileName()}.png`); });
      }],
      ['Universal VTT (.uvtt)', () => downloadUvtt('uvtt')],
      ['Universal VTT (.dd2vtt)', () => downloadUvtt('dd2vtt')],
      ['One Page Dungeon JSON', () => {
        const f = floor();
        const opd = buildOpd(eff, f.areas ?? [], cb.title ?? entity?.name ?? 'Dungeon');
        download(new Blob([JSON.stringify(opd, null, 2)], { type: 'application/json' }), `${fileName()}.opd.json`);
      }],
      ['Space JSON (site + page)', () => {
        const payload = { format: 'stb-space@1', entity, site };
        download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${fileName()}.space.json`);
      }],
    ]);
  }
  const fileName = (): string => (cb.title ?? entity?.name ?? 'space').replace(/[^\w-]+/g, '-').toLowerCase();
  function download(blob: Blob, name: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  }

  // ---------- toolbar wiring ----------
  root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) =>
    b.addEventListener('click', () => {
      tool = b.dataset.tool as Tool;
      root.querySelectorAll('[data-tool]').forEach((o) => o.classList.toggle('on', o === b));
    }));
  root.querySelector('[data-act="exit"]')?.addEventListener('click', () => cb.onExit?.());
  root.querySelectorAll<HTMLElement>('[data-crumb]').forEach((el) =>
    el.addEventListener('click', () => cb.onOpenSite?.(el.dataset.crumb!)));
  root.querySelector('[data-act="undo"]')?.addEventListener('click', () => undo());
  root.querySelector('[data-act="redo"]')?.addEventListener('click', () => redo());
  root.querySelector('[data-act="export"]')?.addEventListener('click', (ev) => exportMenu(ev as MouseEvent));
  root.querySelector('[data-act="resize"]')?.addEventListener('click', () => {
    const f = floor();
    void svDialog({
      title: 'Resize the grid',
      body: 'Cells outside the new bounds are dropped (8–1000 per side).',
      fields: [
        { id: 'w', label: 'Width', value: String(f.w), type: 'number' },
        { id: 'h', label: 'Height', value: String(f.h), type: 'number' },
      ],
      okLabel: 'Resize',
    }).then((vals) => {
      const w = Number(vals?.w), h = Number(vals?.h);
      if (!vals || !w || !h) return;
      f.w = Math.max(8, Math.min(1000, Math.round(w)));
      f.h = Math.max(8, Math.min(1000, Math.round(h)));
      for (const k of Object.keys(f.cells)) {
        const c = k.indexOf(',');
        if (Number(k.slice(0, c)) >= f.w || Number(k.slice(c + 1)) >= f.h) delete f.cells[k];
      }
      f.areas = (f.areas ?? []).filter((a) => a.x < f.w && a.y < f.h);
      afterStructuralChange();
    });
  });
  root.querySelector('[data-act="reroll"]')?.addEventListener('click', () => {
    const f = floor();
    if (!f.gen) {
      void svDialog({ title: 'Nothing to reroll', body: 'This floor is hand-drawn — there is no generated layout to reroll.', okLabel: 'OK' });
      return;
    }
    void svDialog({
      title: 'Reroll this floor?',
      body: 'The generated layout changes; your cell edits on it are discarded and the keys are replaced.',
      okLabel: '🎲 Reroll',
    }).then((v) => {
      if (!v) return;
      rerollFloor(world, site, fi);
      if (entity) furnishSite(world, entity, site, fi); // rebind, redress, restand the prize
      afterStructuralChange();
    });
  });

  // ---------- coordinate helpers ----------
  const cellAtPx = (px: number, py: number): [number, number] =>
    [Math.floor((px - ox) / scale), Math.floor((py - oy) / scale)];
  const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < floor().w && y < floor().h;

  // ---------- editing ----------
  function beginStroke(): void { stroke = new Map(); }
  /** Patch ONE key of the effective map after a writeCellOverride — the
   *  per-cell mirror of sites.effectiveCells. Recomputing the whole map per
   *  painted cell regenerated the entire base layout on generated floors
   *  (~150ms on a large city) for every pointermove of a drag. */
  function patchEff(k: string): void {
    const f = floor();
    if (!f.gen) return; // hand-drawn: eff IS f.cells by reference, already right
    const o = f.cells[k];
    if (o) {
      if (o.t === 'void' && !o.entityId) delete eff[k];
      else eff[k] = o;
    } else {
      const b = base?.[k];
      if (b) eff[k] = b; else delete eff[k];
    }
  }
  function strokeCell(x: number, y: number, t: CellType | null): void {
    if (!inBounds(x, y) || !stroke) return;
    const f = floor();
    const k = cellKey(x, y);
    if (!stroke.has(k)) stroke.set(k, f.cells[k] ? { ...f.cells[k]! } : undefined);
    writeCellOverride(f, k, t ? { t } : null, base?.[k] ?? null);
    patchEff(k);
    patchCache(x, y);
    requestDraw();
  }
  /** Bresenham between two cells — fast drags interpolate instead of
   *  leaving gaps, and Shift+drag commits a straight line. */
  function paintLine(x0: number, y0: number, x1: number, y1: number, t: CellType | null): void {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (let guard = 0; guard < 4096; guard++) {
      strokeCell(x, y, t);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  /** Double-click with a paint tool: flood the contiguous region of the
   *  clicked cell's effective type (4-connected; empty ground is a type
   *  too) with the tool's cell. One undo entry. */
  function floodFill(cx: number, cy: number, t: CellType | null): void {
    if (!inBounds(cx, cy)) return;
    const from = eff[cellKey(cx, cy)]?.t ?? null;
    if (from === t) return;
    beginStroke();
    const seen = new Set<string>([cellKey(cx, cy)]);
    const q: Array<[number, number]> = [[cx, cy]];
    for (let n = 0; q.length && n < 25_000; n++) {
      const [x, y] = q.pop()!;
      strokeCell(x, y, t);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        const k = cellKey(nx, ny);
        if (seen.has(k) || !inBounds(nx, ny)) continue;
        if ((eff[k]?.t ?? null) !== from) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    endStroke();
    requestDraw();
  }
  function endStroke(): void {
    if (!stroke || stroke.size === 0) { stroke = null; return; }
    const f = floor();
    const after = new Map<string, SiteCell | undefined>();
    for (const k of stroke.keys()) after.set(k, f.cells[k] ? { ...f.cells[k]! } : undefined);
    undoStack.push({ fi, before: stroke, after });
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    stroke = null;
    touchSite(site); cb.onDirty();
  }
  function applyCells(entry: UndoEntry, which: 'before' | 'after'): void {
    fi = entry.fi;
    const f = floor();
    for (const [k, v] of entry[which]) {
      if (v) f.cells[k] = { ...v };
      else delete f.cells[k];
    }
    const ar = entry.area;
    if (ar) {
      f.areas ??= [];
      const idx = f.areas.findIndex((x) => x.id === ar.id);
      const want = which === 'before' ? ar.before : ar.after;
      if (!want) {
        if (idx >= 0) f.areas.splice(idx, 1);
        if (selectedArea === ar.id) selectedArea = null;
      } else if (idx >= 0) f.areas[idx] = { ...want };
      else f.areas.push({ ...want });
    }
    touchSite(site); cb.onDirty();
    invalidate(); renderFloorTabs(); renderPanel();
  }
  /** One undo entry for an area edit (create / delete / rename / note /
   *  move / resize) — the audit's "area edits aren't undoable". */
  function pushAreaUndo(before: SiteArea | null, after: SiteArea | null): void {
    undoStack.push({ fi, before: new Map(), after: new Map(), area: { id: (after ?? before)!.id, before, after } });
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
  }
  function undo(): void { const e = undoStack.pop(); if (e) { redoStack.push(e); applyCells(e, 'before'); } }
  function redo(): void { const e = redoStack.pop(); if (e) { undoStack.push(e); applyCells(e, 'after'); } }

  function commitRoomRect(r: { x0: number; y0: number; x1: number; y1: number }): void {
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
    const y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
    beginStroke();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) strokeCell(x, y, 'floor');
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      const cur = eff[cellKey(x, y)];
      if (!cur || cur.t === 'wall') strokeCell(x, y, 'wall'); // never bulldoze a door or a floor
    }
    endStroke();
  }
  function commitKeyRect(r: { x0: number; y0: number; x1: number; y1: number }): void {
    const f = floor();
    const a: SiteArea = {
      id: 'a_' + rid('', 8),
      label: 'New key',
      kind: 'room',
      x: Math.min(r.x0, r.x1), y: Math.min(r.y0, r.y1),
      w: Math.abs(r.x1 - r.x0) + 1, h: Math.abs(r.y1 - r.y0) + 1,
    };
    (f.areas ??= []).push(a);
    pushAreaUndo(null, { ...a });
    touchSite(site); cb.onDirty();
    selectArea(a.id, false);
    const input = panel.querySelector<HTMLInputElement>('[data-alabel]');
    input?.focus(); input?.select();
  }

  // ---------- pointer handling ----------
  let panning: { px: number; py: number; ox: number; oy: number } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let lastMid: { x: number; y: number } | null = null;
  let lastPaint: [number, number] | null = null;
  let lineFrom: [number, number] | null = null;
  let lineTo: [number, number] | null = null;
  let areaDrag: {
    id: string; mode: 'move' | 'resize'; corner: 0 | 1 | 2 | 3;
    startCx: number; startCy: number; orig: SiteArea; moved: boolean;
  } | null = null;

  /** Which resize handle (if any) sits under this pixel of the selected
   *  area: 0 tl, 1 tr, 2 bl, 3 br. */
  function cornerAt(a: SiteArea, px: number, py: number): 0 | 1 | 2 | 3 | null {
    const pts: Array<[number, number]> = [
      [ox + a.x * scale, oy + a.y * scale],
      [ox + (a.x + a.w) * scale, oy + a.y * scale],
      [ox + a.x * scale, oy + (a.y + a.h) * scale],
      [ox + (a.x + a.w) * scale, oy + (a.y + a.h) * scale],
    ];
    const r = Math.max(7, scale * 0.45);
    for (let i = 0; i < 4; i++) {
      if (Math.hypot(px - pts[i]![0], py - pts[i]![1]) <= r) return i as 0 | 1 | 2 | 3;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    pointers.set(ev.pointerId, { x: px, y: py });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      lastMid = null;
      panning = null;
      return;
    }
    const wantPan = tool === 'pan' || spaceHeld || ev.button === 1 || ev.button === 2;
    if (wantPan) { panning = { px, py, ox, oy }; return; }
    const [cx, cy] = cellAtPx(px, py);
    if (tool === 'select') {
      // a drag on the selected area moves it; on a corner handle, resizes.
      // A drag that never leaves its cell falls through to plain selection.
      const selA = selectedArea ? (floor().areas ?? []).find((a) => a.id === selectedArea) : null;
      if (selA && gmView) {
        const corner = cornerAt(selA, px, py);
        if (corner !== null) {
          areaDrag = { id: selA.id, mode: 'resize', corner, startCx: cx, startCy: cy, orig: { ...selA }, moved: false };
          return;
        }
        if (cx >= selA.x && cx < selA.x + selA.w && cy >= selA.y && cy < selA.y + selA.h) {
          areaDrag = { id: selA.id, mode: 'move', corner: 0, startCx: cx, startCy: cy, orig: { ...selA }, moved: false };
          return;
        }
      }
      handleSelect(cx, cy);
      return;
    }
    if (tool === 'room' || tool === 'key') { dragRect = { x0: cx, y0: cy, x1: cx, y1: cy }; requestDraw(); return; }
    if (ev.shiftKey) { lineFrom = [cx, cy]; lineTo = [cx, cy]; requestDraw(); return; }
    const t = tool === 'erase' ? null : PAINT[tool] ?? null;
    beginStroke();
    strokeCell(cx, cy, t as CellType | null);
    lastPaint = [cx, cy];
  });
  canvas.addEventListener('pointermove', (ev) => {
    const rect = canvas.getBoundingClientRect();
    const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: px, y: py });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDist > 0) {
        const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        zoomAt(mid.x, mid.y, d / pinchDist);
        // two-finger PAN rides the same gesture: the midpoint's travel
        // moves the map (tablets could pinch but never pan before)
        if (lastMid) { ox += mid.x - lastMid.x; oy += mid.y - lastMid.y; requestDraw(); }
        lastMid = mid;
        pinchDist = d;
      }
      return;
    }
    if (panning) { ox = panning.ox + (px - panning.px); oy = panning.oy + (py - panning.py); requestDraw(); return; }
    const [cx, cy] = cellAtPx(px, py);
    if (areaDrag) {
      const f = floor();
      const a = (f.areas ?? []).find((x) => x.id === areaDrag!.id);
      if (a) {
        const dxc = cx - areaDrag.startCx, dyc = cy - areaDrag.startCy;
        if (dxc || dyc) areaDrag.moved = true;
        const o = areaDrag.orig;
        if (areaDrag.mode === 'move') {
          a.x = Math.max(0, Math.min(f.w - a.w, o.x + dxc));
          a.y = Math.max(0, Math.min(f.h - a.h, o.y + dyc));
        } else {
          let x0 = o.x, y0 = o.y, x1 = o.x + o.w - 1, y1 = o.y + o.h - 1;
          if (areaDrag.corner === 0) { x0 += dxc; y0 += dyc; }
          else if (areaDrag.corner === 1) { x1 += dxc; y0 += dyc; }
          else if (areaDrag.corner === 2) { x0 += dxc; y1 += dyc; }
          else { x1 += dxc; y1 += dyc; }
          a.x = Math.max(0, Math.min(x0, x1));
          a.y = Math.max(0, Math.min(y0, y1));
          a.w = Math.min(Math.abs(x1 - x0) + 1, f.w - a.x);
          a.h = Math.min(Math.abs(y1 - y0) + 1, f.h - a.y);
        }
        requestDraw();
      }
      return;
    }
    if (dragRect) { dragRect.x1 = cx; dragRect.y1 = cy; requestDraw(); return; }
    if (lineFrom) { lineTo = [cx, cy]; requestDraw(); return; }
    if (stroke) {
      const t = (tool === 'erase' ? null : PAINT[tool] ?? null) as CellType | null;
      // interpolate: fast drags paint an unbroken path, not a dotted one
      if (lastPaint && (Math.abs(cx - lastPaint[0]) > 1 || Math.abs(cy - lastPaint[1]) > 1)) {
        paintLine(lastPaint[0], lastPaint[1], cx, cy, t);
      } else {
        strokeCell(cx, cy, t);
      }
      lastPaint = [cx, cy];
      return;
    }
    // hover feedback for select
    if (tool === 'select') {
      const a = areaAt(cx, cy);
      if ((a?.id ?? null) !== hoverArea) { hoverArea = a?.id ?? null; requestDraw(); }
    }
  });
  const finishPointer = (ev: PointerEvent): void => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (panning) { panning = null; return; }
    if (areaDrag) {
      const d = areaDrag;
      areaDrag = null;
      if (!d.moved) { handleSelect(d.startCx, d.startCy); return; } // it was just a click
      const a = (floor().areas ?? []).find((x) => x.id === d.id);
      if (a) pushAreaUndo({ ...d.orig }, { ...a });
      touchSite(site); cb.onDirty();
      renderPanel(); requestDraw();
      return;
    }
    if (lineFrom) {
      const f = floor();
      const [lx, ly] = lineFrom;
      const [tx, ty] = lineTo ?? lineFrom;
      lineFrom = lineTo = null;
      const t = (tool === 'erase' ? null : PAINT[tool] ?? null) as CellType | null;
      beginStroke();
      paintLine(lx, ly, Math.max(0, Math.min(f.w - 1, tx)), Math.max(0, Math.min(f.h - 1, ty)), t);
      endStroke();
      requestDraw();
      return;
    }
    if (dragRect) {
      const r = clampRect(dragRect);
      if (tool === 'room') commitRoomRect(r);
      else if (tool === 'key') commitKeyRect(r);
      dragRect = null;
      requestDraw();
      return;
    }
    endStroke();
    lastPaint = null;
  };
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });

  function clampRect(r: { x0: number; y0: number; x1: number; y1: number }) {
    const f = floor();
    const cl = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
    return { x0: cl(r.x0, f.w), y0: cl(r.y0, f.h), x1: cl(r.x1, f.w), y1: cl(r.y1, f.h) };
  }
  // zooming OUT past the floor ascends back to whatever hosts this site —
  // the map, the parent site, the spaces list (the locale→site transition's
  // return half; a couple of notches must accumulate, like the map's descent)
  let ascendCharge = 0;
  let ascendCoolT = 0;
  // …and zooming IN past the ceiling over a drillable area DESCENDS into it
  // (LAYERED-SPACES §3 — same charge idiom, opposite direction). GM view
  // creates the interior on the way in, exactly like the dblclick path.
  let descendCharge = 0;
  let descendCoolT = 0;
  let descendLabel: string | null = null;
  function drillTargetAt(cx: number, cy: number): { label: string; open: () => void } | null {
    if (!cb.onOpenSite) return null;
    const kids = childSites(world, site.id);
    for (const kid of kids) {
      if (Math.abs(kid.x - cx) <= 1 && Math.abs(kid.y - cy) <= 1) {
        return {
          label: world.entities[kid.entityId]?.name ?? 'the interior',
          open: () => cb.onOpenSite!(kid.id),
        };
      }
    }
    const a = areaAt(cx, cy);
    if (!a || (a.kind !== 'district' && a.kind !== 'building' && a.kind !== 'room')) return null;
    const existing = a.entityId ? kids.find((k) => k.entityId === a.entityId) : undefined;
    if (existing) return { label: a.label, open: () => cb.onOpenSite!(existing.id) };
    if (!gmView) return null;
    return {
      label: a.label,
      open: () => { const sid = makeSubSite(world, site, a, fi); cb.onDirty(); cb.onOpenSite!(sid); },
    };
  }
  const MAXS = 56;
  function zoomAt(px: number, py: number, factor: number): void {
    const MIN = 2.5;
    if (factor < 1 && scale <= MIN * 1.001 && (cb.onExit || site.parentSiteId)) {
      ascendCharge++;
      clearTimeout(ascendCoolT);
      ascendCoolT = window.setTimeout(() => { ascendCharge = 0; requestDraw(); }, 900);
      if (ascendCharge >= 3) {
        ascendCharge = 0;
        if (site.parentSiteId && cb.onOpenSite) cb.onOpenSite(site.parentSiteId);
        else cb.onExit?.();
        return;
      }
      requestDraw();
      return;
    }
    if (factor > 1) ascendCharge = 0;
    if (factor > 1 && scale >= MAXS * 0.999) {
      const [dcx, dcy] = cellAtPx(px, py);
      const target = drillTargetAt(dcx, dcy);
      if (target) {
        descendCharge++;
        descendLabel = target.label;
        clearTimeout(descendCoolT);
        descendCoolT = window.setTimeout(() => { descendCharge = 0; descendLabel = null; requestDraw(); }, 900);
        if (descendCharge >= 3) { descendCharge = 0; descendLabel = null; target.open(); return; }
        requestDraw();
        return;
      }
    }
    if (factor < 1) { descendCharge = 0; descendLabel = null; }
    const next = Math.max(MIN, Math.min(MAXS, scale * factor));
    ox = px - ((px - ox) / scale) * next;
    oy = py - ((py - oy) / scale) * next;
    scale = next;
    requestDraw();
  }

  function areaAt(cx: number, cy: number): SiteArea | null {
    const areas = (floor().areas ?? []).filter((a) => cx >= a.x && cx < a.x + a.w && cy >= a.y && cy < a.y + a.h);
    areas.sort((a, b) => a.w * a.h - b.w * b.h); // smallest wins
    return areas[0] ?? null;
  }
  // resolveBlock text per area, cached — draw() reads it every frame
  const lurkCache = new Map<string, string | null>();
  function lurkOf(a: SiteArea): string | null {
    if (!a.blockId || !cb.resolveBlock) return null;
    const hit = lurkCache.get(a.id);
    if (hit !== undefined) return hit;
    const text = cb.resolveBlock(a.blockId);
    const m = text && /^(?:Lurking here|Guardians): (.*)$/m.exec(text);
    const out = m ? `⚔ ${m[1]!}` : null;
    lurkCache.set(a.id, out);
    return out;
  }
  // double-click a building or district: straight into its interior — the
  // audit's "click a city building to enter it". A web-married area opens
  // its own page's building; only unbound areas mint one (makeSubSite).
  // GM only: players must not materialize entities.
  canvas.addEventListener('dblclick', (ev) => {
    const [cx, cy] = cellAtPx(ev.offsetX, ev.offsetY);
    if (tool === 'select') {
      if (!gmView || !cb.onOpenSite) return;
      const a = areaAt(cx, cy);
      if (!a || (a.kind !== 'building' && a.kind !== 'district')) return;
      const sid = makeSubSite(world, site, a, fi);
      cb.onDirty();
      cb.onOpenSite(sid);
      return;
    }
    if (tool === 'pan' || tool === 'room' || tool === 'key') return;
    // paint tools: double-click floods the contiguous region. The double
    // click's own two clicks already painted the seed cell — pop those
    // single-cell strokes back off, so the fill sees the ORIGINAL region
    // type and the whole fill lands as one clean undo entry.
    const k = cellKey(cx, cy);
    for (let i = 0; i < 2 && undoStack.length; i++) {
      const top = undoStack[undoStack.length - 1]!;
      if (top.area || top.fi !== fi || top.before.size !== 1 || !top.before.has(k)) break;
      undoStack.pop();
      const v = top.before.get(k);
      const f = floor();
      if (v) f.cells[k] = { ...v };
      else delete f.cells[k];
      patchEff(k);
      patchCache(cx, cy);
    }
    floodFill(cx, cy, (tool === 'erase' ? null : PAINT[tool] ?? null) as CellType | null);
  });
  function handleSelect(cx: number, cy: number): void {
    // a nested sub-site badge first, then the smallest keyed area; the cell
    // itself is always selected too (the pin inspector lives on it)
    for (const kid of childSites(world, site.id)) {
      if (Math.abs(kid.x - cx) <= 1 && Math.abs(kid.y - cy) <= 1) { cb.onOpenSite?.(kid.id); return; }
    }
    selectedCell = inBounds(cx, cy) ? [cx, cy] : null;
    const a = areaAt(cx, cy);
    if (a) selectArea(a.id, false);
    else { selectedArea = null; renderPanel(); requestDraw(); }
  }

  // ---------- keyboard ----------
  const onKey = (ev: KeyboardEvent): void => {
    if (destroyed) return;
    const tag = (ev.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (ev.key === ' ') { spaceHeld = ev.type === 'keydown'; return; }
    if (ev.type !== 'keydown') return;
    if (ev.key === 'Escape') { setTool('select'); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); return; }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); return; }
    // mnemonic tool keys — the number row only ever reached 9 of 12 tools
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const mapped = HOTKEYS[ev.key.toLowerCase()];
      if (mapped) { setTool(mapped); return; }
    }
    const idx = Number(ev.key) - 1;
    if (idx >= 0 && idx < TOOLS.length) setTool(TOOLS[idx]!.id);
  };
  const setTool = (t: Tool): void => {
    tool = t;
    root.querySelectorAll<HTMLElement>('[data-tool]').forEach((o) => o.classList.toggle('on', o.getAttribute('data-tool') === t));
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  // ---------- rendering ----------
  let drawQueued = false;
  function requestDraw(): void {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }

  // Two tiers: a per-floor offscreen cache (rebuilt on invalidate, patched
  // per edited cell) is blitted while the zoom sits at-or-below its
  // resolution — panning a 220×220 city is one drawImage, not 48k
  // fillRects. Zoomed in past the cache, only the visible window draws
  // immediate-mode (a small window at those scales).
  let cache: HTMLCanvasElement | null = null;
  let cacheS = 0;
  function rebuildCache(): void {
    const f = floor();
    cacheS = Math.max(2, Math.min(12, Math.floor(2400 / Math.max(f.w, f.h))));
    if (!cache) cache = document.createElement('canvas');
    cache.width = f.w * cacheS;
    cache.height = f.h * cacheS;
    const g = cache.getContext('2d')!;
    g.fillStyle = PAL.parchment;
    g.fillRect(0, 0, cache.width, cache.height);
    drawCellsWindow(g, eff, cacheS, 0, 0, 0, 0, f.w - 1, f.h - 1, !gmView);
  }
  /** Repaint the cache around one edited cell (3×3 — a door's leaf follows
   *  its neighbours' passability, so the ring redraws too). */
  function patchCache(x: number, y: number): void {
    if (!cache) return;
    const f = floor();
    const g = cache.getContext('2d')!;
    const x0 = Math.max(0, x - 1), y0 = Math.max(0, y - 1);
    const x1 = Math.min(f.w - 1, x + 1), y1 = Math.min(f.h - 1, y + 1);
    g.fillStyle = PAL.parchment;
    g.fillRect(x0 * cacheS, y0 * cacheS, (x1 - x0 + 1) * cacheS, (y1 - y0 + 1) * cacheS);
    drawCellsWindow(g, eff, cacheS, 0, 0, x0, y0, x1, y1, !gmView);
  }

  function drawCellsWindow(g: CanvasRenderingContext2D, cells: Record<string, SiteCell>, s: number, offx: number, offy: number, x0: number, y0: number, x1: number, y1: number, hideSecrets: boolean): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = cells[cellKey(x, y)];
      if (!c) continue;
      const px = offx + x * s, py = offy + y * s;
      const t = hideSecrets && c.t === 'secret' ? 'wall' : c.t;
      switch (t) {
        case 'floor':
          // a garden-court floor (R4) wears the green tint; ordinary floor is
          // paved parchment. Role rides base cells cosmetically (never `t`).
          g.fillStyle = c.role ? ROLE_FILL[c.role] ?? PAL.floor : PAL.floor;
          g.fillRect(px, py, s, s);
          if (s >= 7) { g.strokeStyle = PAL.gridline; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1); }
          break;
        case 'wall':
          // a building's civic role tints its mass (R3) so a temple, an inn,
          // a keep read apart from the dark house fabric — cosmetic only
          g.fillStyle = c.role ? ROLE_FILL[c.role] ?? PAL.wall : PAL.wall;
          g.fillRect(px, py, s, s);
          break;
        case 'door': case 'secret':
          // a wall cell with a wooden leaf across the passage
          g.fillStyle = PAL.wall; g.fillRect(px, py, s, s);
          g.fillStyle = PAL.door;
          if (passable(cells, x, y - 1) || passable(cells, x, y + 1)) g.fillRect(px + s * 0.28, py + s * 0.08, s * 0.44, s * 0.84);
          else g.fillRect(px + s * 0.08, py + s * 0.28, s * 0.84, s * 0.44);
          if (t === 'secret' && s >= 10) {
            g.fillStyle = 'rgba(247,240,220,0.9)';
            g.font = `${Math.floor(s * 0.5)}px serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('S', px + s / 2, py + s / 2);
          }
          break;
        case 'stairs': {
          g.fillStyle = PAL.floor; g.fillRect(px, py, s, s);
          g.fillStyle = PAL.stairs;
          const steps = 4;
          for (let i = 0; i < steps; i++) g.fillRect(px + s * 0.12, py + s * (0.15 + i * 0.2), s * 0.76, s * 0.09);
          break;
        }
        case 'water':
          g.fillStyle = PAL.water; g.fillRect(px, py, s, s);
          if (s >= 9) {
            g.strokeStyle = PAL.waterEdge; g.lineWidth = Math.max(1, s * 0.05);
            g.beginPath();
            g.moveTo(px + s * 0.15, py + s * 0.55);
            g.quadraticCurveTo(px + s * 0.35, py + s * 0.4, px + s * 0.5, py + s * 0.55);
            g.quadraticCurveTo(px + s * 0.68, py + s * 0.7, px + s * 0.85, py + s * 0.55);
            g.stroke();
          }
          break;
        case 'hazard':
          g.fillStyle = PAL.floor; g.fillRect(px, py, s, s);
          g.fillStyle = PAL.hazard;
          g.beginPath();
          g.moveTo(px + s / 2, py + s * 0.14);
          g.lineTo(px + s * 0.86, py + s * 0.82);
          g.lineTo(px + s * 0.14, py + s * 0.82);
          g.closePath(); g.fill();
          if (s >= 12) {
            g.fillStyle = PAL.parchment;
            g.font = `bold ${Math.floor(s * 0.42)}px serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('!', px + s / 2, py + s * 0.62);
          }
          break;
        default: break; // 'void' overrides never appear in effective cells
      }
      // relief pass — drawn into the cache, so it costs nothing per frame:
      // walls wear ink on their open edges (buildings become inked blocks),
      // open ground wears a shadow where a wall stands over it
      const solid = (xx: number, yy: number): boolean => {
        const n = cells[cellKey(xx, yy)];
        return !!n && (n.t === 'wall' || n.t === 'door' || n.t === 'secret');
      };
      if (t === 'wall') {
        g.fillStyle = PAL.wallEdge;
        const e = Math.max(1, s * 0.14);
        if (!solid(x, y - 1)) g.fillRect(px, py, s, e);
        if (!solid(x, y + 1)) g.fillRect(px, py + s - e, s, e);
        if (!solid(x - 1, y)) g.fillRect(px, py, e, s);
        if (!solid(x + 1, y)) g.fillRect(px + s - e, py, e, s);
      } else if (t !== 'door' && t !== 'secret' && t !== 'void') {
        g.fillStyle = PAL.shadow;
        const e = Math.max(1, s * 0.22);
        if (solid(x, y - 1)) g.fillRect(px, py, s, e);
        if (solid(x, y + 1)) g.fillRect(px, py + s - e, s, e);
        if (solid(x - 1, y)) g.fillRect(px, py, e, s);
        if (solid(x + 1, y)) g.fillRect(px + s - e, py, e, s);
      }
      // a pinned page wears its marker (the prize in room 12)
      if (c.entityId) {
        g.fillStyle = PAL.accent;
        g.beginPath();
        g.arc(px + s * 0.5, py + s * 0.42, Math.max(2.5, s * 0.22), 0, Math.PI * 2);
        g.fill();
        g.fillRect(px + s * 0.46, py + s * 0.42, Math.max(1.2, s * 0.08), s * 0.4);
        if (s >= 14) {
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(px + s * 0.5, py + s * 0.42, Math.max(1, s * 0.08), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  const passable = (cells: Record<string, SiteCell>, x: number, y: number): boolean => {
    const c = cells[cellKey(x, y)];
    return !!c && c.t !== 'wall' && c.t !== 'void';
  };

  function draw(): void {
    if (destroyed) return;
    const f = floor();
    const cw = canvas.clientWidth, chh = canvas.clientHeight;
    if (!cw || !chh) return;
    DPR = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(cw * DPR) || canvas.height !== Math.round(chh * DPR)) {
      canvas.width = Math.round(cw * DPR);
      canvas.height = Math.round(chh * DPR);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = PAL.page;
    ctx.fillRect(0, 0, cw, chh);
    if (cache && scale <= cacheS) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cache, ox, oy, f.w * scale, f.h * scale);
    } else {
      ctx.fillStyle = PAL.parchment;
      ctx.fillRect(ox, oy, f.w * scale, f.h * scale);
      const wx0 = Math.max(0, Math.floor((0 - ox) / scale)), wy0 = Math.max(0, Math.floor((0 - oy) / scale));
      const wx1 = Math.min(f.w - 1, Math.ceil((cw - ox) / scale)), wy1 = Math.min(f.h - 1, Math.ceil((chh - oy) / scale));
      drawCellsWindow(ctx, eff, scale, ox, oy, wx0, wy0, wx1, wy1, !gmView);
    }

    // keyed areas: labels always at readable zoom, outline on hover/selection
    for (const a of f.areas ?? []) {
      const px = ox + a.x * scale, py = oy + a.y * scale;
      if (a.id === selectedArea || a.id === hoverArea) {
        ctx.strokeStyle = PAL.accent;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, a.w * scale - 2, a.h * scale - 2);
        ctx.setLineDash([]);
      }
      // the selected key wears corner handles: drag one to resize, drag the
      // body to move (select tool, GM view)
      if (a.id === selectedArea && gmView && tool === 'select') {
        const hs = Math.max(8, scale * 0.45);
        for (const [hx, hy] of [
          [px, py], [px + a.w * scale, py],
          [px, py + a.h * scale], [px + a.w * scale, py + a.h * scale],
        ] as const) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
          ctx.fillStyle = PAL.accent;
          ctx.fillRect(hx - hs / 2 + 1.5, hy - hs / 2 + 1.5, hs - 3, hs - 3);
        }
      }
      // labels gate on the AREA's pixel size, not the zoom: districts read
      // at fit zoom (they're huge), rooms appear as you close in — and a
      // parchment halo keeps every label legible over the fabric
      const wpx = a.w * scale, hpx = a.h * scale;
      const big = a.kind === 'district' || a.kind === 'plaza';
      if (a.id === selectedArea || wpx >= (big ? 90 : 48)) {
        const text = big ? a.label.toUpperCase() : a.label;
        ctx.font = big
          ? `600 ${Math.max(11, Math.min(18, wpx / 14))}px var(--font-body, serif)`
          : `${Math.max(11, Math.min(15, scale * 0.8))}px var(--font-body, serif)`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(247, 240, 220, 0.8)';
        ctx.strokeText(text, px + wpx / 2, py + hpx / 2, Math.max(40, wpx));
        ctx.fillStyle = big ? 'rgba(63, 54, 38, 0.6)' : PAL.label;
        ctx.fillText(text, px + wpx / 2, py + hpx / 2, Math.max(40, wpx));
        // the occupants walk onto the map: a room's "Lurking here" (or a
        // lair's "Guardians") rides under its label — GM view only
        const lurk = gmView && !big && scale >= 8 ? lurkOf(a) : null;
        if (lurk) {
          const ly = py + hpx / 2 + Math.max(12, scale * 0.9);
          ctx.font = `${Math.max(9, Math.min(12, scale * 0.55))}px var(--font-body, serif)`;
          ctx.strokeText(lurk, px + wpx / 2, ly, Math.max(40, wpx));
          ctx.fillStyle = 'rgba(138, 90, 43, 0.9)';
          ctx.fillText(lurk, px + wpx / 2, ly, Math.max(40, wpx));
        }
      }
    }
    // THE PREVIEW BLIT (LAYERED-SPACES §3): once a drilled area grows large
    // on screen, its child's actual map fades in over the flat ward wash —
    // the seam between the layers reads continuous without a multi-scale
    // renderer. Charging to descend brightens it.
    {
      const f2 = floor();
      const kidByEntity2 = new Map(childSites(world, site.id).map((k) => [k.entityId, k]));
      for (const a of f2.areas ?? []) {
        const kid = a.entityId ? kidByEntity2.get(a.entityId) : undefined;
        if (!kid) continue;
        const wpx = a.w * scale;
        if (wpx < 140) continue;
        const thumb = kidThumb(kid);
        if (!thumb) continue;
        let alpha = Math.min(0.85, ((wpx - 140) / 260) * 0.7 + 0.25);
        if (descendCharge > 0 && descendLabel === a.label) alpha = Math.min(0.95, alpha + descendCharge * 0.15);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(thumb, ox + a.x * scale, oy + a.y * scale, a.w * scale, a.h * scale);
        ctx.restore();
      }
    }
    // nested sub-sites wear a badge at their anchor cell
    for (const kid of childSites(world, site.id)) {
      const px = ox + kid.x * scale, py = oy + kid.y * scale;
      ctx.fillStyle = PAL.accent;
      ctx.beginPath(); ctx.arc(px, py, Math.max(7, scale * 0.45), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(9, scale * 0.5)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⌂', px, py);
    }
    // the selected cell wears a thin frame
    if (selectedCell && tool === 'select') {
      const [scx, scy] = selectedCell;
      ctx.strokeStyle = PAL.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + scx * scale + 0.75, oy + scy * scale + 0.75, scale - 1.5, scale - 1.5);
    }
    // the ascent charging: a quiet cue that another notch leaves the site
    if (ascendCharge > 0) {
      ctx.font = '600 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = PAL.label;
      ctx.fillText('zoom out again to leave…', cw / 2, chh - 16);
    }
    // …and the descent charging, its mirror
    if (descendCharge > 0 && descendLabel) {
      ctx.font = '600 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = PAL.label;
      ctx.fillText(`keep zooming to enter ${descendLabel}…`, cw / 2, chh - 16);
    }
    // the scale bar (LAYERED-SPACES §3 scale honesty): sites claim feet per
    // cell — show it, like the hex map does
    {
      const candidates = [10, 25, 50, 100, 250, 500, 1000, 2640, 5280, 10560, 26400];
      const ftLen = candidates.find((ft) => (ft / site.cellFt) * scale >= 64) ?? candidates[candidates.length - 1]!;
      const barPx = Math.min(cw * 0.4, (ftLen / site.cellFt) * scale);
      const bx = 14, by = chh - 14;
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by);
      ctx.lineTo(bx + barPx, by); ctx.lineTo(bx + barPx, by - 4);
      ctx.stroke();
      ctx.font = '600 11px system-ui';
      ctx.textAlign = 'left';
      ctx.fillStyle = PAL.label;
      ctx.fillText(ftLen >= 2640 ? `${(ftLen / 5280).toLocaleString()} mi` : `${ftLen.toLocaleString()} ft`, bx + 4, by - 7);
    }
    // shift-line preview
    if (lineFrom && lineTo) {
      ctx.strokeStyle = PAL.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(ox + (lineFrom[0] + 0.5) * scale, oy + (lineFrom[1] + 0.5) * scale);
      ctx.lineTo(ox + (lineTo[0] + 0.5) * scale, oy + (lineTo[1] + 0.5) * scale);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // drag preview
    if (dragRect) {
      const r = clampRect(dragRect);
      const px = ox + Math.min(r.x0, r.x1) * scale, py = oy + Math.min(r.y0, r.y1) * scale;
      const wpx = (Math.abs(r.x1 - r.x0) + 1) * scale, hpx = (Math.abs(r.y1 - r.y0) + 1) * scale;
      ctx.strokeStyle = PAL.accent;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(px, py, wpx, hpx);
      ctx.setLineDash([]);
    }
  }

  function fitView(): void {
    const f = floor();
    const cw = canvas.clientWidth, chh = canvas.clientHeight;
    if (!cw || !chh) return;
    scale = Math.max(2.5, Math.min(30, Math.min(cw / (f.w + 4), chh / (f.h + 4))));
    ox = (cw - f.w * scale) / 2;
    oy = (chh - f.h * scale) / 2;
  }

  function renderPng(pxPerCell?: number, hideSecrets?: boolean): HTMLCanvasElement {
    const f = floor();
    const s = pxPerCell ?? Math.max(8, Math.min(28, Math.floor(8192 / Math.max(f.w, f.h))));
    const c = document.createElement('canvas');
    c.width = f.w * s;
    c.height = f.h * s;
    const g = c.getContext('2d')!;
    g.fillStyle = PAL.parchment;
    g.fillRect(0, 0, c.width, c.height);
    drawCellsWindow(g, eff, s, 0, 0, 0, 0, f.w - 1, f.h - 1, hideSecrets ?? !gmView);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const a of f.areas ?? []) {
      const big = a.kind === 'district' || a.kind === 'plaza';
      const text = big ? a.label.toUpperCase() : a.label;
      g.font = big ? `600 ${Math.max(11, s * 0.9)}px serif` : `${Math.max(10, s * 0.8)}px serif`;
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(247, 240, 220, 0.8)';
      g.strokeText(text, (a.x + a.w / 2) * s, (a.y + a.h / 2) * s, Math.max(48, a.w * s));
      g.fillStyle = big ? 'rgba(63, 54, 38, 0.6)' : PAL.label;
      g.fillText(text, (a.x + a.w / 2) * s, (a.y + a.h / 2) * s, Math.max(48, a.w * s));
    }
    return c;
  }

  // ---------- boot ----------
  const ro = new ResizeObserver(() => {
    const first = !canvas.width;
    if (first) fitView();
    requestDraw();
  });
  ro.observe(canvasHost);
  invalidate();
  renderFloorTabs();
  renderPanel();
  fitView();
  requestDraw();

  return {
    destroy(): void {
      destroyed = true;
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      host.innerHTML = '';
    },
    refresh(): void { invalidate(); renderFloorTabs(); renderPanel(); },
    renderPng,
    get siteId(): string { return site.id; },
  };
}

/** A small flat render of a site's ground floor — the hub shelf's picture.
 *  No glyphs, no labels: at a few px per cell only the shapes matter.
 *  Callers cache by site rev — a large city's base regen is ~150ms. */
export function renderSiteThumb(site: SiteRec, maxPx = 240): HTMLCanvasElement {
  const f = site.floors.find((x) => (x.z ?? 0) === 0) ?? site.floors[0]!;
  const eff = effectiveCells(f, (g, w, h) => cellsFor(g, w, h));
  const theme = f.gen ? parseGenerator(f.gen.generator)?.opts.theme : undefined;
  const pal = { ...C, ...(theme ? THEME_TINT[theme] ?? {} : {}) };
  const s = Math.max(1, Math.floor(maxPx / Math.max(f.w, f.h)));
  const c = document.createElement('canvas');
  c.width = f.w * s;
  c.height = f.h * s;
  const g = c.getContext('2d')!;
  g.fillStyle = pal.parchment;
  g.fillRect(0, 0, c.width, c.height);
  const FILL: Record<string, string> = {
    floor: pal.floor, wall: pal.wall, door: pal.door, secret: pal.wall,
    stairs: pal.stairs, water: pal.water, hazard: pal.hazard,
  };
  for (const [k, cell] of Object.entries(eff)) {
    const fill = FILL[cell.t];
    if (!fill) continue;
    const i = k.indexOf(',');
    g.fillStyle = fill;
    g.fillRect(Number(k.slice(0, i)) * s, Number(k.slice(i + 1)) * s, s, s);
  }
  return c;
}

// deleting a page must not strand its geometry — the /world/ page calls this
// when an entity with a site is deleted
export function deleteSiteForEntity(world: WorldDoc, entityId: string): void {
  for (const p of (world.planes ?? []) as Array<{ sites?: SiteRec[] }>) {
    for (const s of p.sites ?? []) {
      if (s.entityId === entityId) removeSite(world, s.id);
    }
  }
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
const escapeAttr = escapeHtml;
