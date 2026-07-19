// Dungeon: a whole themed delve in one roll. A theme (undead crypt, fiend
// sanctum, beast warren, dragon's lair…) colours the name, the atmosphere, the
// boss's kind, and the creatures that lurk in the rooms — so the place reads as
// ONE dungeon, not a bag of unrelated set-pieces. Every room layers real
// opportunity on top of its set-piece: a sprung trap, a thing worth a closer
// look (sometimes a genuine art object), words on the walls, something lurking,
// something small to pocket. The inner sanctum holds a full, dial-able treasure
// hoard — the same assembly the Hoard tool uses, so a delve's prize is a proper
// hoard, not a couple of loose lines.
//
// Registry scanner (gen-registries.mjs): table ids must be FULL literals; the
// sibling import of ./hoard.ts is followed one hop for its tables too.

import { makeComposer, type CompositeMeta, type Composer } from '../engine/composite.ts';
import type { Block, KeyValueBlock, TableRegistry } from '../engine/types.ts';
import { artObjectLine, hoardSections, type HoardDials } from './hoard.ts';
import { srdSections } from './srd.ts';

const MONSTERS = 'gm/monsters/all';

// ── Themes ───────────────────────────────────────────────────────────────────
// Each theme names its boss's creature type (a tag on gm/monsters/all), a pool
// of site-nouns for the name, and a few atmosphere lines that set the mood.
interface Theme {
  value: string;
  label: string;
  type: string; // monster-type tag; '' = any
  sites: string[];
  air: string[];
}

// exported for the SPACES layer: siteOps maps a delve's theme to its
// interior layout (a beast warren digs a cave, a giant hold builds grand
// halls) and recovers the theme from the statblock meta's first segment
export const THEMES: Theme[] = [
  {
    value: 'undead',
    label: 'Undead crypt',
    type: 'undead',
    sites: ['Crypt', 'Barrow', 'Catacomb', 'Ossuary', 'Necropolis', 'Tomb', 'Mausoleum', 'Sepulchre'],
    air: [
      'The air is cold and still, and every breath tastes of grave-dust.',
      'Nothing rots here — it only dries, and waits.',
      'Your torchlight seems to shrink from the dark between the tombs.',
      'The silence is total, the way only the company of the dead is silent.',
    ],
  },
  {
    value: 'fiend',
    label: 'Infernal sanctum',
    type: 'fiend',
    sites: ['Sanctum', 'Hellmouth', 'Chancel', 'Pit', 'Sacrarium', 'Brand', 'Reliquary'],
    air: [
      'The stone is warm to the touch, and somewhere far below, something breathes.',
      'A smell of scorched iron and old incense clings to everything.',
      'The shadows fall the wrong way, as if the light itself is afraid.',
      'Chalked wards flake from every threshold — someone tried to keep this in.',
    ],
  },
  {
    value: 'aberration',
    label: 'Aberrant deep',
    type: 'aberration',
    sites: ['Deep', 'Sink', 'Hollow', 'Fold', 'Aperture', 'Sprawl', 'Warren'],
    air: [
      "Angles that should meet don't, and looking too long makes your eyes ache.",
      'A low hum sits under everything, felt in the teeth more than heard.',
      'The walls glisten though there is no water, and they seem to watch.',
      'The passages branch too often, and never quite the way you remember.',
    ],
  },
  {
    value: 'construct',
    label: 'Warded vault',
    type: 'construct',
    sites: ['Vault', 'Foundry', 'Manufactory', 'Enginework', 'Mechanism', 'Gallery'],
    air: [
      'Everything is squared, plumb, and pitiless — built to a plan, not grown.',
      'Gears tick somewhere in the walls, keeping a time no one set.',
      'Fine brass-and-stone dust coats every surface, undisturbed for an age.',
      'Sigils on the floor brighten as you pass, and dim again behind you.',
    ],
  },
  {
    value: 'beast',
    label: 'Beast warren',
    type: 'beast',
    sites: ['Warren', 'Den', 'Burrow', 'Lair', 'Nest', 'Rookery', 'Thicket'],
    air: [
      'The floor is fouled with old bones and the reek of a hundred kills.',
      'Something large has worn these passages smooth with its passing.',
      'Flies drone in the dark, and the air is thick and close and living.',
      'Fresh claw-marks score the walls at the height of a tall rider.',
    ],
  },
  {
    value: 'dragon',
    label: "Dragon's lair",
    type: 'dragon',
    sites: ['Lair', 'Hoard-hall', 'Roost', 'Cinderhall', 'Aerie', 'Deep'],
    air: [
      'The heat rises the deeper you go, and the walls are glazed to glass in places.',
      'Everything glitters faintly — a stray coin, a lost scale, a chip of gilt.',
      'The silence has weight, the kind that sits over something enormous, sleeping.',
      'Great raking grooves in the stone say something huge turns around in here.',
    ],
  },
  {
    value: 'fey',
    label: 'Fey ruin',
    type: 'fey',
    sites: ['Hollow', 'Grove', 'Ring', 'Bower', 'Glade', 'Thornhall', 'Wend'],
    air: [
      'The light is wrong — dusk-coloured, though there is no sky.',
      'Flowers bloom from the bare stone, and their scent makes you want to stay.',
      'You hear laughter, always around the next corner, never quite here.',
      'Time feels loose here, and you cannot say how long you have walked.',
    ],
  },
  {
    value: 'giant',
    label: 'Giant hold',
    type: 'giant',
    sites: ['Hold', 'Steading', 'Longhouse', 'Keep', 'Bastion', 'Hall'],
    air: [
      'Everything is built too large — the steps, the doors, the very chairs.',
      'The air moves in slow, cavernous drafts, like the breath of the place itself.',
      'Crude and colossal work, hewn by hands that never needed tools.',
      'A single dropped tankard here could hold a full keg of ale.',
    ],
  },
  {
    value: 'humanoid',
    label: 'Occupied stronghold',
    type: 'humanoid',
    sites: ['Stronghold', 'Warcamp', 'Redoubt', 'Hideout', 'Warren', 'Barracks-hold'],
    air: [
      'Cook-fires, middens, and crude banners mark a place that is lived in, not lost.',
      'Someone was here recently — the tracks are fresh and the fires still warm.',
      'Rough repairs and looted finery clutter every hall.',
      'A watch-horn hangs by each door; this place will not be surprised twice.',
    ],
  },
];

const NAME_ADJ = [
  'Sunken', 'Forgotten', 'Blighted', 'Weeping', 'Gilded', 'Shattered', 'Whispering', 'Buried',
  'Drowned', 'Ashen', 'Thorned', 'Hollow', 'Cursed', 'Starless', 'Sundered', 'Nameless', 'Riven', 'Fallow',
];

// ── Room dressing (shared, themeless) ────────────────────────────────────────
const ROOM_CONDITION = [
  'Flooded', 'Collapsed', 'Scorched', 'Silent', 'Gilded', 'Ransacked', 'Sealed', 'Moss-choked',
  'Frozen', 'Blood-slick', 'Echoing', 'Toppled', 'Sunless', 'Sagging', 'Ash-choked', 'Overgrown',
  'Cramped', 'Cavernous', 'Slanted', 'Mirrored',
];
const ROOM_AREA = [
  'Antechamber', 'Gallery', 'Guardroom', 'Cistern', 'Shrine', 'Crypt-hall', 'Armory', 'Kitchen',
  'Cell-block', 'Long Hall', 'Landing', 'Vault-room', 'Study', 'Refectory', 'Well-room', 'Barracks',
  'Reliquary', 'Menagerie', 'Oratory', 'Ossuary', 'Gatehouse', 'Undercroft', 'Rotunda', 'Colonnade',
];

// Generic "closer look" features — a hook, an interactable, an unsettling detail.
const FEATURES = [
  'A dry fountain, its basin filled instead with the dust of old offerings.',
  'A mural, half-scoured away, that seems to depict the party themselves.',
  'A cold hearth with a single chair — still, somehow, faintly warm.',
  'A stair that descends three steps and simply stops at a blank wall.',
  'A heap of rusted weapons, none of them from any army you know.',
  'A door that has been chained, barred, and bricked over — from this side.',
  'A pool of black water that gives back no reflection.',
  'Bootprints in the dust, walking in, and never out again.',
  'A birdcage hangs from the ceiling, its door open, something molted inside.',
  'A row of iron hooks, each hung with a different painted mask.',
  'A single candle, unlit, that has relit itself by the time you look back.',
  'A message scratched fresh over much older marks, in a hand you half-know.',
  'A well of warm air rising from a grate too narrow to follow.',
  'A game left mid-play on a stone table, the pieces still faintly warm.',
  'A tapestry that ripples though there is no draft to move it.',
  'A ledger of names, the last few written in a fresher, shakier ink.',
];

// Small finds — a curio, or a purse with a real number in it.
const CURIOS = [
  'a rusted iron key, its ward filed smooth by long use',
  'a torn corner of a map, showing a room you have not reached',
  'a signet ring, the sigil deliberately scratched out',
  'a bundle of letters, water-stained past reading but for one name',
  'a vial of something that glows a sickly green',
  "a child's toy, carved with more love than skill",
  'a strongbox, empty but for a single black feather',
  'a flask of decent brandy, unaccountably unbroken',
  'a war-medal from a country no map remembers',
  'a hand mirror that shows the room a moment before you entered',
];

function smallFind(c: Composer): string {
  if (c.chance(0.4)) return `a purse of ${c.int(1, 6) * 6} gp, spilled and scattered in the dust`;
  return c.among(CURIOS);
}

const SIZES: Record<string, [number, number]> = { small: [3, 4], medium: [4, 6], large: [6, 8] };

// Treasure presets map the dungeon's one "Treasure" dial onto the hoard's three.
const TREASURE: Record<string, HoardDials> = {
  lean: { coins: 'lean', valuables: 'few', items: 'fewer' },
  standard: { coins: 'standard', valuables: 'standard', items: 'standard' },
  rich: { coins: 'rich', valuables: 'many', items: 'more' },
  hoard: { coins: 'rich', valuables: 'many', items: 'loaded' },
};

// The boss stands a little above the party (a delve's finale); the hoard matches
// the BOSS's tier, keyed off party level.
const bossCr = (level: number): number => Math.min(24, Math.max(1, level + 2));
const hoardTier = (cr: number): string => (cr <= 4 ? '0-4' : cr <= 10 ? '5-10' : cr <= 16 ? '11-16' : '17+');

/** Monster names of a given type at a given CR. */
function poolAt(tables: TableRegistry, crTag: string, type: string): string[] {
  const table = tables.get(MONSTERS);
  return (table?.entries ?? [])
    .filter((e) => typeof e !== 'string' && (e.tags?.includes(crTag) ?? false) && (!type || (e.tags?.includes(type) ?? false)))
    .map((e) => (typeof e === 'string' ? e : e.text));
}

/** Pick the boss: the theme's creature type at (or near) the target CR, falling
 *  back to any type at that CR — a themed delve never asks for a CR its type
 *  can't fill. Returns the name and the CR it actually landed on. */
function pickBoss(c: Composer, tables: TableRegistry, cr: number, type: string): { name: string; cr: number } {
  let pool = poolAt(tables, `cr-${cr}`, type);
  let landed = cr;
  if (!pool.length && type) {
    for (let d = 1; d <= 6 && !pool.length; d++) {
      for (const alt of [cr - d, cr + d]) {
        if (alt >= 1 && alt <= 25) {
          const p = poolAt(tables, `cr-${alt}`, type);
          if (p.length) { pool = p; landed = alt; break; }
        }
      }
    }
  }
  if (!pool.length) pool = poolAt(tables, `cr-${cr}`, '');
  if (!pool.length) pool = poolAt(tables, 'cr-1', '');
  const name = pool.length ? pool[Math.floor(c.rng() * pool.length)]! : 'a nameless guardian';
  return { name, cr: landed };
}

// Low-CR bands a room's "lurking" minions can be drawn from.
const LOW_CR = [
  { tag: 'cr-1-8', cr: 0 }, { tag: 'cr-1-4', cr: 0 }, { tag: 'cr-1-2', cr: 0 },
  { tag: 'cr-1', cr: 1 }, { tag: 'cr-2', cr: 2 }, { tag: 'cr-3', cr: 3 }, { tag: 'cr-4', cr: 4 }, { tag: 'cr-5', cr: 5 },
];

/** A minor creature of the theme's type at a modest CR, for a room's "lurking". */
function lurker(c: Composer, tables: TableRegistry, type: string, maxCr: number): string | null {
  const options: string[] = [];
  for (const { tag, cr } of LOW_CR) if (cr <= Math.max(1, maxCr)) options.push(...poolAt(tables, tag, type));
  const pool = options.length ? options : poolAt(tables, 'cr-1', '');
  return pool.length ? pool[Math.floor(c.rng() * pool.length)]! : null;
}

export const meta: CompositeMeta = {
  id: 'gm/dungeon',
  title: 'Dungeon',
  pillar: 'gm',
  description:
    'A whole themed delve in one roll: a mood, a warded gate, a run of rooms that each carry real trouble — a sprung trap, a thing worth a closer look, words on the walls, something lurking — and an inner sanctum where a themed boss guards a full treasure hoard. Pick a theme and size it to your party, then dial the loot lean or heavy.',
  addLabel: 'Add dungeon',
  options: [
    {
      id: 'theme',
      label: 'Theme',
      choices: [{ value: '', label: 'Surprise me' }, ...THEMES.map((t) => ({ value: t.value, label: t.label }))],
      default: '',
    },
    {
      id: 'size',
      label: 'Size',
      choices: [
        { value: 'small', label: 'Small (3–4 rooms)' },
        { value: 'medium', label: 'Medium (4–6 rooms)' },
        { value: 'large', label: 'Large (6–8 rooms)' },
      ],
      default: 'medium',
    },
    {
      id: 'level',
      label: 'Party level',
      choices: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` })),
      default: '3',
    },
    {
      id: 'treasure',
      label: 'Treasure',
      choices: [
        { value: 'lean', label: 'Lean' },
        { value: 'standard', label: 'Standard' },
        { value: 'rich', label: 'Rich' },
        { value: 'hoard', label: 'Hoard-heavy' },
      ],
      default: 'standard',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const level = Math.min(20, Math.max(1, Number(opts.level) || 3));
  const [lo, hi] = SIZES[opts.size ?? 'medium'] ?? SIZES.medium!;
  const roomCount = lo + Math.floor(c.rng() * (hi - lo + 1));

  const theme = THEMES.find((t) => t.value === opts.theme) ?? c.among(THEMES);
  const name = `The ${c.among(NAME_ADJ)} ${c.among(theme.sites)}`;

  const targetCr = bossCr(level);
  const boss = pickBoss(c, tables, targetCr, theme.type);
  const cr = boss.cr;
  const tier = hoardTier(cr); // the vault matches its guardian, not the visitors

  const sections: Block[] = [];

  // The mood — one or two atmosphere lines that make the whole place cohere.
  const first = theme.air[Math.floor(c.rng() * theme.air.length)]!;
  let air = first;
  if (c.chance(0.5)) {
    const rest = theme.air.filter((l) => l !== first);
    air += ` ${rest[Math.floor(c.rng() * rest.length)]!}`;
  }
  sections.push({
    type: 'paragraph',
    label: 'The Approach',
    text: `${air} Local talk calls it ${name}; those who go in speaking of easy pickings mostly do not come out.`,
  });

  // The way in is warded — a riddle-gate the delvers must answer or outwit.
  sections.push({ type: 'paragraph', label: 'The Warded Gate', text: c.text('{table:gm/dungeon/riddle}') });

  // The rooms — each a set-piece with real, layered opportunity on top.
  const seenRooms: string[] = [];
  const seenTitles: string[] = [];
  const foes: string[] = [boss.name]; // everything that fights, for the SRD tail
  for (let i = 0; i < roomCount; i++) {
    let title = `${c.among(ROOM_CONDITION)} ${c.among(ROOM_AREA)}`;
    for (let t = 0; t < 5 && seenTitles.includes(title); t++) title = `${c.among(ROOM_CONDITION)} ${c.among(ROOM_AREA)}`;
    seenTitles.push(title);

    const setPiece = c.distinct('{table:gm/dungeon/room}', seenRooms);
    seenRooms.push(setPiece);

    const pairs: { key: string; value: string }[] = [{ key: `Room ${i + 1} · The ${title}`, value: setPiece }];

    // a sprung trap (trap integration)
    if (c.chance(0.45)) pairs.push({ key: 'Trap', value: c.text('{table:gm/dungeon/hazard}') });

    // a thing worth a closer look — sometimes a genuine art object (art integration)
    if (c.chance(0.55)) {
      if (c.chance(0.4)) pairs.push({ key: 'On a plinth', value: artObjectLine(c, true) });
      else pairs.push({ key: 'A closer look', value: c.among(FEATURES) });
    }

    // words on the walls
    if (c.chance(0.3)) pairs.push({ key: 'On the walls', value: c.text('{table:gm/dungeon/graffiti}') });

    // something lurking, drawn from the theme's own kind
    if (c.chance(0.4)) {
      const foe = lurker(c, tables, theme.type, cr - 2);
      if (foe) {
        pairs.push({ key: 'Lurking here', value: `${c.int(1, 4)} × ${foe}` });
        foes.push(foe);
      }
    }

    // something small to pocket
    if (c.chance(0.25)) pairs.push({ key: 'You also find', value: smallFind(c) });

    sections.push({ type: 'keyValue', pairs } as KeyValueBlock);
  }

  // The inner sanctum: the themed boss and the hoard it guards.
  sections.push({
    type: 'paragraph',
    label: 'The Inner Sanctum',
    text: `The delve ends here, where ${boss.name} — CR ${cr} — keeps what the delvers came for. Do not let them reach it unbled.`,
  });

  // A full, dial-able hoard — the same assembly the Hoard tool uses.
  const dials = TREASURE[opts.treasure ?? 'standard'] ?? TREASURE.standard!;
  const hoard = hoardSections(c, tier, dials, { container: true, map: true });
  sections.push({
    type: 'paragraph',
    label: 'The Hoard',
    text: `Sized to a CR ${cr} guardian. Turn the Treasure dial to make it lean or heavy.`,
  });
  sections.push(...hoard.sections);

  // Half the time, the delve isn't what it looked like from the gate.
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'The Truth of It', text: c.text('{table:gm/adventure/twist}') });
  }

  // the boss and every lurker, runnable at the table (audit batch E)
  sections.push(...srdSections(tables, foes));

  return [
    {
      type: 'statblock',
      name,
      meta: `${theme.label} · ${roomCount} rooms · boss CR ${cr}`,
      sections,
    },
  ];
}
