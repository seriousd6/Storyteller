// Genre themes (docs/sheets/PLAN.md §15) + the fade-mask families they own
// (§14). A genre is a pure token contract — palette, fonts, statblock ink,
// ornament, mask set, dice skin — applied via [data-genre] on <html> (the
// site-wide picker) or on a sheet surface (the per-document pin). The CSS
// packs live in src/styles/genres/*; this module is the single source for
// what genres and masks EXIST, so pickers never hand-roll the list.

export type GenreId = 'fantasy' | 'scifi' | 'horror';

export interface GenreDef {
  id: GenreId;
  label: string;
}

export const GENRES: GenreDef[] = [
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'scifi', label: 'Sci-fi' },
  { id: 'horror', label: 'Horror' },
];

export interface MaskDef {
  id: string;
  label: string;
  url: string;
}

// Three fades per genre (PLAN.md §14) — grayscale SVG masks in public/masks/,
// applied with mask-image so the source pixels are never edited.
export const MASKS: Record<GenreId, MaskDef[]> = {
  fantasy: [
    { id: 'fantasy-splotch', label: 'watercolor', url: '/masks/fantasy-splotch.svg' },
    { id: 'fantasy-torn', label: 'torn edge', url: '/masks/fantasy-torn.svg' },
    { id: 'fantasy-vignette', label: 'vignette', url: '/masks/fantasy-vignette.svg' },
  ],
  scifi: [
    { id: 'scifi-hex', label: 'hex dissolve', url: '/masks/scifi-hex.svg' },
    { id: 'scifi-scanline', label: 'scanline', url: '/masks/scifi-scanline.svg' },
    { id: 'scifi-chamfer', label: 'chamfer', url: '/masks/scifi-chamfer.svg' },
  ],
  horror: [
    { id: 'horror-grunge', label: 'decay', url: '/masks/horror-grunge.svg' },
    { id: 'horror-smoke', label: 'smoke', url: '/masks/horror-smoke.svg' },
    { id: 'horror-vignette', label: 'hard vignette', url: '/masks/horror-vignette.svg' },
  ],
};

export function maskById(id: string): MaskDef | undefined {
  for (const set of Object.values(MASKS)) {
    const hit = set.find((m) => m.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function isGenre(v: unknown): v is GenreId {
  return v === 'fantasy' || v === 'scifi' || v === 'horror';
}

export const GENRE_KEY = 'stb:genre';
export const GENRE_EVENT = 'stb:genre-change';

/** The site-wide genre — what the header picker set, fantasy by default. */
export function siteGenre(): GenreId {
  const g = document.documentElement.dataset.genre;
  return isGenre(g) ? g : 'fantasy';
}

export function setSiteGenre(g: GenreId): void {
  // fantasy is the absence of the attribute — the default tokens, untouched
  if (g === 'fantasy') delete document.documentElement.dataset.genre;
  else document.documentElement.dataset.genre = g;
  try {
    localStorage.setItem(GENRE_KEY, g);
  } catch {
    /* private mode — the picker still works for this page */
  }
  window.dispatchEvent(new CustomEvent(GENRE_EVENT, { detail: { genre: g } }));
}

/** The genre in force at an element — the nearest [data-genre] wins, so a
 *  sheet's pin beats the site picker inside the sheet surface. */
export function genreAt(el: Element): GenreId {
  const g = el.closest('[data-genre]')?.getAttribute('data-genre');
  return isGenre(g) ? g : 'fantasy';
}
