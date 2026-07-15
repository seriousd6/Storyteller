// The hex lattice, shared.
//
// This math used to live only inside mountMap() as closures, which was fine
// while the map was the only thing that indexed hexes. It stopped being fine
// the moment something else had to MINT hex addresses: a claim written as
// "world:12,-3" is only meaningful if the writer and the renderer agree on
// exactly which hex that is, down to the rounding. Copying eight lines to get
// there is precisely the dual-development the owner asked us to stop doing
// (PLAN, ⚖️ one implementation), so the lattice lives here and mapView reads
// it like everyone else.
//
// Axial coordinates, pointy-top, x periodic in longitude.

export const SQ3 = Math.sqrt(3);

/** Centre-to-corner radius of a hex whose flat-to-flat span is `hexFt`. */
export const hexR = (hexFt: number): number => hexFt / SQ3;

/** World-space centre of axial hex (q,r). */
export function hexCenter(hexFt: number, q: number, r: number): [number, number] {
  const R = hexR(hexFt);
  return [SQ3 * R * (q + r / 2), 1.5 * R * r];
}

/** The hex containing a world point — cube-rounded, so ties break the way the
 *  renderer's highlight expects. */
export function pointToHex(hexFt: number, x: number, y: number): [number, number] {
  const R = hexR(hexFt);
  const qf = (SQ3 / 3 * x - y / 3) / R, rf = (2 / 3 * y) / R;
  let rq = Math.round(qf), rr = Math.round(rf);
  const rs = Math.round(-qf - rf);
  const dq = Math.abs(rq - qf), dr = Math.abs(rr - rf), ds = Math.abs(rs + qf + rf);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

// NB: no EDGE_DIRS here on purpose. Neighbour order is only meaningful paired
// with a corner order, and mapView's is wound to match its own corner() when it
// strokes a claim's outline. A second, differently-wound copy exported from a
// "shared" module is a trap, not a convenience.

/** Hex spans a claim may be addressed at. mapView renders any of these; the
 *  ids are the literal prefixes in a claim address. */
export const CLAIM_HEX_FT = { world: 316_800, region: 31_680, locale: 500 } as const;
export type ClaimTier = keyof typeof CLAIM_HEX_FT;

/** The wire form of a claimed hex: `plane.claims[ownerId]` is a list of these. */
export const claimAddr = (tier: ClaimTier, q: number, r: number): string => `${tier}:${q},${r}`;

/** How many hex columns span the world east–west, for seam aliasing. */
export const columnsPerWorld = (hexFt: number, circumFt: number): number =>
  Math.round(circumFt / (SQ3 * hexR(hexFt)));

/**
 * Give every crown a colour, so that no two crowns THAT TOUCH share one.
 *
 * Lives here rather than beside the renderer that uses it because it is pure
 * claim-address graph work with no canvas in it — and because mapView.ts
 * imports registry.json, which makes it unloadable from Node and so untestable
 * anywhere but a browser.
 *
 * The old rule was `CLAIM_COLORS[i % 6]` — palette order by insertion order.
 * With the handful of hand-painted realms this was written for, that was fine.
 * With Earth's 245 it is unreadable: neighbours collide constantly and the
 * political map turns into six enormous smears.
 *
 * The instinct is "245 realms need 245 colours". They don't — that would be
 * unreadable in its own way, 245 muddy hues nobody can tell apart. A political
 * map is a planar graph, four colours provably suffice for any of them, and
 * greedy colouring on a planar graph never needs more than six. So the palette
 * was always big enough; only the ASSIGNMENT was naive. Welsh–Powell (colour
 * the busiest borders first) gets it done in the six we already have.
 */
export function colorClaims(
  claims: Record<string, string[]>,
  palette: readonly string[],
  circumFt: number,
): { colors: Map<string, string>; conflicts: number } {
  const ADJ = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;
  // hex -> owner, with q folded into one world so the east–west seam doesn't
  // read as a border (the same aliasing rebuildClaims does for its edges)
  const owns = new Map<string, string>();
  const parsed = new Map<string, Array<[string, number, number]>>();
  for (const [owner, addrs] of Object.entries(claims)) {
    const mine: Array<[string, number, number]> = [];
    for (const addr of addrs) {
      const m = /^(world|region|locale):(-?\d+),(-?\d+)$/.exec(addr);
      if (!m) continue;
      const tier = m[1] as ClaimTier;
      const cols = columnsPerWorld(CLAIM_HEX_FT[tier], circumFt);
      const q = ((Number(m[2]) % cols) + cols) % cols;
      const r = Number(m[3]);
      mine.push([tier, q, r]);
      owns.set(`${tier}:${q},${r}`, owner);
    }
    parsed.set(owner, mine);
  }

  const nbrs = new Map<string, Set<string>>();
  const edge = (a: string, b: string): void => {
    let s = nbrs.get(a);
    if (!s) { s = new Set(); nbrs.set(a, s); }
    s.add(b);
  };
  for (const [owner, hexes] of parsed) {
    if (!nbrs.has(owner)) nbrs.set(owner, new Set());
    for (const [tier, q, r] of hexes) {
      const cols = columnsPerWorld(CLAIM_HEX_FT[tier as ClaimTier], circumFt);
      for (const [dq, dr] of ADJ) {
        const nq = (((q + dq) % cols) + cols) % cols;
        const other = owns.get(`${tier}:${nq},${r + dr}`);
        if (other && other !== owner) { edge(owner, other); edge(other, owner); }
      }
    }
  }

  // busiest borders first: a crown hemmed in by many neighbours has the fewest
  // free colours, so it must choose before its roomier neighbours use them up
  const order = [...nbrs.keys()].sort((a, b) => (nbrs.get(b)!.size - nbrs.get(a)!.size));
  const idx = new Map<string, number>();
  for (const owner of order) {
    const taken = new Set<number>();
    for (const n of nbrs.get(owner)!) { const c = idx.get(n); if (c !== undefined) taken.add(c); }
    let c = 0;
    while (c < palette.length && taken.has(c)) c++;
    idx.set(owner, c < palette.length ? c : 0); // planar graphs never get here
  }
  // anything left over (an owner with no claimed hex, so no edges) still needs
  // a colour for its legend swatch
  let spare = 0;
  const colors = new Map<string, string>();
  for (const owner of Object.keys(claims)) {
    const c = idx.get(owner) ?? (spare++ % palette.length);
    colors.set(owner, palette[c]!);
  }
  let conflicts = 0;
  for (const [owner, set] of nbrs) {
    for (const n of set) if (idx.get(owner) === idx.get(n)) conflicts++;
  }
  return { colors, conflicts: conflicts / 2 };
}
