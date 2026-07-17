// Fantasy-Earth naming — turns real place names into recognizable fantasy plays
// on them (owner: "Fort Tampania for Tampa"). Deterministic (seeded by the real
// name), so a place always fantasyfies the same way; the root stays legible so
// players recognize the real city underneath.
//
// SHARED, not bake-local (owner, 2026-07-15: "everything needs to be browser
// based"). This was `docs/everdeep/scripts/fantasy-earth.mjs`, reachable only by
// the Node bake — so a user creating their own Earth got none of it. It lives
// here now so the browser's world creation can name places exactly as the
// shipped demo does. The bake imports this module like any other.
//
// Pool sizing matters here (item #2). ~1,500 cities, ~250 realms and ~2,000
// feeder hamlets all draw from these lists; the original 18×9×3 city space and
// 20×12 hamlet space collided so hard that 1,021 of 4,103 entities came out
// wearing a visible counter ("Old Deepmeadow 2"). Every generator below takes a
// `salt` so a collision can re-roll a genuinely DIFFERENT name instead.

import { h32 } from './seeds.ts';

const h = (str: string, salt = 0): number => h32(str, salt);
const pick = <T>(arr: readonly T[], seed: number): T => arr[seed % arr.length]!;
const isVowel = (c: string): boolean => 'aeiou'.includes((c || '').toLowerCase());
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// leading particles that shouldn't become the root of a fantasy name
const PARTICLE = new Set(['los', 'las', 'san', 'santa', 'santo', 'são', 'sao', 'rio', 'new', 'saint', 'st', 'fort', 'port', 'le', 'la', 'el', 'al', 'ad', 'da', 'de', 'del', 'du', 'of', 'the', 'ciudad', 'ho', 'chi']);

/** Distinctive root of a place name: strip diacritics/particles, take the most
 *  characterful token ("Los Angeles" → Angeles, "Rio de Janeiro" → Janeiro). */
export function baseOf(name: string): string {
  const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z \-']/g, ' ');
  const toks = ascii.split(/[\s\-']+/).filter(Boolean);
  const kept = toks.filter((w) => !PARTICLE.has(w.toLowerCase()));
  const pool = kept.length ? kept : toks;
  const main = pool.reduce((a, b) => (b.length > a.length ? b : a), pool[0] ?? 'Vale');
  return cap(main);
}

const CITY_SUFFIX = [
  'ia', 'ium', 'oria', 'mark', 'gard', 'heim', 'grad', 'reach', 'hold', 'fell',
  'spire', 'wick', 'ford', 'crest', 'haven', 'thorn', 'bury', 'dale', 'burg',
  'stead', 'holm', 'ness', 'wold', 'moor', 'cliff', 'gate', 'watch', 'rest',
  'hollow', 'shire', 'minster', 'caster', 'thwaite', 'garth', 'mere', 'keep',
  'bourne', 'combe', 'ridge', 'vale', 'march', 'strand', 'barrow', 'weald',
  'scar', 'helm', 'run', 'drift', 'hall', 'toft',
];
const CITY_PREFIX = [
  'Fort ', 'Port ', 'New ', 'High ', 'Old ', 'Grand ', 'Saint ', 'Caer ', 'Lock ',
  'Dun ', 'Aber ', 'Kirk ', 'Nor ', 'Little ', 'Great ', 'Upper ', 'Lower ',
  'King’s ', 'Queen’s ', 'Cross ', 'Deep ', 'West ', 'East ',
];
// an adjective in front of the plain root — "Gilded Cairo"
const CITY_ADJ = [
  'Gilded', 'Silver', 'Iron', 'Storm', 'Amber', 'Ashen', 'Crimson', 'Pale',
  'Golden', 'Hollow', 'Bright', 'Quiet', 'Sunken', 'Verdant', 'Salt', 'Frost',
];
// a standalone noun after the plain root — "Cairo Watch"
const CITY_WORD = [
  'Reach', 'Watch', 'Gate', 'Rest', 'Keep', 'Cross', 'Span', 'Landing', 'March',
  'Hollow', 'Court', 'Bastion', 'Crossing', 'Wells', 'Yard', 'Quay',
];

/** Graft a suffix onto a root with a smooth seam (Tampa + ia → Tampania). */
function graft(base: string, suffix: string): string {
  let b = base;
  if (!suffix) return b;
  const last = b[b.length - 1]!.toLowerCase();
  if (isVowel(last) && isVowel(suffix[0]!)) b = b + (h(base, 7) % 2 ? 'n' : 'r'); // vowel bridge
  else if (isVowel(last) && !isVowel(suffix[0]!) && /^(ia|oria|ium)/.test(suffix)) b = b.slice(0, -1); // trim before -ia
  return b + suffix;
}

/** Fantasyfy a settlement name. `coastal` biases toward Port. `salt` re-rolls a
 *  DIFFERENT name for the same root, to resolve a collision without ever
 *  appending a visible number. */
export function fantasyCity(name: string, coastal = false, salt = 0): string {
  const base = baseOf(name);
  const S = salt * 1013;
  const mode = h(base, 101 + S) % 12;
  // Five forms, all keeping the root legible: prefix + grafted suffix (the "Fort
  // Tampania" signature), suffix only, prefix only, adjective + root, root +
  // noun. The last two exist so 1,500 cities don't all wear the same sticker.
  if (mode < 4) {
    const pre = coastal && h(base, 2 + S) % 2 ? 'Port ' : pick(CITY_PREFIX, h(base, 3 + S));
    return pre + graft(base, pick(CITY_SUFFIX, h(base, 5 + S)));
  }
  if (mode < 7) return graft(base, pick(CITY_SUFFIX, h(base, 9 + S)));
  if (mode < 9) return pick(CITY_PREFIX, h(base, 11 + S)) + base;
  if (mode < 11) return `${pick(CITY_ADJ, h(base, 17 + S))} ${base}`;
  return `${base} ${pick(CITY_WORD, h(base, 19 + S))}`;
}

// Curated fantasy analogs for famous powers — the recognizable payoff. Everything
// else falls through to the generic realm transform.
const FAMOUS: Record<string, string> = {
  US: 'Columbia', GB: 'Albion', FR: 'Gallia', DE: 'Almannia', CN: 'Cathay',
  JP: 'Nipponia', RU: 'Rusenmark', IN: 'Bharatia', EG: 'Khemet', IT: 'Latia',
  ES: 'Hispalia', PT: 'Lusenor', GR: 'Hellenor', TR: 'Anatoris', IR: 'Parsia',
  IQ: 'Mesopor', SA: 'Arabor', MX: 'Azteca', BR: 'Verdenor', AR: 'Plataria',
  CA: 'Boralis', AU: 'Meridia', ZA: 'Austronia', NG: 'Nigeris', ET: 'Aksumia',
  KE: 'Savannor', MA: 'Maghrenor', KR: 'Haneum', TH: 'Ayutha', VN: 'Namviet',
  ID: 'Nusantar', PH: 'Luzonia', PK: 'Indoria', BD: 'Bengalor', UA: 'Ruthenia',
  PL: 'Polonia', SE: 'Sverngard', NO: 'Nordheim', FI: 'Suomeld', NL: 'Bataavia',
  BE: 'Flandor', CH: 'Helvetia', AT: 'Ostmark', IE: 'Eirenor', IS: 'Frosthelm',
  PE: 'Incaria', CL: 'Andesmark', CO: 'Eldora', VE: 'Orinoria', CU: 'Antillia',
};
// exported: webs.ts's kingdom generator titles its realms from THE SAME
// vocabulary, so the two can't drift apart (§10.10 review)
export const REALM_TITLE = ['Kingdom of', 'Realm of', 'Dominion of', 'Crownlands of', 'Free States of', 'Grand Duchy of', 'League of', 'Reach of'];
const REALM_BY_REGION: Record<string, string[]> = {
  Asia: ['Empire of', 'Celestial Realm of', 'Sultanate of', 'Khanate of', 'Dominion of'],
  Africa: ['Sultanate of', 'Kingdom of', 'Emirate of', 'Dominion of', 'Realm of'],
  Europe: ['Kingdom of', 'Grand Duchy of', 'Imperium of', 'Crownlands of', 'League of'],
  Americas: ['Free States of', 'Crowned Republic of', 'Dominion of', 'Confederacy of', 'Reach of'],
  Oceania: ['Isles of', 'Thalassocracy of', 'Reach of', 'Dominion of'],
};
const REALM_SUFFIX = [
  'ia', 'oria', 'mark', 'gard', 'heim', 'aria', 'onia', 'antia', 'or', 'eth',
  'and', 'esse', 'ovia', 'eria', 'wyn', 'dor', 'ath', 'ene', 'ika', 'lond',
  'reach', 'holt', 'vane', 'mere',
];

export interface Realm { title: string; name: string; full: string }

/** Fantasyfy a country into a realm: "The Free States of Columbia". */
export function fantasyRealm(countryName: string, region = '', iso2 = '', salt = 0): Realm {
  const S = salt * 1013;
  const titles = REALM_BY_REGION[region] ?? REALM_TITLE;
  const title = pick(titles, h(countryName, 211 + S));
  // the curated analog is the payoff — only salt it away if it actually collided
  const famous = salt === 0 ? FAMOUS[iso2] : undefined;
  const fname = famous ?? graft(baseOf(countryName), pick(REALM_SUFFIX, h(countryName, 307 + S)));
  return { title, name: fname, full: `The ${title} ${fname}` };
}

const GOV_BY_REGION: Record<string, string[]> = {
  Asia: ['a Celestial Mandate', 'an Imperial Throne', 'a Khan’s writ', 'a Sultan’s decree'],
  Africa: ['a Sultan’s decree', 'a Council of Elders', 'a Divine Kingship', 'a Trade-Emirate'],
  Europe: ['a Crowned Monarchy', 'a Grand Ducal seat', 'a League charter', 'an Imperial Diet'],
  Americas: ['a Free Charter', 'a Crowned Republic', 'a Confederate Pact', 'a Frontier Crown'],
  Oceania: ['an Island Thalassocracy', 'a Council of the Reefs', 'a Reach-Moot'],
};
export function fantasyGovernment(region: string, seedStr: string): string {
  const g = GOV_BY_REGION[region] ?? GOV_BY_REGION.Europe!;
  return pick(g, h(seedStr, 401));
}

// --- geographic features: fantasyfied real names ---
const FEATURE_WORD: Record<string, string[]> = {
  range: ['Spine', 'Peaks', 'Heights', 'Wall', 'Teeth', 'Crags', 'Reach', 'Shoulders', 'Backbone', 'Horns', 'Rampart', 'Pinnacles', 'Ridge', 'Bulwark'],
  sea: ['Sea', 'Deep', 'Gulf', 'Reach', 'Expanse', 'Straits', 'Narrows', 'Waters', 'Sound', 'Basin', 'Bight'],
  ocean: ['Ocean', 'Vast', 'Deeps', 'Expanse', 'Boundless', 'Grey Vast'],
  river: ['', 'run', 'water', 'flow', 'race', 'course', 'reach', 'wend', 'stream'],
  desert: ['Wastes', 'Sands', 'Desolation', 'Barrens', 'Drybones', 'Scorch', 'Dust', 'Emptiness', 'Sear', 'Parch', 'Anvil'],
  forest: ['Wood', 'Wilds', 'Forest', 'Greenwood', 'Reach', 'Thicket', 'Shadewood', 'Canopy', 'Tangle', 'Deepwood'],
  lake: ['Mere', 'Loch', 'Water', 'Lake', 'Tarn', 'Broads', 'Glass', 'Still', 'Pool'],
};
// generic geographic words that shouldn't become the root of a feature name
const GENERIC = new Set(['mountains', 'mountain', 'mount', 'mt', 'range', 'sea', 'ocean', 'gulf', 'bay', 'lake', 'lakes', 'loch', 'river', 'desert', 'forest', 'rainforest', 'jungle', 'wood', 'woods', 'great', 'greater', 'lesser', 'upper', 'lower', 'north', 'south', 'east', 'west', 'grand']);

/** Trim a real feature name to a legible fantasy stem. */
function featStem(name: string): string {
  const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z \-']/g, ' ');
  const toks = ascii.split(/[\s\-']+/).filter(Boolean);
  const kept = toks.filter((w) => !GENERIC.has(w.toLowerCase()) && !PARTICLE.has(w.toLowerCase()));
  const pool = kept.length ? kept : toks;
  let b = cap(pool.reduce((a, c) => (c.length > a.length ? c : a), pool[0] ?? 'Vale'));
  b = b.replace(/(s|as|es|ains|an|ean|ian)$/i, (m) => (m.length > 2 ? m[0]! : '')); // Himalayas→Himalay
  if (b.length < 3) b = cap(pool[0] ?? 'Vale');
  return b;
}

export function fantasyFeature(realName: string, kind: string, salt = 0): string {
  const S = salt * 1013;
  const stem = featStem(realName);
  const w = pick(FEATURE_WORD[kind] ?? ['Reach'], h(realName, 61 + S));
  if (kind === 'river') {
    const suf = pick(['nor', 'wyn', 'aine', 'ath', 'is', 'en', 'or', 'ash', 'ora', 'eth'], h(realName, 67 + S));
    return `The ${graft(stem, suf)}${w ? ' ' + cap(w) : ''}`.trim();
  }
  if (kind === 'lake') return `${graft(stem, pick(['', 'or', 'wyn', 'a', 'eth', 'is'], h(realName, 71 + S)))} ${w}`;
  if (kind === 'ocean') return `The ${graft(stem, pick(['', 'ar', 'ian', 'or', 'eth'], h(realName, 73 + S)))} ${w}`;
  return `The ${graft(stem, pick(['', 'ar', 'eth', 'or', 'en', 'is', 'wyn'], h(realName, 79 + S)))} ${w}`;
}

// --- rulers: the fantasyfied real head of a power (item #6) ---
const RULER_SUFFIX = ['ar', 'os', 'ian', 'ius', 'en', 'yn', 'and', 'eth', 'or', 'is'];
const RULER_GIVEN = ['Aldric', 'Casimir', 'Doran', 'Eryk', 'Halden', 'Joro', 'Kaeling', 'Lothar', 'Maren', 'Osric', 'Rennic', 'Sabel', 'Taran', 'Ulric', 'Varne', 'Wyland'];

/** Fantasyfy a real leader's surname into a recognizable regnal name. */
export function fantasyLeader(anchor: string, seedStr = ''): string {
  const base = cap(anchor.replace(/[^A-Za-z]/g, '') || 'Varen');
  const sur = graft(base, pick(RULER_SUFFIX, h(base, 131)));
  const given = pick(RULER_GIVEN, h(base + seedStr, 137));
  return `${given} ${sur}`;
}

const TITLE_MAP: Array<[RegExp, string]> = [
  [/empire|celestial|imperium/i, 'Emperor'], [/sultan|emirate/i, 'Sultan'], [/khan/i, 'Khan'],
  [/grand duchy/i, 'Grand Sovereign'], [/thalassocracy|isles|reefs/i, 'Sea-Lord'],
  [/free states|republic|confederacy|dominion/i, 'First Citizen'],
  [/kingdom|crownlands|realm|reach|league|crowned/i, 'Sovereign'],
];
export function leaderTitle(realmTitle: string): string {
  for (const [re, t] of TITLE_MAP) if (re.test(realmTitle)) return t;
  return 'Sovereign';
}

// --- feeder hamlets: the farming villages whose grain lets a metropolis exist
// (item #9). 56 roots × 30 endings = 1,680 stems, ×24 optional direction words —
// sized for the ~2,000 hamlets a populated Earth wants. The old 20×12 = 240 pool
// is why 48% of them came out numbered.
const FEED_DIR = [
  'North', 'South', 'East', 'West', 'Upper', 'Lower', 'Old', 'Nether', 'Over',
  'Little', 'Great', 'Far', 'Near', 'High', 'Low', 'Middle', 'New', 'Long',
  'Broad', 'Cold', 'Green', 'Still', 'Fair', 'Wet',
];
const FEED_ROOT = [
  'Ash', 'Oak', 'Elm', 'Bram', 'Fen', 'Thorn', 'Wold', 'Barley', 'Rye', 'Haw',
  'Marsh', 'Stone', 'Mill', 'Wheat', 'Green', 'Black', 'Long', 'Deep', 'Willow',
  'Heather', 'Birch', 'Alder', 'Hazel', 'Rowan', 'Holly', 'Bracken', 'Gorse',
  'Nettle', 'Clover', 'Sedge', 'Reed', 'Rush', 'Beech', 'Hawthorn', 'Sallow',
  'Cress', 'Bramble', 'Furze', 'Broom', 'Teasel', 'Oat', 'Hop', 'Flax', 'Bean',
  'Apple', 'Pear', 'Plum', 'Cherry', 'Goose', 'Duck', 'Heron', 'Otter', 'Badger',
  'Hart', 'Ewe', 'Ram',
];
const FEED_END = [
  'grange', 'croft', 'field', 'mill', 'furrow', 'barrow', 'cote', 'hollow',
  'meadow', 'fold', 'garth', 'ford', 'stead', 'thorpe', 'wick', 'combe', 'dean',
  'holt', 'hurst', 'leigh', 'mere', 'moor', 'ridge', 'row', 'shaw', 'thwaite',
  'weir', 'well', 'yard', 'bourne',
];

/** A classic feeder-hamlet name. Deterministic on the seed. */
export function hamletName(seed: string): string {
  const n = h(seed, 0);
  const stemRaw = FEED_ROOT[(n >>> 7) % FEED_ROOT.length]! + FEED_END[(n >>> 13) % FEED_END.length]!;
  const stem = stemRaw[0]!.toUpperCase() + stemRaw.slice(1);
  return (n & 1) ? `${FEED_DIR[(n >>> 3) % FEED_DIR.length]} ${stem}` : stem;
}

/**
 * A unique name with NO visible counter.
 *
 * The bake used to append an integer on collision — "Old Deepmeadow 2",
 * "Josethorn 2", "Santiagospire 3" — and 1,021 of 4,103 entities wore one.
 * Re-roll with a salt instead, so a collision yields a genuinely different
 * name. (Same trick `settlements.ts` already uses for `properName`.) Numbering
 * survives only if 60 salts all collide, i.e. the pool is truly exhausted.
 *
 * `gen(salt)` must return a candidate name.
 */
export function uniqueName(gen: (salt: number) => string, used: Set<string>): string {
  let n = gen(0);
  for (let i = 1; used.has(n) && i <= 60; i++) n = gen(i);
  if (used.has(n)) { const b = n; let i = 2; while (used.has(n)) n = `${b} ${i++}`; }
  used.add(n);
  return n;
}
