// Phase 3 bulk migration, part 2: NPC/character content — character.js,
// race.js, shopkeeper.js, NPC Inteactions.js.
// Re-runnable: node scripts/extract-phase3-npc.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  V1_JS,
  extractArrayLiteral,
  extractObjectLiteral,
  evalEntries,
  evalLoose,
  cleanStrings,
  writeTable,
  slugify,
  stats,
} from './lib.mjs';

const ch = readFileSync(join(V1_JS, 'character.js'), 'utf8');
const rc = readFileSync(join(V1_JS, 'race.js'), 'utf8');
const sk = readFileSync(join(V1_JS, 'shopkeeper.js'), 'utf8');
const ni = readFileSync(join(V1_JS, 'NPC Inteactions.js'), 'utf8');

const N = 'gm/npc';
const S = 'gm/shop';

// ===========================================================================
console.log('CHARACTER — trait pools');
for (const [varName, slug, title] of [
  ['scars', 'scar', 'Scars'],
  ['quality', 'tattoo-quality', 'Tattoo Qualities'],
  ['goals', 'goal', 'Character Goals'],
  ['fears', 'fear', 'Character Fears'],
  ['sentimentalItem', 'keepsake-sentimental', 'Sentimental Keepsakes'],
  ['weirdItem', 'keepsake-weird', 'Weird Possessions'],
  ['oddity', 'keepsake-oddity', 'Oddities'],
  ['flaw', 'flaw', 'Character Flaws'],
  ['catchPhrase', 'catchphrase', 'Catchphrases'],
  ['personalityQuirk', 'quirk-personality', 'Personality Quirks'],
  ['physicalQuirk', 'quirk-physical', 'Physical Quirks'],
  ['childStories', 'childhood-story', 'Childhood Stories'],
  ['saying', 'saying', 'Sayings'],
  ['charlatain', 'backstory-charlatan', 'Charlatan Backstories'],
  ['normal', 'backstory-normal', 'Ordinary Backstories'],
  ['calmTrait', 'calm', 'When Calm'],
  ['stressedTrait', 'stressed', 'When Stressed'],
  ['currentMood', 'mood', 'Current Moods'],
  ['faithLevel', 'faith', 'Faith Levels'],
  ['hometown', 'hometown', 'Hometowns'],
  ['communitySecret', 'hometown-secret', 'Hometown Secrets'],
  ['discussionTopics', 'topic', 'Discussion Topics'],
]) {
  writeTable({ id: `${N}/${slug}`, title, entries: evalEntries(extractArrayLiteral(ch, varName, 1), {}, slug) });
}

{
  const tattoo = evalLoose(extractArrayLiteral(ch, 'tattoo', 1));
  const TAT = ['person', 'monster', 'misc'];
  tattoo.forEach((sub, i) => {
    writeTable({ id: `${N}/tattoo-${TAT[i]}`, title: `Tattoos — ${TAT[i]}`, entries: cleanStrings(sub, `tattoo-${TAT[i]}`) });
  });
}

console.log('CHARACTER — vocation (classes + professions)');
{
  const classes = evalLoose(extractArrayLiteral(ch, 'classes', 1));
  const TIER_WEIGHT = [10, 5, 2, 1];
  writeTable({
    id: `${N}/class`,
    title: 'Adventuring Classes',
    entries: classes.flatMap((sub, i) => cleanStrings(sub, `class-tier-${i}`).map((text) => ({ text, weight: TIER_WEIGHT[i] ?? 1 }))),
  });
  const professions = evalLoose(extractObjectLiteral(ch, 'professions', 1));
  writeTable({
    id: `${N}/profession`,
    title: 'Professions',
    entries: Object.entries(professions).flatMap(([field, list]) =>
      cleanStrings(list, `profession-${field}`).map((text) => ({ text: `${text} (${field})`, tags: [slugify(field)] })),
    ),
  });
  writeTable({
    id: `${N}/vocation`,
    title: 'Vocation',
    entries: [
      { text: `{table:${N}/profession}`, weight: 65 },
      { text: `{table:${N}/class}`, weight: 35 },
    ],
  });
}

console.log('CHARACTER — physical features (body object)');
{
  const bodyLiteral = extractObjectLiteral(ch, 'body', 1)
    .split('${searchArray(tattoo[0])}').join(`{table:${N}/tattoo-person}`)
    .split('${searchArray(tattoo[1])}').join(`{table:${N}/tattoo-monster}`)
    .split('${searchArray(tattoo[2])}').join(`{table:${N}/tattoo-misc}`)
    .split('${variableEvent(quality)}').join(`{table:${N}/tattoo-quality}`)
    .split('${searchArray(quality)}').join(`{table:${N}/tattoo-quality}`)
    .split('${searchArray(scars)}').join(`{table:${N}/scar}`);
  const body = evalLoose(bodyLiteral);
  const featureKeys = [];
  for (const [key, value] of Object.entries(body)) {
    if (key === 'scarOrTat' || key === 'jewelry') continue;
    if (!Array.isArray(value)) continue;
    const slug = slugify(key);
    featureKeys.push([key, slug]);
    writeTable({ id: `${N}/feature-${slug}`, title: `Features — ${key}`, entries: cleanStrings(value, `feature-${key}`) });
  }
  writeTable({
    id: `${N}/feature`,
    title: 'Physical Feature',
    entries: featureKeys.map(([key, slug]) => `${key}: {table:${N}/feature-${slug}}`),
  });
  writeTable({ id: `${N}/marking-type`, title: 'Markings', entries: cleanStrings(body.scarOrTat[0], 'marking-type') });
  writeTable({ id: `${N}/marking-location`, title: 'Marking Locations', entries: cleanStrings(body.scarOrTat[1], 'marking-location') });
  writeTable({ id: `${N}/jewelry-design`, title: 'Jewelry Designs', entries: cleanStrings(body.jewelry[0], 'jewelry-design') });
  writeTable({ id: `${N}/jewelry-material`, title: 'Jewelry Materials', entries: cleanStrings(body.jewelry[1], 'jewelry-material') });
  writeTable({ id: `${N}/jewelry-none`, title: 'No Jewelry', entries: cleanStrings(body.jewelry[2], 'jewelry-none') });
  writeTable({
    id: `${N}/markings`,
    title: 'Markings & Jewelry',
    entries: [
      { text: `Markings: {table:${N}/marking-type} — on the {table:${N}/marking-location}.`, weight: 2 },
      { text: `Jewelry: {table:${N}/jewelry-design} made of {table:${N}/jewelry-material}.`, weight: 1 },
      { text: `{table:${N}/jewelry-none}`, weight: 1 },
    ],
  });
}

{
  const prejudice = evalLoose(extractObjectLiteral(ch, 'prejudice', 1));
  writeTable({
    id: `${N}/prejudice`,
    title: 'Prejudices',
    entries: Object.entries(prejudice).flatMap(([key, list]) =>
      cleanStrings(list, `prejudice-${key}`).map((text) => `${key}: specifically toward ${text}`),
    ),
  });
  writeTable({
    id: `${N}/flaw-or-prejudice`,
    title: 'Flaw / Prejudice',
    entries: [
      { text: `Flaw: {table:${N}/flaw}`, weight: 55 },
      { text: `Prejudice — {table:${N}/prejudice}`, weight: 25 },
      { text: 'Flaw: this person is hiding something.', weight: 20 },
    ],
  });
}

writeTable({
  id: `${N}/keepsake`,
  title: 'Keepsake',
  entries: [
    { text: `{table:${N}/keepsake-sentimental}`, weight: 2 },
    { text: `{table:${N}/keepsake-weird}`, weight: 2 },
    { text: `{table:${N}/keepsake-oddity}`, weight: 1 },
  ],
});
writeTable({
  id: `${N}/motivation`,
  title: 'Goal or Fear',
  entries: [
    { text: `Goal: {table:${N}/goal}`, weight: 1 },
    { text: `Fear: {table:${N}/fear}`, weight: 1 },
  ],
});
writeTable({
  id: `${N}/quirk`,
  title: 'Quirk',
  entries: [
    { text: `Favorite phrase: “{table:${N}/catchphrase}”`, weight: 1 },
    { text: `{table:${N}/quirk-personality}`, weight: 1 },
    { text: `{table:${N}/quirk-physical}`, weight: 1 },
    { text: `They love telling this story: {table:${N}/childhood-story}`, weight: 1 },
    { text: `They often say: “{table:${N}/saying}”`, weight: 1 },
  ],
});
writeTable({
  id: `${N}/backstory`,
  title: 'Backstory',
  entries: [
    { text: `Charlatan: {table:${N}/backstory-charlatan}`, weight: 1 },
    { text: `{table:${N}/backstory-normal}`, weight: 1 },
  ],
});
writeTable({
  id: `${N}/demeanor`,
  title: 'Demeanor',
  entries: [`When calm: {table:${N}/calm} When stressed: {table:${N}/stressed}`],
});

// ===========================================================================
console.log('RACES — names and racial traits');
{
  const races = evalLoose(extractObjectLiteral(rc, 'races', 1));
  const TIER_WEIGHT = { Common: 40, Uncommon: 6, Rare: 2, VRare: 1, ERare: 1 };
  const raceEntries = [];
  const racialEntries = [];
  const isJunk = (s) => !s || s === 'WIP';
  for (const [tier, group] of Object.entries(races)) {
    for (const [race, data] of Object.entries(group)) {
      const tag = slugify(race);
      const weight = TIER_WEIGHT[tier] ?? 1;
      const racial = cleanStrings(data.racial ?? [], `${race}.racial`).filter((s) => !isJunk(s));
      if (racial.length) racialEntries.push(...racial.map((text) => ({ text, tags: [tag] })));
      const racialRef = racial.length ? ` Racial note: {table:${N}/racial#${tag}}` : '';

      const unified = cleanStrings(data.Name ?? [], `${race}.Name`).filter((s) => !isJunk(s));
      const male = cleanStrings(data.mName ?? [], `${race}.mName`).filter((s) => !isJunk(s));
      const female = cleanStrings(data.fName ?? [], `${race}.fName`).filter((s) => !isJunk(s));
      if (!unified.length && !male.length && !female.length) continue;

      const nameEntries = [
        ...unified.map((text) => ({ text })),
        ...male.map((text) => ({ text, tags: ['male'] })),
        ...female.map((text) => ({ text, tags: ['female'] })),
      ];
      writeTable({ id: `${N}/names/${tag}`, title: `${race} Names`, entries: nameEntries });

      if (unified.length) {
        raceEntries.push({ text: `Race: ${race}. Name: {table:${N}/names/${tag}}.${racialRef}`, weight: weight * 2 });
      } else {
        if (male.length) raceEntries.push({ text: `Race: ${race} (male). Name: {table:${N}/names/${tag}#male}.${racialRef}`, weight });
        if (female.length) raceEntries.push({ text: `Race: ${race} (female). Name: {table:${N}/names/${tag}#female}.${racialRef}`, weight });
      }
    }
  }
  writeTable({ id: `${N}/racial`, title: 'Racial Traits', entries: racialEntries });
  writeTable({ id: `${N}/race`, title: 'Race & Name', entries: raceEntries });
}

// ===========================================================================
console.log('SHOPKEEPER');
for (const [varName, slug, title] of [
  ['shopPremise', 'premise', 'Shop Premises'],
  ['traderPersonality', 'keeper-personality', 'Shopkeeper Personalities'],
  ['traderIdeal', 'keeper-ideal', 'Shopkeeper Ideals'],
  ['traderBond', 'keeper-bond', 'Shopkeeper Bonds'],
  ['traderFlaw', 'keeper-flaw', 'Shopkeeper Flaws'],
]) {
  writeTable({ id: `${S}/${slug}`, title, entries: evalEntries(extractArrayLiteral(sk, varName, 1), {}, slug) });
}
{
  const MERCHANTS = [
    ['alcoholAndRefreshment', 'Alcohol & Refreshments'],
    ['animalMerchant', 'Animals'],
    ['booksAndMapsMerchant', 'Books & Maps'],
    ['flowersMerchant', 'Flowers'],
    ['foodMerchant', 'Food'],
    ['artMerchant', 'Art'],
    ['fashionMerchant', 'Fashion'],
    ['jeweler', 'Jewelry'],
    ['KnickKnackMerchant', 'Knick-Knacks'],
    ['leatherWorker', 'Leatherworks'],
    ['mechanicalMerchant', 'Mechanica'],
    ['armorArray', 'Armor'],
    ['alchemyAndPotions', 'Alchemy & Potions'],
    ['religiousMerchant', 'Religious Goods'],
    ['bardInstruments', 'Instruments'],
    ['spellsAndScrolls', 'Spells & Scrolls'],
    ['thievingMerchant', "Thieves' Market"],
    ['toolsMerchant', 'Tools'],
    ['vehicleMerchant', 'Vehicles'],
    ['weaponTrader', 'Weapons'],
    ['astralTrader', 'Astral Curiosities'],
    ['magicItemsMerchant', 'Magic Items'],
    ['magicCreaturesMerchant', 'Magical Creatures'],
    ['necromanticMerchant', 'Necromantic Wares'],
    ['timelostMerchant', 'Timelost Goods'],
  ];
  const NESTED = [
    ['enchantmentTrader', 'Enchantments'],
    ['feyMerchant', 'Fey Bazaar'],
    ['devilishMerchant', 'Devilish Bargains'],
  ];
  const inventory = [];
  const shopTypes = [];
  for (const [varName, label] of MERCHANTS) {
    const tag = slugify(label);
    inventory.push(...evalEntries(extractArrayLiteral(sk, varName, 1), {}, `inventory-${tag}`).map((text) => ({ text, tags: [tag] })));
    shopTypes.push(`${label} — sample stock: {table:${S}/inventory#${tag}}; {table:${S}/inventory#${tag}}; {table:${S}/inventory#${tag}}`);
  }
  for (const [varName, label] of NESTED) {
    const tag = slugify(label);
    const nested = evalLoose(extractArrayLiteral(sk, varName, 1));
    inventory.push(...cleanStrings(nested[0], `inventory-${tag}`).map((text) => ({ text, tags: [tag] })));
    shopTypes.push(`${label} — sample stock: {table:${S}/inventory#${tag}}; {table:${S}/inventory#${tag}}; {table:${S}/inventory#${tag}}`);
  }
  writeTable({ id: `${S}/inventory`, title: 'Shop Inventories', entries: inventory });
  writeTable({ id: `${S}/shop`, title: 'The Shop', entries: shopTypes });
  writeTable({
    id: `${S}/keeper`,
    title: 'The Shopkeeper',
    entries: [
      `Personality: {table:${S}/keeper-personality} Ideal: {table:${S}/keeper-ideal} Bond: {table:${S}/keeper-bond} Flaw: {table:${S}/keeper-flaw}`,
    ],
  });
}

// ===========================================================================
console.log('NPC INTERACTIONS — cat, host, prophecy, omen, wisdom');
for (const [varName, slug, title] of [
  ['size', 'cat-size', 'Cat Sizes'],
  ['color', 'cat-color', 'Cat Colors'],
  ['eyes', 'cat-eyes', 'Cat Eyes'],
  ['bredTo', 'cat-purpose', 'What the Cat Was Bred For'],
  ['favFood', 'cat-food', 'Cat Favorite Foods'],
  ['markings', 'cat-markings', 'Cat Markings'],
  ['habits', 'cat-habits', 'Cat Habits'],
  ['talent', 'cat-talent', 'Cat Talents'],
  ['quirks', 'cat-quirks', 'Cat Quirks'],
  ['hostArray', 'host-intro', 'Hosts'],
  ['communicate', 'communicate', 'Ways of Communicating'],
  ['descriptor', 'descriptor', 'NPC Descriptors'],
  ['interaction', 'interaction', 'NPC Interactions'],
  ['voice', 'voice', 'Voices'],
  ['introductoryPhrase', 'prophecy-intro', 'Prophecy Openings'],
  ['beginning', 'prophecy-beginning', 'Prophecy Beginnings'],
  ['warningPhrase', 'prophecy-warning-phrase', 'Prophecy Warning Phrases'],
  ['proponents', 'prophecy-proponent', 'Prophecy Proponents'],
  ['signPhrase', 'prophecy-sign-phrase', 'Prophecy Sign Phrases'],
  ['sign', 'prophecy-sign', 'Prophecy Signs'],
  ['doomPhrase', 'prophecy-doom-phrase', 'Prophecy Doom Phrases'],
  ['doom', 'prophecy-doom', 'Prophecy Dooms'],
  ['aftermathPhrase', 'prophecy-aftermath-phrase', 'Prophecy Aftermath Phrases'],
  ['aftermath', 'prophecy-aftermath', 'Prophecy Aftermaths'],
  ['omens', 'omen-text', 'Omens'],
  ['attention', 'omen-attention', 'How They Get Your Attention'],
  ['freakArray', 'omen-freak-out', 'How They Freak Out'],
  ['wisdom', 'wisdom-quote', 'Wisdom from Strangers'],
]) {
  writeTable({ id: `${N}/${slug}`, title, entries: evalEntries(extractArrayLiteral(ni, varName, 1), {}, slug) });
}
{
  const plot = evalLoose(extractArrayLiteral(ni, 'hostPlotArray', 1));
  const HOST = ['host-role', 'host-location', 'host-attitude', 'host-relationship', 'host-assistance', 'host-twist'];
  const TITLES = ['Host Contact Roles', 'Host Contact Locations', 'Host Contact Attitudes', 'Host Relationships', 'Host Assistance', 'Host Twists'];
  plot.forEach((sub, i) => {
    writeTable({ id: `${N}/${HOST[i]}`, title: TITLES[i], entries: cleanStrings(sub, HOST[i]) });
  });
  const hostCore = `{table:${N}/host-intro} If you share your troubles, they know someone offering: {table:${N}/host-assistance}. That contact is currently {table:${N}/host-role}, {table:${N}/host-location}. Relationship to your host: {table:${N}/host-relationship}. Expect something like “{table:${N}/host-attitude}” when you reach out.`;
  writeTable({
    id: `${N}/host`,
    title: 'Host & Plot Hook',
    entries: [
      { text: hostCore, weight: 85 },
      { text: `${hostCore} Unfortunately: {table:${N}/host-twist}`, weight: 15 },
    ],
  });
}
writeTable({
  id: `${N}/prophecy`,
  title: 'Prophecy',
  entries: [
    `In a {table:${N}/voice}, they {table:${N}/communicate}: “{table:${N}/prophecy-intro} {table:${N}/prophecy-beginning} {table:${N}/prophecy-warning-phrase} {table:${N}/prophecy-proponent} {table:${N}/prophecy-sign-phrase} {table:${N}/prophecy-sign} {table:${N}/prophecy-doom-phrase} {table:${N}/prophecy-doom} {table:${N}/prophecy-aftermath-phrase} {table:${N}/prophecy-aftermath}”`,
  ],
});
writeTable({
  id: `${N}/omen`,
  title: 'Omen',
  entries: [
    `They {table:${N}/communicate}: “{table:${N}/omen-text}” {table:${N}/omen-attention} {table:${N}/omen-freak-out}`,
  ],
});
writeTable({
  id: `${N}/cat`,
  title: 'The Tavern Cat',
  entries: [
    `You see a {table:${N}/cat-size} cat with {table:${N}/cat-color} coloration, {table:${N}/cat-eyes} and {table:${N}/cat-markings}. It was bred to {table:${N}/cat-purpose}, enjoys {table:${N}/cat-food}, typically has {table:${N}/cat-habits}, and is especially talented at {table:${N}/cat-talent}. Rumor has it this cat {table:${N}/cat-quirks}.`,
  ],
});
writeTable({
  id: `${N}/encounter`,
  title: 'Meeting a Stranger',
  entries: [
    `You meet {table:${N}/descriptor}. {table:${N}/interaction}`,
    `{table:${N}/descriptor} approaches — {table:${N}/interaction}`,
  ],
});

console.log(`\nPhase 3 part 2 done. Tables: ${stats.tables}, dropped entries: ${stats.dropped}`);
