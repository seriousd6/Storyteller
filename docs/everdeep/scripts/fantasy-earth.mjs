// Fantasy-Earth naming — turns real place names into recognizable fantasy plays
// on them (owner: "Fort Tampania for Tampa"). Deterministic (seeded by the real
// name), so a place always fantasyfies the same way; the root stays legible so
// players recognize the real city underneath. Used by the Earth-2026 bake.

function h(str, salt = 0) {
  let n = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { n ^= str.charCodeAt(i); n = Math.imul(n, 16777619); }
  return (n >>> 0);
}
const pick = (arr, seed) => arr[seed % arr.length];
const isVowel = (c) => 'aeiou'.includes((c || '').toLowerCase());
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// leading particles that shouldn't become the root of a fantasy name
const PARTICLE = new Set(['los', 'las', 'san', 'santa', 'santo', 'são', 'sao', 'rio', 'new', 'saint', 'st', 'fort', 'port', 'le', 'la', 'el', 'al', 'ad', 'da', 'de', 'del', 'du', 'of', 'the', 'ciudad', 'san', 'ho', 'chi']);

// distinctive root of a place name: strip diacritics/particles, take the most
// characterful token (the longest, so "Los Angeles" -> Angeles, "Rio de
// Janeiro" -> Janeiro), Title Case.
function baseOf(name) {
  const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z \-']/g, ' ');
  const toks = ascii.split(/[\s\-']+/).filter(Boolean);
  const kept = toks.filter((w) => !PARTICLE.has(w.toLowerCase()));
  const pool = kept.length ? kept : toks;
  const main = pool.reduce((a, b) => (b.length > a.length ? b : a), pool[0] || 'Vale');
  return cap(main);
}

const CITY_SUFFIX = ['ia', 'ium', 'oria', 'mark', 'gard', 'heim', 'grad', 'reach', 'hold', 'fell', 'spire', 'wick', 'ford', 'crest', 'haven', 'thorn', 'bury', 'dale'];
const CITY_PREFIX = ['Fort ', 'Port ', 'New ', 'High ', 'Old ', 'Grand ', 'Saint ', 'Caer ', 'Lock '];

// graft a suffix onto a root with a smooth seam (Tampa + ia -> Tampania)
function graft(base, suffix) {
  let b = base;
  const last = b[b.length - 1].toLowerCase();
  if (isVowel(last) && isVowel(suffix[0])) b = b + (h(base, 7) % 2 ? 'n' : 'r'); // vowel bridge
  else if (isVowel(last) && !isVowel(suffix[0]) && /^(ia|oria|ium)/.test(suffix)) b = b.slice(0, -1); // trim before -ia
  return b + suffix;
}

/** Fantasyfy a settlement name. `coastal` biases toward Port. */
export function fantasyCity(name, coastal = false) {
  const base = baseOf(name);
  const seed = h(base, 101);
  const mode = seed % 10;
  // ~40% Prefix + grafted suffix (the "Fort Tampania" signature), ~40% suffix
  // only, ~20% prefix only — all keep the root legible
  if (mode < 4) {
    const pre = coastal && h(base, 2) % 2 ? 'Port ' : pick(CITY_PREFIX, h(base, 3));
    return pre + graft(base, pick(CITY_SUFFIX, h(base, 5)));
  }
  if (mode < 8) return graft(base, pick(CITY_SUFFIX, h(base, 9)));
  return pick(CITY_PREFIX, h(base, 11)) + base;
}

// Curated fantasy analogs for famous powers — the recognizable payoff. Everything
// else falls through to the generic realm transform.
const FAMOUS = {
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
const REALM_TITLE = ['Kingdom of', 'Realm of', 'Dominion of', 'Crownlands of', 'Free States of', 'Grand Duchy of', 'League of', 'Reach of'];
const REALM_BY_REGION = {
  Asia: ['Empire of', 'Celestial Realm of', 'Sultanate of', 'Khanate of', 'Dominion of'],
  Africa: ['Sultanate of', 'Kingdom of', 'Emirate of', 'Dominion of', 'Realm of'],
  Europe: ['Kingdom of', 'Grand Duchy of', 'Imperium of', 'Crownlands of', 'League of'],
  Americas: ['Free States of', 'Crowned Republic of', 'Dominion of', 'Confederacy of', 'Reach of'],
  Oceania: ['Isles of', 'Thalassocracy of', 'Reach of', 'Dominion of'],
};
const REALM_SUFFIX = ['ia', 'oria', 'mark', 'gard', 'heim', 'aria', 'onia', 'antia', 'or', 'eth'];

/** Fantasyfy a country into a realm: "The Free States of Columbia". */
export function fantasyRealm(countryName, region = '', iso2 = '') {
  const titles = REALM_BY_REGION[region] || REALM_TITLE;
  const title = pick(titles, h(countryName, 211));
  const fname = FAMOUS[iso2] || graft(baseOf(countryName), pick(REALM_SUFFIX, h(countryName, 307)));
  return { title, name: fname, full: `The ${title} ${fname}` };
}

const GOV_BY_REGION = {
  Asia: ['a Celestial Mandate', 'an Imperial Throne', 'a Khan’s writ', 'a Sultan’s decree'],
  Africa: ['a Sultan’s decree', 'a Council of Elders', 'a Divine Kingship', 'a Trade-Emirate'],
  Europe: ['a Crowned Monarchy', 'a Grand Ducal seat', 'a League charter', 'an Imperial Diet'],
  Americas: ['a Free Charter', 'a Crowned Republic', 'a Confederate Pact', 'a Frontier Crown'],
  Oceania: ['an Island Thalassocracy', 'a Council of the Reefs', 'a Reach-Moot'],
};
export function fantasyGovernment(region, seedStr) {
  const g = GOV_BY_REGION[region] || GOV_BY_REGION.Europe;
  return pick(g, h(seedStr, 401));
}

// --- geographic features: fantasyfied real names (ranges, seas, rivers,
// deserts, forests, lakes). Keeps the real root recognizable. ---
const FEATURE_WORD = {
  range: ['Spine', 'Peaks', 'Heights', 'Wall', 'Teeth', 'Crags', 'Reach'],
  sea: ['Sea', 'Deep', 'Gulf', 'Reach', 'Expanse', 'Straits'],
  ocean: ['Ocean', 'Vast', 'Deeps', 'Expanse'],
  river: ['', 'run', 'water', 'flow'],
  desert: ['Wastes', 'Sands', 'Desolation', 'Barrens', 'Drybones'],
  forest: ['Wood', 'Wilds', 'Forest', 'Greenwood', 'Reach'],
  lake: ['Mere', 'Loch', 'Water', 'Lake'],
};
// generic geographic words that shouldn't become the root of a feature name
const GENERIC = new Set(['mountains', 'mountain', 'mount', 'mt', 'range', 'sea', 'ocean', 'gulf', 'bay', 'lake', 'lakes', 'loch', 'river', 'desert', 'forest', 'rainforest', 'jungle', 'wood', 'woods', 'great', 'greater', 'lesser', 'upper', 'lower', 'north', 'south', 'east', 'west', 'grand']);
// trim a real feature name to a legible fantasy stem: drop generic words, keep
// the most distinctive token, then shave a plural/adjectival tail.
function featStem(name) {
  const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z \-']/g, ' ');
  const toks = ascii.split(/[\s\-']+/).filter(Boolean);
  const kept = toks.filter((w) => !GENERIC.has(w.toLowerCase()) && !PARTICLE.has(w.toLowerCase()));
  const pool = kept.length ? kept : toks;
  let b = cap(pool.reduce((a, c) => (c.length > a.length ? c : a), pool[0] || 'Vale'));
  b = b.replace(/(s|as|es|ains|an|ean|ian)$/i, (m) => (m.length > 2 ? m[0] : '')); // Himalayas->Himalay, Alps->Alp
  if (b.length < 3) b = cap(pool[0] || 'Vale');
  return b;
}
export function fantasyFeature(realName, kind) {
  const stem = featStem(realName);
  const w = pick(FEATURE_WORD[kind] || ['Reach'], h(realName, 61));
  if (kind === 'river') {
    const suf = pick(['nor', 'wyn', 'aine', 'ath', 'is', 'en'], h(realName, 67));
    return `The ${graft(stem, suf)}${w ? ' ' + cap(w) : ''}`.trim();
  }
  if (kind === 'lake') return `${graft(stem, pick(['', 'or', 'wyn', 'a'], h(realName, 71)))} ${w}`;
  if (kind === 'ocean') return `The ${graft(stem, pick(['', 'ar', 'ian'], h(realName, 73)))} ${w}`;
  return `The ${graft(stem, pick(['', 'ar', 'eth', 'or', 'en'], h(realName, 79)))} ${w}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('--- cities ---');
  for (const [c, coast] of [['Tampa', true], ['Orlando', false], ['London', false], ['Paris', false], ['Cairo', false], ['Tokyo', true], ['Mumbai', true], ['Rio de Janeiro', true], ['Los Angeles', true], ['San Francisco', true], ['Reykjavik', true], ['Nairobi', false], ['Berlin', false]])
    console.log(c.padEnd(16), '->', fantasyCity(c, coast));
  console.log('--- realms ---');
  for (const [c, r, iso] of [['United States', 'Americas', 'US'], ['United Kingdom', 'Europe', 'GB'], ['France', 'Europe', 'FR'], ['China', 'Asia', 'CN'], ['Japan', 'Asia', 'JP'], ['Egypt', 'Africa', 'EG'], ['Brazil', 'Americas', 'BR'], ['Kenya', 'Africa', 'KE'], ['Nepal', 'Asia', 'NP']])
    console.log(c.padEnd(16), '->', fantasyRealm(c, r, iso).full, '·', fantasyGovernment(r, c));
  console.log('--- features ---');
  for (const [n, k] of [['Himalayas', 'range'], ['Alps', 'range'], ['Andes', 'range'], ['Rocky Mountains', 'range'], ['Ural', 'range'], ['Mediterranean Sea', 'sea'], ['Caribbean Sea', 'sea'], ['Caspian Sea', 'sea'], ['Pacific Ocean', 'ocean'], ['Atlantic Ocean', 'ocean'], ['Nile', 'river'], ['Amazon', 'river'], ['Mississippi', 'river'], ['Yangtze', 'river'], ['Danube', 'river'], ['Sahara', 'desert'], ['Gobi', 'desert'], ['Mojave', 'desert'], ['Amazon Rainforest', 'forest'], ['Congo', 'forest'], ['Taiga', 'forest'], ['Great Lakes', 'lake'], ['Lake Victoria', 'lake'], ['Baikal', 'lake']])
    console.log(n.padEnd(18), k.padEnd(7), '->', fantasyFeature(n, k));
}
