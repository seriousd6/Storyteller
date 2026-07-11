// Phase 3 bulk migration, part 1: adventure, villain, plot hooks, wagon,
// world, government, magic, monsters, and the remaining loot content.
// Manifests derived from the structural maps of the legacy files.
// Re-runnable: node scripts/extract-phase3.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  V1_JS,
  extractArrayLiteral,
  extractObjectLiteral,
  evalEntries,
  evalEntriesLoose,
  evalLoose,
  cleanStrings,
  writeTable,
  slugify,
  stats,
} from './lib.mjs';

const src = Object.fromEntries(
  ['adventure.js', 'plothooks.js', 'wagon.js', 'world.js', 'government.js', 'Magic.js', 'AdventureMonolith.js', 'loot.js'].map(
    (f) => [f, readFileSync(join(V1_JS, f), 'utf8')],
  ),
);

/** Build one tagged table from several legacy arrays: [[varName, occ, tag, replace?], ...] */
function taggedTable(fileSrc, specs, { id, title, loose = false } = {}) {
  const entries = [];
  for (const [varName, occ, tag, replace = {}] of specs) {
    const fn = loose ? evalEntriesLoose : evalEntries;
    for (const text of fn(extractArrayLiteral(fileSrc, varName, occ), replace, `${id}#${tag}`)) {
      entries.push(tag ? { text, tags: [tag] } : text);
    }
  }
  writeTable({ id, title, entries });
}

const dedupe = (arr) => [...new Set(arr)];

// ===========================================================================
console.log('ADVENTURE');
const adv = src['adventure.js'];
const A = 'gm/adventure';

for (const [varName, slug, title] of [
  ['tier', 'tier', 'Adventure Tier'],
  ['flavor', 'flavor', 'Adventure Flavor'],
  ['startOfConflict', 'conflict-start', 'How the Conflict Starts'],
  ['premise', 'premise', 'Adventure Premises'],
  ['worldArtifact', 'artifact', 'World-Shaping Artifacts'],
  ['twistInStory', 'twist', 'Story Twists'],
  ['seatOfPower', 'seat-of-power', 'Seats of Power'],
  ['pointOfInterest', 'point-of-interest', 'Points of Interest'],
  ['monologueArray', 'monologue', 'Villain Monologues'],
  ['moral', 'moral', 'Story Morals'],
  ['bossMechanics', 'boss-mechanic', 'Boss Fight Mechanics'],
  ['disparity', 'disparity', 'Party Disparities'],
  ['method', 'method', 'Villain Methods (Narrative)'],
]) {
  writeTable({ id: `${A}/${slug}`, title, entries: evalEntries(extractArrayLiteral(adv, varName, 1), {}, slug) });
}
writeTable({
  id: `${A}/conflict`,
  title: 'Central Conflicts',
  entries: dedupe(evalEntries(extractArrayLiteral(adv, 'conflictArray', 1), {}, 'conflict')),
});

{
  const plot = evalLoose(extractArrayLiteral(adv, 'plot', 1));
  writeTable({ id: `${A}/story-intro`, title: 'Story Introductions', entries: cleanStrings(plot[0], 'story-intro') });
  writeTable({ id: `${A}/story-structure`, title: 'Story Structures', entries: cleanStrings(plot[1], 'story-structure') });
  const devs = evalLoose(extractArrayLiteral(adv, 'devs', 1));
  writeTable({ id: `${A}/story-development`, title: 'Story Developments', entries: dedupe(cleanStrings(devs.flat(), 'story-development')) });
  writeTable({
    id: `${A}/story-seed`,
    title: 'Story Seed',
    entries: [
      { text: `{table:${A}/story-intro} {table:${A}/story-development}`, weight: 2 },
      { text: `{table:${A}/story-structure} {table:${A}/story-development}`, weight: 1 },
      { text: `{table:${A}/conflict-start}`, weight: 2 },
    ],
  });
}

{
  const out = evalLoose(extractArrayLiteral(adv, 'out', 1));
  writeTable({ id: `${A}/war-cause`, title: 'War Causes', entries: cleanStrings(out[0], 'war-cause') });
  writeTable({ id: `${A}/war-subject`, title: 'War Subjects', entries: cleanStrings(out[1], 'war-subject') });
  writeTable({ id: `${A}/war-complication`, title: 'War Complications', entries: cleanStrings(out[2], 'war-complication') });
  writeTable({
    id: `${A}/war-background`,
    title: 'War Background',
    entries: [
      `This conflict's primary cause is {table:${A}/war-cause}. The main {table:${A}/war-subject}. It is complicated by the fact that {table:${A}/war-complication}`,
    ],
  });
}

for (const [varName, slug, title] of [
  ['crime', 'crime', 'Crimes'],
  ['crimeLocation', 'crime-location', 'Crime Locations'],
  ['clues', 'crime-clue', 'Crime Clues'],
  ['perpetrators', 'crime-perpetrator', 'Perpetrators'],
  ['crimeMotive', 'crime-motive', 'Crime Motives'],
  ['interestedParties', 'crime-interested', 'Interested Parties'],
  ['outsideElements', 'crime-outsider', 'Outside Elements'],
  ['timeSinceCrime', 'crime-time-since', 'Time Since the Crime'],
  ['currentWeather', 'crime-weather', 'Weather'],
  ['timeOfDay', 'crime-time-of-day', 'Time of Day'],
]) {
  writeTable({ id: `${A}/${slug}`, title, entries: evalEntries(extractArrayLiteral(adv, varName, 1), {}, slug) });
}
writeTable({
  id: `${A}/crime-scene`,
  title: 'Crime Scene',
  entries: [
    `The case of the {table:${A}/crime} {table:${A}/crime-location}. The main piece of evidence held by the town guard is {table:${A}/crime-clue} — the perpetrator is in fact {table:${A}/crime-perpetrator}. The prevailing theory is that {table:${A}/crime-interested} may be involved, and the suspected motive is {table:${A}/crime-motive}. However, another group is {table:${A}/crime-outsider} for this. It happened {table:${A}/crime-time-since} ago; it is currently {table:${A}/crime-time-of-day}, and the weather since the crime has been {table:${A}/crime-weather}.`,
  ],
});

// ===========================================================================
console.log('VILLAIN');
const V = 'gm/villain';
{
  const vs = evalLoose(extractObjectLiteral(adv, 'villainStuff', 1));
  writeTable({
    id: `${V}/type`,
    title: 'Villain Types',
    entries: [
      ...cleanStrings(vs.Type.Intelligent, 'villain-type').map((text) => ({ text, tags: ['intelligent'] })),
      ...cleanStrings(vs.Type.Unintelligent, 'villain-type').map((text) => ({ text, tags: ['mindless'] })),
    ],
  });
  writeTable({
    id: `${V}/objective`,
    title: 'Villain Objectives',
    entries: Object.entries(vs.Objective).flatMap(([key, leaves]) =>
      cleanStrings(leaves, 'villain-objective').map((text) => ({ text: `${key} — ${text}`, tags: [slugify(key)] })),
    ),
  });
  writeTable({
    id: `${V}/method`,
    title: 'Villain Methods',
    entries: Object.entries(vs.Methods).flatMap(([key, leaves]) =>
      cleanStrings(leaves, 'villain-method').map((text) => ({ text: `${key} — ${text}`, tags: [slugify(key)] })),
    ),
  });
  writeTable({ id: `${V}/effect`, title: 'Villainous Effects on the Land', entries: cleanStrings(vs.Effect, 'villain-effect') });
  writeTable({
    id: `${V}/weakness`,
    title: 'Villain Weaknesses',
    entries: [
      ...cleanStrings(vs.intWeakness, 'villain-weakness').map((text) => ({ text, tags: ['intelligent'] })),
      ...cleanStrings(vs.nonIntWeakness, 'villain-weakness').map((text) => ({ text, tags: ['mindless'] })),
    ],
  });
  writeTable({
    id: `${V}/villain`,
    title: 'Villain',
    entries: [
      {
        text: `{table:${V}/type#intelligent}. Objective: {table:${V}/objective}. Methods: {table:${V}/method}; {table:${V}/method}. Weakness: {table:${V}/weakness#intelligent}`,
        weight: 70,
      },
      {
        text: `An unthinking menace: {table:${V}/type#mindless}. Its effect on the land: {table:${V}/effect} Weakness: {table:${V}/weakness#mindless}`,
        weight: 30,
      },
    ],
  });
}
for (const [varName, slug, title] of [
  ['premades', 'premade', 'Premade Villains'],
  ['titleArray', 'title', 'Villain Titles'],
  ['villainTraits', 'trait', 'Villain Traits'],
  ['motiveArray', 'motive', 'Villain Motives'],
]) {
  writeTable({ id: `${V}/${slug}`, title, entries: evalEntries(extractArrayLiteral(adv, varName, 1), {}, slug) });
}

// ===========================================================================
console.log('PLOT HOOKS');
const H = 'gm/hooks';
const ph = src['plothooks.js'];

writeTable({ id: `${H}/rogue-mission`, title: 'Rogue Missions', entries: evalEntries(extractArrayLiteral(ph, 'rogueMission', 1), {}, 'rogue-mission') });
taggedTable(ph, [
  ['paladinEncounter', 1, 'paladin'],
  ['monkEncounter', 1, 'monk'],
  ['bardEncounter', 1, 'bard'],
  ['clericEncounter', 1, 'cleric'],
  ['wizardEncounter', 1, 'wizard'],
  ['druidEncounter', 1, 'druid'],
  ['barbarianEncounter', 1, 'barbarian'],
  ['fighterEncounter', 1, 'fighter'],
  ['rangerEncounter', 1, 'ranger'],
  ['rogueArray', 1, 'rogue', { '${searchArray(rogueMission)}': `{table:${H}/rogue-mission}` }],
  ['sorcererHooks', 1, 'sorcerer'],
  ['warlockHooks', 1, 'warlock'],
], { id: `${H}/class`, title: 'Class Hooks' });

taggedTable(ph, [
  ['jungleEncounter', 1, 'jungle'],
  ['swampEncounter', 1, 'swamp'],
  ['oceanEncounter', 1, 'ocean'],
  ['mountainEncounter', 1, 'mountain'],
  ['coastalEncounter', 1, 'coast'],
  ['dungeonHooks', 1, 'dungeon'],
  ['villageEncounters', 1, 'village'],
], { id: `${H}/location`, title: 'Location Hooks' });

taggedTable(ph, [
  ['genericHook', 1, 'generic'],
  ['kidquestarray', 1, 'kids'],
  ['GhibliHooks', 1, 'whimsical'],
  ['monsterArray', 1, 'monster'],
  ['strongholdEncounters', 1, 'stronghold'],
], { id: `${H}/misc`, title: 'Wild Card Hooks' });

taggedTable(ph, [
  ['cityArtsEncounter', 1, 'arts'],
  ['cityNightlifeEncounter', 1, 'nightlife'],
  ['streetEncounters', 1, 'street'],
  ['cityShoppingEncounter', 1, 'shopping'],
  ['cityEntertainmentEncounter', 1, 'entertainment'],
  ['citySportsEncounter', 1, 'sports'],
  ['cityNauticalEncounters', 1, 'nautical'],
  ['cityEventEncounter', 1, 'event'],
  ['cityPersonalEncoutner', 1, 'personal'],
], { id: `${H}/city`, title: 'City Hooks' });

// ===========================================================================
console.log('WAGON');
const W = 'gm/wagon';
const wg = src['wagon.js'];

for (const [varName, slug, title] of [
  ['model', 'model', 'Wagon Models'],
  ['purpose', 'purpose', 'Wagon Purposes'],
  ['draughts', 'draft-animal', 'Draft Animals'],
  ['seat', 'seat', "Driver's Seats"],
  ['wheels', 'wheels', 'Wheels'],
  ['obstacleMobility', 'mobility', 'Obstacle Mobility'],
  ['mods', 'modification', 'Modifications'],
  ['roof', 'roof', 'Roofs'],
  ['insideLighting', 'lighting-interior', 'Interior Lighting'],
  ['externalLighting', 'lighting-exterior', 'Exterior Lighting'],
  ['exCombatEnhancements', 'combat-enhancement', 'Combat Enhancements'],
  ['framEnhance', 'frame-enhancement', 'Frame Enhancements'],
  ['emergency', 'emergency', 'Emergency Equipment'],
  ['interiorSize', 'interior', 'Interior Sizes'],
]) {
  writeTable({ id: `${W}/${slug}`, title, entries: evalEntries(extractArrayLiteral(wg, varName, 1), {}, slug) });
}
{
  const TECH_TAGS = ['furnace', 'water-tank', 'flywheel', 'ai', 'communication', 'self-driving', 'navigation', 'restoration', 'energy', 'exotic-travel'];
  const tech = evalLoose(extractArrayLiteral(wg, 'tech', 1));
  writeTable({
    id: `${W}/tech`,
    title: 'Wagon Technology',
    entries: tech.flatMap((sub, i) => cleanStrings(sub, `tech-${i}`).map((text) => ({ text, tags: [TECH_TAGS[i] ?? `tech-${i}`] }))),
  });
  const FURN_TAGS = ['comfort', 'sleep', 'security', 'combat', 'exploration', 'community', 'profession', 'storage', 'movement'];
  const furn = evalLoose(extractArrayLiteral(wg, 'furnishings', 1));
  writeTable({
    id: `${W}/furnishing`,
    title: 'Wagon Furnishings',
    entries: furn.flatMap((sub, i) => cleanStrings(sub, `furnishing-${i}`).map((text) => ({ text, tags: [FURN_TAGS[i] ?? `furnishing-${i}`] }))),
  });
}

// ===========================================================================
console.log('WORLD');
const WO = 'gm/world';
const wd = src['world.js'];

for (const [varName, slug, title, replace] of [
  ['worldOrigin', 'origin', 'World Origins'],
  ['physComp', 'composition', 'Physical Compositions'],
  ['worldAge', 'age', 'World Ages'],
  ['worldDieties', 'deities', 'Deities'],
  ['worldMagic', 'magic', 'How Magic Works'],
  ['worldTitan', 'titan', 'World Titans'],
  ['worldSpecArchetypes', 'species-archetype', 'Species Archetypes'],
  ['specInterRelat', 'species-relations', 'Species Relations'],
  ['windDirection', 'wind', 'Wind Directions'],
  ['strangePhenomena', 'phenomenon', 'Strange Phenomena', { '${searchArray(windDirection)}': '{table:gm/world/wind}' }],
  ['worldIntSpecies', 'species-count', 'Intelligent Species', { "'@@Placeholder@@'": "'{count:2-6}'", '@@Placeholder@@': '{count:2-6}' }],
]) {
  writeTable({ id: `${WO}/${slug}`, title, entries: evalEntries(extractArrayLiteral(wd, varName, 1), replace ?? {}, slug) });
}
{
  const seasonReplace = {
    '${searchArray(windDirection)}': `{table:${WO}/wind}`,
    '${searchArray(strangePhenomena)}': `{table:${WO}/phenomenon}`,
  };
  for (const season of ['Winter', 'Spring', 'Summer', 'Fall']) {
    writeTable({
      id: `${WO}/weather-${season.toLowerCase()}`,
      title: `${season} Weather`,
      entries: evalEntries(extractArrayLiteral(wd, season, 1), seasonReplace, `weather-${season}`),
    });
  }
  writeTable({
    id: `${WO}/weather`,
    title: 'Weather',
    entries: ['Winter', 'Spring', 'Summer', 'Fall'].map((s) => `(${s}) {table:${WO}/weather-${s.toLowerCase()}}`),
  });
  writeTable({
    id: `${WO}/species`,
    title: 'Intelligent Species',
    entries: [
      `{table:${WO}/species-count} Among them: {table:${WO}/species-archetype} — and {table:${WO}/species-archetype} Relations: {table:${WO}/species-relations}`,
    ],
  });
}

// Wild magic surge: original effects + the legacy world.js surge table, one home.
writeTable({
  id: 'gm/magic/wild-surge',
  title: 'Wild Magic Surge',
  entries: [
    'For the next minute, your voice booms three times louder than intended.',
    'You teleport 10 feet in a random direction.',
    'Harmless blue flames dance over your skin for a minute.',
    'Every unlocked door within 30 feet swings open.',
    'You smell strongly of cinnamon for an hour.',
    'Your hair grows six inches instantly.',
    'A confused chicken appears in your hands and vanishes after a minute.',
    'Rain falls in a 10-foot circle centered on you for one minute, indoors or out.',
    'Your shadow acts out your movements a full second late for an hour.',
    'The nearest small object floats gently for one minute.',
    'You can only whisper for the next ten minutes.',
    'Gravity hiccups: everyone within 10 feet rises an inch, then settles.',
    'All metal you carry turns warm to the touch for an hour.',
    'You understand every language spoken around you for one minute — but cannot speak.',
    'Flowers sprout in your footprints for the next hour.',
    'Your eyes glow {pick:violet|gold|green|ember-red} until dawn.',
    'A spectral bell tolls once, audible for a mile.',
    'The next word you say echoes for a full minute.',
    'You are convinced, for ten minutes, that your name is different.',
    '{count:3-9} small illusory birds orbit your head for an hour.',
    'Every candle within 60 feet {pick:lights|snuffs out} at once.',
    'You gain the perfect memory of a meal you never ate.',
    'Your reflection waves at you the next time you see it.',
    'For one minute, you weigh {pick:half|twice} as much.',
    'The ground within 5 feet of you becomes briefly, harmlessly bouncy.',
    'You taste the last lie told in your presence.',
    'A faint aurora shimmers above you for ten minutes.',
    'Your pockets swap contents with each other.',
    'The next creature you touch is dusted with glitter that resists all cleaning for a day.',
    'You hiccup soap bubbles for one minute.',
    'Time skips: everyone within 30 feet loses the same six seconds.',
    'A {table:gm/tavern/name-monster#small}, translucent and friendly, follows you for an hour, then fades.',
    ...evalEntries(extractArrayLiteral(wd, 'wildMagic', 1), {}, 'wild-surge-legacy'),
  ],
});

// ===========================================================================
console.log('GOVERNMENT');
const G = 'gm/government';
const gov = src['government.js'];
{
  const types = evalLoose(extractObjectLiteral(gov, 'government', 1));
  const leader = [];
  const goal = [];
  const citizenGoal = [];
  const method = [];
  const complication = [];
  const system = [];
  for (const [name, t] of Object.entries(types)) {
    const tag = slugify(name);
    leader.push(...cleanStrings(t.leader, `${name}.leader`).map((text) => ({ text, tags: [tag] })));
    goal.push(...cleanStrings(t.goals, `${name}.goals`).map((text) => ({ text, tags: [tag] })));
    citizenGoal.push(...cleanStrings(t.citizenGoals, `${name}.citizenGoals`).map((text) => ({ text, tags: [tag] })));
    method.push(...cleanStrings(t.methods, `${name}.methods`).map((text) => ({ text, tags: [tag] })));
    complication.push(...cleanStrings(t.complications, `${name}.complications`).map((text) => ({ text, tags: [tag] })));
    const quote = String(t.quote ?? '').replace(/\s+/g, ' ').trim();
    const desc = String(t.description ?? '').replace(/\s+/g, ' ').trim();
    const compare = String(t.comparison ?? '').replace(/\s+/g, ' ').trim();
    system.push(
      `${name} — “${quote}” ${desc} (Compare: ${compare}) Leadership: {table:${G}/leader#${tag}} State goals: {table:${G}/goal#${tag}} / {table:${G}/goal#${tag}} Methods: {table:${G}/method#${tag}} / {table:${G}/method#${tag}} The citizenry wants: {table:${G}/citizen-goal#${tag}} Complication: {table:${G}/complication#${tag}}`,
    );
  }
  writeTable({ id: `${G}/leader`, title: 'Leaders', entries: leader });
  writeTable({ id: `${G}/goal`, title: 'State Goals', entries: goal });
  writeTable({ id: `${G}/citizen-goal`, title: 'Citizen Goals', entries: citizenGoal });
  writeTable({ id: `${G}/method`, title: 'Government Methods', entries: method });
  writeTable({ id: `${G}/complication`, title: 'Government Complications', entries: complication });
  writeTable({ id: `${G}/government`, title: 'Government', entries: system });
}
for (const [varName, slug, title] of [
  ['alignment', 'alignment', 'Government Alignment'],
  ['moraleArray', 'morale', 'Public Morale'],
  ['atmosphere', 'atmosphere', 'Civic Atmosphere'],
  ['govEra', 'era-government', 'Government Era'],
  ['civEra', 'era-civilization', 'Civilization Era'],
  ['peopleRenown', 'renown', 'What the Citizens Are Known For'],
  ['economicType', 'economy-type', 'Economic Types'],
  ['wealthDistribution', 'wealth', 'Wealth Distribution'],
  ['taxation', 'taxation', 'Taxation'],
  ['treasuryStatus', 'treasury', 'Treasury Status'],
  ['cuisine', 'cuisine', 'Cuisine'],
  ['tradeType', 'trade-type', 'Trade Types'],
  ['tradeResources', 'trade-resource', 'Trade Resources'],
  ['luxuryResources', 'luxury-resource', 'Luxury Resources'],
  ['foreignPolicy', 'foreign-policy', 'Foreign Policy'],
  ['intrigue', 'intrigue', 'Court Intrigue'],
  ['schemes', 'scheme', 'Schemes'],
]) {
  writeTable({ id: `${G}/${slug}`, title, entries: evalEntries(extractArrayLiteral(gov, varName, 1), {}, slug) });
}
{
  const POLICY = [
    ['military', 'Military'],
    ['economic', 'Economic'],
    ['wildcard', 'Wildcard'],
    ['diplomatic', 'Diplomatic'],
    ['darkAge', 'Dark Age'],
    ['goldenAge', 'Golden Age'],
    ['scientific', 'Scientific'],
    ['justice', 'Justice'],
    ['infrastructure', 'Infrastructure'],
    ['agriculture', 'Agriculture'],
    ['urbanDesign', 'Urban Design'],
    ['spirituality', 'Spirituality'],
  ];
  const entries = [];
  for (const [varName, label] of POLICY) {
    for (const text of evalEntries(extractArrayLiteral(gov, varName, 1), {}, `policy-${varName}`)) {
      entries.push({ text: `${label} — ${text}`, tags: [slugify(label)] });
    }
  }
  writeTable({ id: `${G}/policy`, title: 'Historic Policies', entries });
  writeTable({
    id: `${G}/economy`,
    title: 'Economy',
    entries: [`{table:${G}/economy-type} Wealth: {table:${G}/wealth} Taxes: {table:${G}/taxation} Treasury: {table:${G}/treasury}`],
  });
  writeTable({
    id: `${G}/trade`,
    title: 'Trade',
    entries: [`{table:${G}/trade-type} Chief export: {table:${G}/trade-resource} Luxury trade: {table:${G}/luxury-resource}`],
  });
}

// ===========================================================================
console.log('MAGIC');
const M = 'gm/magic';
const mg = src['Magic.js'];
{
  // Practitioners referenced by ${buildClass()} in Accessibility entries.
  const classes = evalLoose(extractArrayLiteral(mg, 'classes', 1));
  const professions = evalLoose(extractObjectLiteral(mg, 'professions', 1));
  writeTable({
    id: `${M}/practitioner`,
    title: 'Magic Practitioners',
    entries: dedupe([
      ...cleanStrings(classes.flat(), 'practitioner-classes'),
      ...Object.values(professions).flatMap((v) => cleanStrings(v, 'practitioner-professions')),
    ]),
  });

  const literal = extractObjectLiteral(mg, 'magics', 1).split('${buildClass()}').join(`{table:${M}/practitioner}`);
  const magics = evalLoose(literal);
  const pillars = { Source: [], Cost: [], Potency: [], Accessibility: [], Mastery: [] };
  const system = [];
  for (const [name, cat] of Object.entries(magics)) {
    const tag = slugify(name);
    for (const pillar of Object.keys(pillars)) {
      const leaves = cat[pillar];
      if (!Array.isArray(leaves)) continue;
      pillars[pillar].push(...cleanStrings(leaves, `${name}.${pillar}`).map((text) => ({ text, tags: [tag] })));
    }
    system.push(
      `${name} Magic — Source: {table:${M}/source#${tag}} Cost: {table:${M}/cost#${tag}} Potency: {table:${M}/potency#${tag}} Accessibility: {table:${M}/accessibility#${tag}} Mastery: {table:${M}/mastery#${tag}}`,
    );
  }
  writeTable({ id: `${M}/source`, title: 'Magic Sources', entries: pillars.Source });
  writeTable({ id: `${M}/cost`, title: 'Magic Costs', entries: pillars.Cost });
  writeTable({ id: `${M}/potency`, title: 'Magic Potencies', entries: pillars.Potency });
  writeTable({ id: `${M}/accessibility`, title: 'Magic Accessibility', entries: pillars.Accessibility });
  writeTable({ id: `${M}/mastery`, title: 'Magic Mastery', entries: pillars.Mastery });
  writeTable({ id: `${M}/system`, title: 'Magic System', entries: system });

  const methods = evalLoose(extractObjectLiteral(mg, 'magicMethods', 1));
  writeTable({
    id: `${M}/method`,
    title: 'Casting Methods',
    entries: Object.entries(methods).flatMap(([key, variants]) => {
      const k = String(key).replace(/\s+/g, ' ').trim();
      return cleanStrings(variants, 'magic-method').map((v) => `${k} ${v}`);
    }),
  });

  for (const [varName, slug, title] of [
    ['modifyingImagery', 'imagery', 'Magical Imagery'],
    ['modifyingIdeas', 'concept', 'Magical Concepts'],
    ['themeImagery', 'theme', 'Magical Themes'],
    ['status', 'status', 'Status of Magic'],
  ]) {
    writeTable({ id: `${M}/${slug}`, title, entries: evalEntries(extractArrayLiteral(mg, varName, 1), {}, slug) });
  }
}

// ===========================================================================
console.log('MONSTERS');
{
  const monsters = evalLoose(extractObjectLiteral(src['AdventureMonolith.js'], 'monsters', 1));
  const entries = [];
  for (const [cr, bucket] of Object.entries(monsters)) {
    if (!bucket || typeof bucket !== 'object' || 'Size' in bucket) continue; // malformed high-CR buckets
    for (const [name, info] of Object.entries(bucket)) {
      const text = name.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const tags = [`cr-${slugify(cr)}`];
      const size = typeof info?.Size === 'string' ? slugify(info.Size) : '';
      if (size) tags.push(size);
      entries.push({ text, tags });
    }
  }
  writeTable({
    id: 'gm/monsters/all',
    title: 'Monsters by Challenge Rating',
    description: 'Reference data for the Phase 4 encounter builder: every monster tagged with cr-<rating> and size.',
    entries,
  });
}

// ===========================================================================
console.log('LOOT — treasure maps and chests');
const L = 'gm/loot';
const lt = src['loot.js'];
{
  const dir = '{pick:north|north-east|east|south-east|south|south-west|west|north-west}';
  const mapReplace = { '${pickDirection()}': dir };
  for (const [varName, slug, title] of [
    ['start', 'map-start', 'Map Starting Points'],
    ['then', 'map-leg-1', 'Map First Legs'],
    ['until', 'map-marker-1', 'Map First Markers'],
    ['thenTwo', 'map-leg-2', 'Map Second Legs'],
    ['untilTwo', 'map-marker-2', 'Map Second Markers'],
    ['thenThree', 'map-leg-3', 'Map Final Legs'],
    ['xMarks', 'map-x', 'Where the Treasure Waits'],
  ]) {
    writeTable({ id: `${L}/${slug}`, title, entries: evalEntries(extractArrayLiteral(lt, varName, 1), mapReplace, slug) });
  }
  writeTable({
    id: `${L}/treasure-map`,
    title: 'Treasure Map',
    entries: [
      `The map starts at the {table:${L}/map-start}. {table:${L}/map-leg-1} until you find the {table:${L}/map-marker-1}. Then {table:${L}/map-leg-2} until you find {table:${L}/map-marker-2}. Lastly {table:${L}/map-leg-3} — and you will find the treasure {table:${L}/map-x}.`,
    ],
  });
  for (const [varName, occ, slug, title] of [
    ['style', 1, 'chest-style', 'Chest Styles'],
    ['material', 1, 'chest-material', 'Chest Materials'],
    ['trim', 1, 'chest-trim', 'Chest Trim'],
    ['mark', 1, 'chest-mark', "Craftsman's Marks"],
    ['trap', 1, 'chest-trap', 'Chest Traps'],
    ['lock', 1, 'chest-lock', 'Chest Locks'],
    ['keyLoc', 1, 'chest-key', 'Where the Key Is'],
  ]) {
    writeTable({ id: `${L}/${slug}`, title, entries: evalEntries(extractArrayLiteral(lt, varName, occ), {}, slug) });
  }
  writeTable({
    id: `${L}/treasure-chest`,
    title: 'Treasure Chest',
    entries: [
      `The treasure is enclosed by a {table:${L}/chest-style} chest made of {table:${L}/chest-material}. The trim and hinges are {table:${L}/chest-trim}. The craftsman left a mark: {table:${L}/chest-mark}. Carelessness will trigger {table:${L}/chest-trap}. To get past the {table:${L}/chest-lock}, one would need the key — currently {table:${L}/chest-key}.`,
    ],
  });
}

console.log(`\nPhase 3 part 1 done. Tables: ${stats.tables}, dropped entries: ${stats.dropped}`);
