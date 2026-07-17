// Map interchange exports for sites.
//
// Universal VTT export (.uvtt / .dd2vtt family): the map as a PLAYABLE scene
// — embedded image + line-of-sight walls + door portals — importable by
// Foundry, Roll20 (script), Fantasy Grounds, Arkenforge. Walls are derived
// from the cell grid: every edge between a passable cell and wall/void
// becomes a LOS polyline, doors become portals that plug the gaps. This is
// the whole reason the geometry lives as data instead of paint.
// Field shapes follow the format 0.3 files Dungeondraft emits (verified
// against the FVTT-DD-Import reader, research 2026-07-17).

import { cellKey, type SiteCell, type SiteArea } from './sites.ts';

interface Pt { x: number; y: number }
export interface UvttDoc {
  format: number;
  resolution: { map_origin: Pt; map_size: Pt; pixels_per_grid: number };
  line_of_sight: Pt[][];
  objects_line_of_sight: Pt[][];
  portals: Array<{ position: Pt; bounds: Pt[]; rotation: number; closed: boolean; freestanding: boolean }>;
  environment: { baked_lighting: boolean; ambient_light: string };
  lights: unknown[];
  image: string;
  software?: string;
}

const PASSABLE = new Set(['floor', 'stairs', 'water', 'hazard']);
const DOORISH = new Set(['door', 'secret']);

export function buildUvtt(
  cells: Record<string, SiteCell>,
  w: number,
  h: number,
  image: HTMLCanvasElement,
  pixelsPerGrid: number,
): UvttDoc {
  const type = (x: number, y: number): string | null => cells[cellKey(x, y)]?.t ?? null;
  const open = (t: string | null): boolean => !!t && (PASSABLE.has(t) || DOORISH.has(t));

  // Walls: for every open cell, each of its 4 edges facing a non-open cell
  // (wall or void) is a blocking segment — UNLESS both cells are open (a
  // doorway's opening is covered by its portal, not a wall). Collect edges
  // per grid line, then merge runs into polylines.
  const hRuns = new Map<number, Array<[number, number]>>(); // y-line -> [x0,x1) runs
  const vRuns = new Map<number, Array<[number, number]>>(); // x-line -> [y0,y1) runs
  const addRun = (m: Map<number, Array<[number, number]>>, line: number, a: number): void => {
    let runs = m.get(line);
    if (!runs) { runs = []; m.set(line, runs); }
    runs.push([a, a + 1]);
  };
  for (const [k, c] of Object.entries(cells)) {
    if (!open(c.t)) continue;
    const i = k.indexOf(',');
    const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
    if (!open(type(x, y - 1))) addRun(hRuns, y, x);
    if (!open(type(x, y + 1))) addRun(hRuns, y + 1, x);
    if (!open(type(x - 1, y))) addRun(vRuns, x, y);
    if (!open(type(x + 1, y))) addRun(vRuns, x + 1, y);
  }
  const mergeRuns = (runs: Array<[number, number]>): Array<[number, number]> => {
    runs.sort((a, b) => a[0] - b[0]);
    const out: Array<[number, number]> = [];
    for (const r of runs) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push([r[0], r[1]]);
    }
    return out;
  };
  const los: Pt[][] = [];
  for (const [y, runs] of hRuns) for (const [x0, x1] of mergeRuns(runs)) {
    los.push([{ x: x0, y }, { x: x1, y }]);
  }
  for (const [x, runs] of vRuns) for (const [y0, y1] of mergeRuns(runs)) {
    los.push([{ x, y: y0 }, { x, y: y1 }]);
  }

  // Portals: each door/secret cell gets a leaf across the passage direction.
  const portals: UvttDoc['portals'] = [];
  for (const [k, c] of Object.entries(cells)) {
    if (!DOORISH.has(c.t)) continue;
    const i = k.indexOf(',');
    const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
    const northSouth = open(type(x, y - 1)) || open(type(x, y + 1));
    const bounds: Pt[] = northSouth
      ? [{ x, y: y + 0.5 }, { x: x + 1, y: y + 0.5 }] // passage runs N–S: leaf lies E–W
      : [{ x: x + 0.5, y }, { x: x + 0.5, y: y + 1 }];
    portals.push({
      position: { x: x + 0.5, y: y + 0.5 },
      bounds,
      rotation: northSouth ? 0 : Math.PI / 2,
      closed: true,
      freestanding: false,
    });
  }

  return {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: w, y: h }, pixels_per_grid: pixelsPerGrid },
    line_of_sight: los,
    objects_line_of_sight: [],
    portals,
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights: [],
    image: image.toDataURL('image/png').split(',')[1] ?? '',
    software: 'Storyteller Toolbox',
  };
}

// ─── One Page Dungeon JSON export ──────────────────────────────────────────
// The other half of the interchange story (import landed in B183): the
// closest thing the hobby has to a dungeon standard, read by Dungeon
// Scrawl, Mipui, RPG Map Editor 2, and several Foundry importers. Rooms and
// corridors are axis-aligned rects; we greedy-cover the open cells with
// maximal rectangles — not the minimal decomposition, but importers only
// union them, so coverage is what matters (the round-trip smoke pins it).

export interface OpdDoc {
  version: string;
  title: string;
  story: string;
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  doors: Array<{ x: number; y: number; dir: { x: number; y: number }; type: number }>;
  notes: Array<{ text: string; ref: string; pos: { x: number; y: number } }>;
  columns: Array<{ x: number; y: number }>;
  water: Array<{ x: number; y: number }>;
}

/** Watabou door enum (research 2026-07-17): 1 plain, 6 secret. Our doors
 *  carry no open/portcullis nuance, so everything maps onto those two. */
export function buildOpd(
  cells: Record<string, SiteCell>,
  areas: SiteArea[],
  title: string,
  story = '',
): OpdDoc {
  // rect cover runs over cells that OPD models as room space — floor and
  // the cells that live inside rooms (stairs, hazards); water and doors
  // have their own lists
  const roomish = new Set<string>();
  const doors: OpdDoc['doors'] = [];
  const water: OpdDoc['water'] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const at = (x: number, y: number): SiteCell | undefined => cells[cellKey(x, y)];
  const open = (x: number, y: number): boolean => {
    const t = at(x, y)?.t;
    return !!t && t !== 'wall' && t !== 'void';
  };
  for (const [k, c] of Object.entries(cells)) {
    const i = k.indexOf(',');
    const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
    if (c.t === 'wall' || c.t === 'void') continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    if (c.t === 'door' || c.t === 'secret') {
      const northSouth = open(x, y - 1) || open(x, y + 1);
      doors.push({ x, y, dir: northSouth ? { x: 0, y: 1 } : { x: 1, y: 0 }, type: c.t === 'secret' ? 6 : 1 });
      continue;
    }
    if (c.t === 'water') { water.push({ x, y }); continue; }
    roomish.add(k);
  }

  // greedy maximal-rect cover: grow a row run, then extend it downward
  const covered = new Set<string>();
  const rects: OpdDoc['rects'] = [];
  if (roomish.size) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = cellKey(x, y);
        if (!roomish.has(k) || covered.has(k)) continue;
        let w = 1;
        while (roomish.has(cellKey(x + w, y)) && !covered.has(cellKey(x + w, y))) w++;
        let h = 1;
        rows: while (true) {
          for (let dx = 0; dx < w; dx++) {
            const kk = cellKey(x + dx, y + h);
            if (!roomish.has(kk) || covered.has(kk)) break rows;
          }
          h++;
        }
        for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) covered.add(cellKey(x + dx, y + dy));
        rects.push({ x, y, w, h });
      }
    }
  }

  // the key: every labelled area becomes a numbered note at its centre
  const notes: OpdDoc['notes'] = areas.map((a, i) => ({
    text: a.note?.trim() ? `${a.label} — ${a.note.trim()}` : a.label,
    ref: String(i + 1),
    pos: { x: a.x + a.w / 2, y: a.y + a.h / 2 },
  }));

  return { version: 'stb-1', title, story, rects, doors, notes, columns: [], water };
}
