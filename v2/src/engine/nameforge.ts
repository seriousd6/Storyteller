// Nameforge — the site's own fantasy-name engine.
//
// WHY THIS EXISTS
// The old gm/npc/names/<race> tables were flat lists exported from
// fantasynamegenerators.com: thousands of finished names, no structure, and not
// ours. This module replaces that with a small phonaesthetic engine — a handful
// of MORPHEMES per race and a few PATTERNS for how they combine — so every name
// is coined fresh, on-site, from parts we authored. A few dozen morphemes yield
// thousands of names, and the "sound" of a people lives in one readable place.
//
// THE STRATEGY (how a name is built)
//   1. A race is a NameSystem: named POOLS of lowercase morphemes plus PATTERNS.
//   2. A pattern is a template string. `{key}` is replaced by a uniform pick
//      from pools[key]; literal text (spaces, "of the", apostrophes) is kept.
//      A full name is ONE pattern — surnames/clans are just more tokens with a
//      literal space, so "given surname", "clan given", and single mononyms all
//      fall out of the same mechanism.
//   3. Patterns are grouped by gender (male / female / any). For a gendered race
//      an "Any" request coin-flips a gender first, so results read as properly
//      masculine or feminine rather than mushily androgynous. Ungendered peoples
//      (kenku, warforged, tabaxi…) only carry `any` patterns.
//   4. casing() title-cases the assembled string, keeping small connector words
//      ("of", "the") lowercase — so "{q} of the {sky}" reads "Whisper of the
//      Morning Sky", and "{on}{co}" reads "Elandriel".
//
// THE THEME (each race's phonaesthetic identity) is documented in the `theme`
// line of every system below — that is the design the pools are tuned to.
//
// Deterministic: every pick is drawn from an injected rng (0..1), so a given
// seed always forges the same names. No Date.now()/Math.random() here.

export interface NameSystem {
  /** Display label for the dial, e.g. "High Elf". */
  label: string;
  /** One-line phonaesthetic brief — the "sound" the pools are tuned to. */
  theme: string;
  /** Named morpheme pools, referenced as `{key}` inside patterns. Lowercase. */
  pools: Record<string, string[]>;
  /** Full-name templates, grouped by gender. `any` is the ungendered/fallback set. */
  patterns: { male?: string[]; female?: string[]; any?: string[] };
}

export type Gender = 'male' | 'female' | '';

// Words that stay lowercase inside a title-cased name (unless they lead it).
const CONNECTORS = new Set(['of', 'the', 'de', 'du', 'da', 'and', 'in', 'on', 'at', "o'"]);

/** Title-case a forged name: capitalise each word, keep connector words low. */
export function casing(raw: string): string {
  const words = raw.split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (i > 0 && CONNECTORS.has(w.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/** Which pattern list to draw from, given a requested gender. Empty gender
 *  coin-flips between male/female for gendered races so names read gendered. */
function resolveGender(sys: NameSystem, gender: Gender, rng: () => number): keyof NameSystem['patterns'] {
  const hasM = !!sys.patterns.male?.length;
  const hasF = !!sys.patterns.female?.length;
  if (gender === 'male') return hasM ? 'male' : sys.patterns.any ? 'any' : 'female';
  if (gender === 'female') return hasF ? 'female' : sys.patterns.any ? 'any' : 'male';
  if (hasM && hasF) return rng() < 0.5 ? 'male' : 'female';
  if (hasM) return 'male';
  if (hasF) return 'female';
  return 'any';
}

const pick = <T>(arr: T[], rng: () => number): T => arr[Math.floor(rng() * arr.length)]!;

/** Forge one name from a system for a gender, drawing all randomness from rng. */
export function forgeName(sys: NameSystem, gender: Gender, rng: () => number): string {
  const list = sys.patterns[resolveGender(sys, gender, rng)] ?? sys.patterns.any ?? [];
  if (!list.length) return '';
  const pattern = pick(list, rng);
  const filled = pattern.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const pool = sys.pools[key];
    return pool && pool.length ? pick(pool, rng) : whole;
  });
  return casing(filled);
}

/** Forge `count` names, retrying for distinctness. */
export function forgeNames(sys: NameSystem, gender: Gender, count: number, rng: () => number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const cap = Math.max(1, count);
  for (let i = 0; i < cap * 12 && out.length < cap; i++) {
    const name = forgeName(sys, gender, rng);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE RACES.  Each is a phonaesthetic theme filled in with morphemes we wrote.
// Keys are the race slugs shared with gm/npc (npc-block's RACES, gm/npc/race
// tags) so a future migration can point Quick NPC at this forge.
// ---------------------------------------------------------------------------

export const SYSTEMS: Record<string, NameSystem> = {
  human: {
    label: 'Human',
    theme: 'Grounded common-tongue names — a plain-fantasy given name and an earthy toponymic surname.',
    pools: {
      on: ['bran', 'cor', 'dar', 'ed', 'gar', 'hal', 'jor', 'kel', 'mar', 'rand', 'ser', 'tor', 'wil', 'ald', 'ben', 'cad', 'fen', 'gil', 'hob', 'rew', 'os', 'wal', 'rod', 'ott', 'gwen', 'har', 'lem', 'per'],
      mco: ['ric', 'mund', 'win', 'old', 'ard', 'is', 'ton', 'rad', 'gar', 'en', 'more', 'wick', 'ley', 'vald', 'ston'],
      fco: ['a', 'ith', 'wen', 'sa', 'lyn', 'ra', 'elle', 'ice', 'etta', 'na', 'eth', 'rin', 'ese', 'mira'],
      s1: ['oak', 'ash', 'black', 'green', 'stone', 'hill', 'marsh', 'wind', 'fair', 'long', 'white', 'brook', 'thorn', 'went', 'mill', 'red', 'cald', 'har', 'grey', 'wold'],
      s2: ['wood', 'ford', 'ton', 'well', 'field', 'worth', 'borne', 'ridge', 'water', 'mont', 'croft', 'dale', 'wick', 'stone', 'hollow', 'march', 'bury', 'combe'],
    },
    patterns: {
      male: ['{on}{mco} {s1}{s2}', '{on}{mco} {s1}{s2}', '{on}{mco}'],
      female: ['{on}{fco} {s1}{s2}', '{on}{fco} {s1}{s2}', '{on}{fco}'],
    },
  },

  'high-elf': {
    label: 'High Elf',
    theme: 'Liquid, long-voweled, melodic mononyms — l/r/th and drawn-out endings; ancient and unhurried.',
    pools: {
      on: ['ae', 'cae', 'el', 'fael', 'gal', 'il', 'lue', 'my', 'nae', 'ny', 'sy', 'thal', 'vae', 'aer', 'cel', 'lor', 'ria', 'sae', 'thi', 'ael'],
      mid: ['l', 'ri', 'la', 'na', 'tha', 'ndi', 'lue', 'ra', 'wy', 'si', 'mi', 'dri', 'lo', 'me'],
      mend: ['dor', 'ian', 'las', 'mir', 'thas', 'rion', 'dir', 'uil', 'mar', 'thil', 'lond', 'adan'],
      fend: ['riel', 'wen', 'wyn', 'thil', 'iel', 'ariel', 'ynn', 'eth', 'ora', 'aara', 'isse', 'lian', 'anor', 'wë'],
    },
    patterns: {
      male: ['{on}{mid}{mend}', '{on}{mend}', '{on}{mid}{mend}'],
      female: ['{on}{mid}{fend}', '{on}{fend}', '{on}{mid}{fend}'],
    },
  },

  'wood-elf': {
    label: 'Wood Elf',
    theme: 'Shorter, earthier elvish given names paired with a woodland-sign surname (Nightbreeze, Swiftbrook).',
    pools: {
      on: ['bri', 'cael', 'dar', 'elu', 'fen', 'gwy', 'hal', 'iri', 'lin', 'mel', 'syl', 'tha', 'wyn', 'aer', 'cyr', 'nym', 'ru', 'ash'],
      mend: ['an', 'on', 'dir', 'dan', 'wyn', 'ael', 'oth', 'mir', 'ric', 'las'],
      fend: ['wyn', 'eth', 'wen', 'iel', 'a', 'ra', 'lith', 'ana', 'sel', 'ynn'],
      w1: ['night', 'swift', 'green', 'moon', 'oak', 'fern', 'rain', 'wild', 'dusk', 'thorn', 'silver', 'dawn', 'quick', 'still'],
      w2: ['breeze', 'brook', 'leaf', 'runner', 'shade', 'song', 'whisper', 'wind', 'water', 'bough', 'glade', 'strider', 'fall', 'root'],
    },
    patterns: {
      male: ['{on}{mend} {w1}{w2}', '{on}{mend}', '{on}{mend} {w1}{w2}'],
      female: ['{on}{fend} {w1}{w2}', '{on}{fend}', '{on}{fend} {w1}{w2}'],
    },
  },

  'half-elf': {
    label: 'Half-Elf',
    theme: 'A foot in two worlds — an elvish-lilted given name over a human toponymic surname.',
    pools: {
      on: ['ae', 'cor', 'el', 'fen', 'gal', 'hal', 'il', 'mar', 'ria', 'sae', 'thal', 'wil', 'bran', 'lue'],
      mend: ['dan', 'rion', 'las', 'ric', 'dir', 'an', 'mir', 'win'],
      fend: ['iel', 'wen', 'a', 'lyn', 'riel', 'eth', 'ra', 'elle'],
      s1: ['oak', 'ash', 'grey', 'fair', 'green', 'moon', 'silver', 'west', 'hart', 'ash', 'wind', 'brook'],
      s2: ['wood', 'ford', 'well', 'field', 'borne', 'water', 'shade', 'dale', 'ridge', 'song'],
    },
    patterns: {
      male: ['{on}{mend} {s1}{s2}', '{on}{mend}'],
      female: ['{on}{fend} {s1}{s2}', '{on}{fend}'],
    },
  },

  drow: {
    label: 'Drow',
    theme: 'Elvish bones gone sharp and sibilant — z/x/v/ss — beneath a proud, ancient House.',
    pools: {
      on: ['dris', 'val', 'zar', 'xull', 'vic', 'nal', 'sza', 'ryl', 'quar', 'iel', 'mal', 'ver', 'zes', 'aun'],
      mend: ['zar', 'rar', 'ath', 'zim', 'gaunt', 'ron', 'vyr', 'net', 'nyl'],
      fend: ['rae', 'ice', 'inyl', 'afay', 'une', 'iss', 'ynda', 'ral', 'eyl', 'ynee'],
      h1: ['xor', 'des', 'bar', 'vand', 'mae', 'tor', 'faern', 'hun', 'alev', 'zaun'],
      h2: ['lond', 'rimm', 'arren', 'zin', 'ryn', 'del', 'ric', 'ett'],
    },
    patterns: {
      male: ['{on}{mend} of House {h1}{h2}', '{on}{mend}'],
      female: ['{on}{fend} of House {h1}{h2}', '{on}{fend}'],
    },
  },

  dwarf: {
    label: 'Dwarf',
    theme: 'Hard, plosive, doubled-consonant given names and a martial forge-clan (Ironbeard, Stonehelm).',
    pools: {
      on: ['bal', 'bar', 'brok', 'brun', 'dain', 'dorn', 'dur', 'grim', 'har', 'kaz', 'mor', 'nal', 'thra', 'vond', 'gret', 'thror', 'bael', 'orin'],
      mco: ['din', 'grim', 'dur', 'rak', 'bek', 'mun', 'gar', 'nar', 'vek', 'thi', 'rund', 'nir'],
      fco: ['a', 'ra', 'hild', 'dis', 'run', 'na', 'gret', 'vora', 'bryn', 'lin', 'nyl'],
      c1: ['iron', 'stone', 'gold', 'deep', 'fire', 'battle', 'grim', 'oath', 'anvil', 'frost', 'coal', 'steel', 'hammer', 'ax', 'granite', 'thunder'],
      c2: ['beard', 'forge', 'fist', 'helm', 'shield', 'brow', 'hammer', 'delve', 'guard', 'heart', 'maul', 'born', 'shaper', 'breaker', 'mantle', 'hand'],
    },
    patterns: {
      male: ['{on}{mco} {c1}{c2}', '{on}{mco} {c1}{c2}', '{on}{mco}'],
      female: ['{on}{fco} {c1}{c2}', '{on}{fco} {c1}{c2}', '{on}{fco}'],
    },
  },

  halfling: {
    label: 'Halfling',
    theme: 'Warm, homey diminutives and a cosy pastoral surname (Greenbottom, Butterbarrow).',
    pools: {
      on: ['bil', 'bod', 'cor', 'dro', 'fen', 'ferd', 'lyle', 'mer', 'mil', 'ned', 'ody', 'pip', 'ros', 'sam', 'ted', 'wil', 'ando', 'bram', 'per', 'tob'],
      mco: ['o', 'y', 'wise', 'as', 'win', 'er', 'imus', 'ric', 'bo', 'kin'],
      fco: ['y', 'a', 'ie', 'bell', 'etta', 'osa', 'ory', 'inda', 'amel', 'ippa', 'ony'],
      s1: ['green', 'under', 'thorn', 'high', 'bramble', 'tea', 'butter', 'honey', 'apple', 'proud', 'fair', 'good', 'long', 'hay', 'burr', 'top'],
      s2: ['bottom', 'foot', 'barrow', 'field', 'burrow', 'leaf', 'brook', 'kettle', 'bank', 'meadow', 'patch', 'cheek', 'hollow', 'hill', 'toes', 'downs'],
    },
    patterns: {
      male: ['{on}{mco} {s1}{s2}', '{on}{mco} {s1}{s2}', '{on}{mco}'],
      female: ['{on}{fco} {s1}{s2}', '{on}{fco} {s1}{s2}', '{on}{fco}'],
    },
  },

  gnome: {
    label: 'Gnome',
    theme: 'Quick, bright, tinker-shop names — short syllables and a whirring mechanical surname (Fizzlewhistle).',
    pools: {
      on: ['bim', 'bod', 'dab', 'fizz', 'gim', 'jeb', 'nack', 'ort', 'roon', 'sneb', 'tam', 'wren', 'zann', 'al', 'dim', 'fon', 'quib', 'pock'],
      mco: ['bble', 'wick', 'nock', 'bit', 'gen', 'dle', 'fizz', 'bo', 'us', 'ipp', 'ple', 'ert'],
      fco: ['a', 'ella', 'ina', 'etta', 'ippa', 'ory', 'ubbin', 'le', 'wyn', 'ipa'],
      s1: ['copper', 'cog', 'fizzle', 'spark', 'wobble', 'tinker', 'glim', 'nimble', 'boddy', 'wax', 'quill', 'bright', 'brass', 'whirl'],
      s2: ['bottom', 'whistle', 'spanner', 'switch', 'button', 'gear', 'sprocket', 'top', 'widdle', 'knob', 'bang', 'fuse', 'cog', 'spring'],
    },
    patterns: {
      male: ['{on}{mco} {s1}{s2}', '{on}{mco} {s1}{s2}', '{on}{mco}'],
      female: ['{on}{fco} {s1}{s2}', '{on}{fco} {s1}{s2}', '{on}{fco}'],
    },
  },

  orc: {
    label: 'Orc',
    theme: 'Guttural and brutal — back-of-throat plosives and a grim battle-name (Bloodfang, Bonecrusher).',
    pools: {
      on: ['gr', 'kr', 'thr', 'bru', 'dor', 'gash', 'grum', 'kaz', 'mog', 'nak', 'rok', 'sk', 'thok', 'ug', 'vorg', 'zag', 'gron', 'urz'],
      mco: ['ash', 'gar', 'grim', 'uk', 'nak', 'osh', 'dar', 'rok', 'mash', 'zug', 'gor', 'mog', 'dush'],
      fco: ['a', 'ka', 'ra', 'sha', 'gra', 'na', 'za', 'mog', 'rka', 'gha'],
      e1: ['skull', 'blood', 'iron', 'bone', 'black', 'gore', 'war', 'grim', 'death', 'red', 'broken', 'rot', 'razor', 'ash'],
      e2: ['fang', 'maw', 'tusk', 'skull', 'render', 'splitter', 'crusher', 'eye', 'hide', 'jaw', 'breaker', 'reaver', 'gut', 'howl'],
    },
    patterns: {
      male: ['{on}{mco} {e1}{e2}', '{on}{mco} {e1}{e2}', '{on}{mco}'],
      female: ['{on}{fco} {e1}{e2}', '{on}{fco} {e1}{e2}', '{on}{fco}'],
    },
  },

  'half-orc': {
    label: 'Half-Orc',
    theme: 'Orcish in the mouth, human at the edges — a blunt given name, sometimes an earned battle-name.',
    pools: {
      on: ['gr', 'thr', 'bru', 'dor', 'gash', 'grum', 'kaz', 'mog', 'nak', 'rok', 'thok', 'ug', 'gron', 'hal', 'mar', 'ben'],
      mco: ['ash', 'gar', 'uk', 'nak', 'dar', 'rok', 'mash', 'gor', 'mund', 'ric', 'don'],
      fco: ['a', 'ka', 'ra', 'sha', 'gra', 'na', 'za', 'wen', 'is'],
      e1: ['blood', 'iron', 'bone', 'black', 'gore', 'war', 'grim', 'broken', 'red', 'oath'],
      e2: ['fang', 'maw', 'tusk', 'render', 'crusher', 'jaw', 'breaker', 'hide', 'keeper', 'guard'],
    },
    patterns: {
      male: ['{on}{mco}', '{on}{mco} {e1}{e2}'],
      female: ['{on}{fco}', '{on}{fco} {e1}{e2}'],
    },
  },

  tiefling: {
    label: 'Tiefling',
    theme: 'Two traditions — a chosen English virtue-name, or an old Infernal name that curls in the mouth.',
    pools: {
      virtue: ['Hope', 'Sorrow', 'Chastity', 'Ambition', 'Glory', 'Ruin', 'Mercy', 'Vengeance', 'Dread', 'Solace', 'Fortune', 'Torment', 'Reverence', 'Silence', 'Temerity', 'Grief', 'Zeal', 'Woe', 'Ideal', 'Excellence', 'Nowell', 'Weal', 'Quiet', 'Resolve', 'Wrath', 'Poesy', 'Open', 'Creed'],
      ion: ['ak', 'bar', 'cal', 'damak', 'iad', 'kair', 'leu', 'mel', 'mor', 'rie', 'skam', 'val', 'ez', 'phel'],
      ico: ['ta', 'thus', 'mon', 'zar', 'ereth', 'diel', 'akos', 'ion', 'ura', 'menon', 'aphel', 'ades'],
    },
    patterns: {
      male: ['{virtue}', '{ion}{ico}'],
      female: ['{virtue}', '{ion}{ico}'],
      any: ['{virtue}', '{ion}{ico}'],
    },
  },

  dragonborn: {
    label: 'Dragonborn',
    theme: 'Clan first, then the given name — hard-edged draconic syllables spoken with pride.',
    pools: {
      c1: ['cleth', 'dar', 'fenn', 'kim', 'myas', 'nor', 'oph', 'prex', 'shest', 'turn', 'verth', 'yarj', 'kep', 'del'],
      c2: ['tinallor', 'bar', 'kimin', 'ixius', 'shtal', 'jandi', 'mmon', 'esh', 'anak', 'orn'],
      on: ['arjh', 'bal', 'don', 'ghesh', 'kri', 'med', 'nad', 'pand', 'rha', 'shed', 'tor', 'vron', 'kal', 'sur'],
      mco: ['asar', 'inar', 'rekh', 'ash', 'mash', 'don', 'jat', 'isar', 'raan', 'thar'],
      fco: ['ala', 'inar', 'eni', 'exa', 'tha', 'ira', 'enn', 'ann', 'esh'],
    },
    patterns: {
      male: ['{c1}{c2} {on}{mco}', '{on}{mco} {c1}{c2}'],
      female: ['{c1}{c2} {on}{fco}', '{on}{fco} {c1}{c2}'],
    },
  },

  goliath: {
    label: 'Goliath',
    theme: 'A short syllabic birth-name and an earned deed-name that reads like weather on stone (Thundermaw).',
    pools: {
      on: ['aukan', 'eglath', 'gae', 'kavaki', 'mano', 'thalai', 'vaunea', 'ilikan', 'lo', 'nalla', 'orilo', 'uthal'],
      co: ['', 'kan', 'lo', 'ra', 'th', 'vi', 'na', 'mi'],
      d1: ['thunder', 'stone', 'storm', 'frost', 'iron', 'cloud', 'ash', 'bould', 'wind', 'sky', 'snow', 'rock'],
      d2: ['maw', 'whisper', 'breaker', 'fist', 'walker', 'born', 'heart', 'skin', 'reach', 'fall', 'strider', 'gaze'],
    },
    patterns: {
      any: ['{on}{co} {d1}{d2}', '{on}{co} {d1}{d2}', '{on}{co}'],
    },
  },
};

/** [slug, label] for every forgeable race, in a friendly display order. */
export const RACE_ORDER: string[] = [
  'human', 'high-elf', 'wood-elf', 'half-elf', 'drow', 'dwarf', 'halfling', 'gnome',
  'orc', 'half-orc', 'tiefling', 'dragonborn', 'goliath',
];

export function raceChoices(): { value: string; label: string }[] {
  return RACE_ORDER.filter((slug) => SYSTEMS[slug]).map((slug) => ({ value: slug, label: SYSTEMS[slug]!.label }));
}
