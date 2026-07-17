// Story webs v1.1: the epic campaign generator (PLAN.md §3.5, owner batches
// 3–4). A code-defined web (declarative plans arrive with webs v2) that mints
// a whole campaign as LINKED entities in one atomic batch.
//
// Campaign STRUCTURE and FLAVOR are separate dials, so no two runs share
// bones:
//   Skeletons — how threats are arranged over levels 1–20: a single nemesis;
//   a SUCCESSION (beat a faction in the first quarter, a second enemy owns
//   the mid-game, then a short high-powered questline at 15–20); or TWO
//   FRONTS pursued in alternating acts that converge in the finale.
//   Conflicts — what each threat IS: rising darkness, usurper, planar
//   breach, great hunt, demon invasion, civil war, world war, the wild
//   itself (avatar bosses), the death of magic, an extraplanar war fought
//   through our world. Each threat gets its own faction, goals, epithets.
//
// Overlap is deliberate: while one threat is being fought, hints of the
// next are already being planted in its acts.

import type { Block } from '../engine/types.ts';
import { newEntity, type EntityRecord, type WorldDoc } from '../engine/worldStore.ts';
import { blocksToEntity } from './adapters.ts';
import { rngFor, rolePath, STREAM, type Rng } from './seeds.ts';
import { REALM_TITLE } from './fantasyEarth.ts';

export type RunTool = (tool: string, seedPath: string, extra?: Record<string, string>) => Promise<{ metaId: string; blocks: Block[] } | null>;

interface Conflict {
  id: string;
  title: string;       // campaign title when this is the primary threat; {theme}
  factionName: string; // {theme}
  goal: string;
  overview: string;
  epithet: string;     // boss role flavor
  tags: string[];
}

const CONFLICTS: Conflict[] = [
  { id: 'rising-darkness', title: 'The {theme} Ascension', factionName: 'The {theme} Covenant', epithet: 'Steward of the Rite',
    goal: 'wake a power the world buried on purpose', tags: ['undead'],
    overview: 'Something old is being fed, and each of its stewards stands a rung higher than the last.' },
  { id: 'usurper', title: 'The {theme} Crown', factionName: 'Court of the {theme} Crown', epithet: 'Knife of the Court',
    goal: 'unmake the rightful order and seat their own upon it', tags: ['shady'],
    overview: 'A throne is being stolen one oath at a time, and the conspiracy runs further up than anyone dares say.' },
  { id: 'planar-breach', title: 'The {theme} Door', factionName: 'Keepers of the {theme} Door', epithet: 'Keeper of the Hinge',
    goal: 'pry open a way between worlds and hold it', tags: ['aberrant'],
    overview: 'The walls between worlds are thinnest where someone has been sanding them.' },
  { id: 'great-hunt', title: 'The {theme} Hunt', factionName: 'The {theme} Reliquary', epithet: 'Warden of the Relic',
    goal: 'gather the relics that together end an age', tags: ['shady'],
    overview: 'Five hands seek the same scattered things, and only one means to survive the gathering.' },
  { id: 'demon-invasion', title: 'The {theme} Incursion', factionName: 'Legion of the {theme} Gate', epithet: 'Herald of the Gate',
    goal: 'widen the gate until the host can walk through whole', tags: ['demonic'],
    overview: 'The first things through were small. The gate-wardens grow larger with every season the breach stands.' },
  { id: 'civil-war', title: 'The {theme} Schism', factionName: 'The {theme} Loyalists', epithet: 'General of the Schism',
    goal: 'win the realm by breaking it in half first', tags: ['martial'],
    overview: 'Two banners fly over one country, and every town must choose which neighbor to stop trusting.' },
  { id: 'world-war', title: 'The {theme} War', factionName: 'The {theme} Compact', epithet: 'Marshal of the Compact',
    goal: 'redraw every border in their own ink', tags: ['martial'],
    overview: 'This is no border feud: whole nations march, and the neutral ground shrinks by the week.' },
  { id: 'vs-nature', title: 'The {theme} Wild', factionName: 'The Wrath of the {theme} Wild', epithet: 'Avatar of the Wild',
    goal: 'take back everything that was ever cleared, paved, or named', tags: ['primal'],
    overview: 'There is no villain to argue with. The forest moved a mile last month, and the rivers have opinions now.' },
  { id: 'magic-death', title: 'The {theme} Silence', factionName: 'The {theme} Null Choir', epithet: 'Cantor of the Silence',
    goal: 'starve the world of magic until nothing wondrous is left', tags: ['aberrant'],
    overview: 'Spells gutter like candles in bad air. Wherever the silence has passed, even the healers\' hands are just hands.' },
  { id: 'extraplanar-war', title: 'The War of the {theme} Doors', factionName: 'The {theme} Vanguard', epithet: 'Door-Captain',
    goal: 'win a war between other worlds by using ours as the battlefield', tags: ['aberrant', 'martial'],
    overview: 'Two powers that do not live here are fighting here anyway, and both call it somebody else\'s ground.' },
];

interface ActSpec { threat: number; level: number; steps: number; finale?: boolean }
interface Skeleton {
  id: string;
  label: string;
  threats: number;
  acts: (rng: Rng) => ActSpec[];
}

const SKELETONS: Skeleton[] = [
  {
    id: 'single-nemesis', label: 'Single nemesis', threats: 1,
    acts: (rng) => {
      const n = 3 + Math.floor(rng() * 3);
      const ladder = { 3: [5, 11, 17], 4: [4, 9, 14, 20], 5: [4, 8, 12, 16, 20] }[n as 3 | 4 | 5]!;
      return ladder.map((level, i) => ({ threat: 0, level, steps: 2 + (rng() < 0.5 ? 1 : 0), finale: i === ladder.length - 1 }));
    },
  },
  {
    id: 'succession', label: 'Succession of threats', threats: 3,
    // beat threat A in the first quarter; threat B owns the mid-game;
    // a small, high-powered questline at 15–20 ends it
    acts: (rng) => [
      { threat: 0, level: 3, steps: 2 },
      { threat: 0, level: 5, steps: 3 },
      { threat: 1, level: 8 + Math.floor(rng() * 2), steps: 2 },
      { threat: 1, level: 12, steps: 3 },
      ...(rng() < 0.5 ? [{ threat: 1, level: 14, steps: 2 }] : []),
      { threat: 2, level: 17 + Math.floor(rng() * 3), steps: 2, finale: true },
    ],
  },
  {
    id: 'two-fronts', label: 'Two fronts', threats: 2,
    // overlapping enemies pursued in alternating acts; the finale converges
    acts: (rng) => [
      { threat: 0, level: 4, steps: 2 },
      { threat: 1, level: 6, steps: 2 },
      { threat: 0, level: 10, steps: 2 + (rng() < 0.5 ? 1 : 0) },
      { threat: 1, level: 13, steps: 2 },
      { threat: 0, level: 18, steps: 3, finale: true }, // both bosses stand here
    ],
  },
];

const THEMES = [
  { word: 'Hollow', tags: ['undead'] }, { word: 'Ashen', tags: ['demonic'] },
  { word: 'Drowned', tags: ['aberrant'] }, { word: 'Gilded', tags: ['shady'] },
  { word: 'Wyrmforged', tags: ['draconic'] }, { word: 'Starless', tags: ['aberrant'] },
  { word: 'Thorned', tags: ['primal'] }, { word: 'Sundered', tags: ['martial'] },
];

const REGION_NAMES = [
  'The Sunder Wastes', 'The Bleakmoor Reaches', 'The Verdant Shelf', 'The Saltmarch',
  'The Howling Steppe', 'The Emberfell Heights', 'The Mistwood Deeps', 'The Iron Fens',
];
const PLANE_NAMES = ['The Ashen Veil', 'The Sunless Tide', 'The Court of Glass', 'The Grey Meridian'];

const HINTS = [
  'A half-burned letter, sewn into a courier\'s coat, names {boss} — and begs its reader to stop counting the days.',
  'A dying foe smiles and says the name {boss} like a debt already paid.',
  'Ledgers in a ruined tollhouse show tribute flowing, month after month, toward {place}.',
  'A child\'s rhyme in the market has a new verse. It rhymes with {boss}, and no one taught it to them.',
  'Carrion birds fly a straight line at dusk, every dusk, toward {place}.',
  'A captured blade bears a maker\'s mark last forged for {boss}.',
];

const QUEST_VERBS = [
  ['Rumors of', 'Trace the trail of'],
  ['Break the grip of', 'Sever the supply to'],
  ['Storm', 'Bring down'],
];

const ROMAN = ['I', 'II', 'III'];

function pick<T>(rng: Rng, arr: T[]): T { return arr[Math.floor(rng() * arr.length)]!; }
function pickDistinct<T>(rng: Rng, arr: T[], n: number): T[] {
  const bag = [...arr];
  const out: T[] = [];
  while (out.length < n && bag.length) out.push(bag.splice(Math.floor(rng() * bag.length), 1)[0]!);
  return out;
}
function mention(e: EntityRecord): string { return `{@e ${e.id}|${e.name}}`; }
// DESIGN NOTE (§10.8 review): web builders are LIVE user actions — like
// hand-creating a page — so their stamps and block ids are deliberately
// random, the same way world.astro's `adhoc:${rid()}` rolls are. They are
// NOT part of the reproducible-generation contract: no regen path rebuilds a
// para() body from its seed (toolOfGen is null for `web:*` generators), so
// the adapters-style override-orphan bug cannot occur here. If webs ever
// join the bake or gain a regen path, these must switch to seed-derived ids
// (adapters.blockId) FIRST.
function para(text: string): { type: string; id: string; text: string } {
  return { type: 'paragraph', id: 'b_' + Math.random().toString(36).slice(2, 10), text };
}

export interface EpicResult { rootId: string; created: number; acts: number; skeleton: string }

export async function buildEpicCampaign(world: WorldDoc, run: RunTool): Promise<EpicResult | null> {
  const stamp = Math.random().toString(36).slice(2, 8);
  const basePath = `${world.seed}/epic:${stamp}`;
  const rng = rngFor(basePath, STREAM.PLACE);

  const skeleton = pick(rng, SKELETONS);
  const conflicts = pickDistinct(rng, CONFLICTS, skeleton.threats);
  const themes = pickDistinct(rng, THEMES, skeleton.threats);
  const acts = skeleton.acts(rng);
  const planarFinale = rng() < 0.45;
  const title = conflicts[0]!.title.replace('{theme}', themes[0]!.word);

  const batch: Record<string, EntityRecord> = {};
  const add = (e: EntityRecord): EntityRecord => { batch[e.id] = e; return e; };

  const root = add(newEntity('quest', title));
  root.tags = ['campaign', 'epic'];
  root.fields = { structure: skeleton.label, reward: 'A world that remembers who stood up.' };
  root.gen = { generator: 'web:epic-campaign', seed: basePath, genVersion: 1, plan: `web:${skeleton.id}`, overrides: [] };

  // one faction per threat
  const factions = conflicts.map((c, t) => {
    const f = add(newEntity('faction', c.factionName.replace('{theme}', themes[t]!.word)));
    f.tags = [...c.tags, ...themes[t]!.tags];
    f.fields = { goal: `To ${c.goal}.` };
    f.gen = { generator: 'web:epic-campaign', seed: rolePath(world.seed, root.id, `threat${t}Faction`), genVersion: 1, plan: `web:${conflicts[t]!.id}`, role: `threat${t}Faction`, overrides: [] };
    return f;
  });

  // regions: reuse the world's existing top-level regions first, then mint;
  // a planar finale mints its own otherworld region
  const existing = Object.values(world.entities).filter((e) => e.kind === 'region' && !e.deleted && !e.parentId);
  const nameBag = [...REGION_NAMES];
  const regions: EntityRecord[] = acts.map((a, i) => {
    if (a.finale && planarFinale) {
      const plane = add(newEntity('region', pick(rng, PLANE_NAMES)));
      plane.tags = ['otherplane', ...conflicts[a.threat]!.tags];
      plane.fields = { peril: 'This is not a place in the world. Travel here is a story in itself.' };
      return plane;
    }
    if (existing.length) return existing.shift()!;
    const idx = Math.floor(rng() * nameBag.length);
    return add(newEntity('region', nameBag.splice(idx, 1)[0] ?? `The Far Marches ${i + 1}`));
  });

  const bosses: EntityRecord[] = [];
  const actFirstQuests: EntityRecord[] = [];
  let prevQuest: EntityRecord | null = null;
  for (const [i, act] of acts.entries()) {
    const conflict = conflicts[act.threat]!;
    const faction = factions[act.threat]!;
    const region = regions[i]!;
    const roleBase = `act${i + 1}`;
    const threatFinale = act.finale || acts[i + 1]?.threat !== act.threat; // last act of this threat

    const bossRun = await run('npc-block', rolePath(world.seed, root.id, `${roleBase}Boss`));
    if (!bossRun) return null;
    const boss = add(blocksToEntity(bossRun.metaId, rolePath(world.seed, root.id, `${roleBase}Boss`), bossRun.blocks, 'Boss', region.id));
    boss.kind = 'person';
    boss.tags = [...conflict.tags, 'boss', 'antagonist'];
    boss.fields = { ...boss.fields, checkpoint: `Act ${i + 1} boss — level ${act.level} checkpoint`, vocation: conflict.epithet };
    boss.relations = [{ type: 'memberOf', target: faction.id }];
    if (threatFinale) faction.fields = { ...faction.fields, leader: { ref: boss.id } };
    bosses.push(boss);

    const lairRun = await run('landmark', rolePath(world.seed, root.id, `${roleBase}Lair`));
    if (!lairRun) return null;
    const lair = add(blocksToEntity(lairRun.metaId, rolePath(world.seed, root.id, `${roleBase}Lair`), lairRun.blocks, 'Stronghold', region.id));
    lair.kind = 'landmark';
    lair.tags = [...conflict.tags, 'dungeon'];
    lair.relations = [{ type: 'heldBy', target: boss.id }];

    let firstOfAct: EntityRecord | null = null;
    for (let s = 0; s < act.steps; s++) {
      const verb = QUEST_VERBS[Math.min(s, QUEST_VERBS.length - 1)]![rng() < 0.5 ? 0 : 1]!;
      const target = s === act.steps - 1 ? lair : boss;
      const q = add(newEntity('quest', `${verb} ${target.name}`, region.id));
      q.tags = ['epic', `act-${i + 1}`, ...conflict.tags];
      q.fields = {
        levels: `Levels ${Math.max(1, act.level - 3)}–${act.level}`,
        reward: s === act.steps - 1 ? 'An act-turning revelation, and the road to what comes next.' : 'A thread worth pulling.',
      };
      q.relations = [{ type: 'antagonist', target: boss.id }];
      q.body = [para(
        s === act.steps - 1
          ? `The act ends at ${mention(lair)}: face ${mention(boss)} before ${mention(faction)} finishes what it started here.`
          : `${mention(faction)} has hands in ${mention(region)}. Follow them toward ${mention(boss)} — but quietly.`,
      )] as EntityRecord['body'];
      q.gen = { generator: 'web:epic-campaign', seed: rolePath(world.seed, root.id, `${roleBase}Quest${s}`), genVersion: 1, plan: `web:${conflict.id}`, role: `${roleBase}Quest${s}`, overrides: [] };
      if (prevQuest) prevQuest.relations = [...(prevQuest.relations ?? []), { type: 'leadsTo', target: q.id }];
      prevQuest = q;
      if (!firstOfAct) firstOfAct = q;
    }
    actFirstQuests.push(firstOfAct!);

    // two-fronts convergence: the OTHER threat's leader also stands in the finale
    if (act.finale && skeleton.id === 'two-fronts') {
      const other = bosses.filter((b) => !b.deleted).find((b) => b.relations?.[0]?.target === factions[1]!.id && b !== boss);
      if (other) {
        boss.relations = [...(boss.relations ?? []), { type: 'allyOf', target: other.id }];
        prevQuest!.body = [...(prevQuest!.body ?? []), para(`Both fronts end here: ${mention(other)} has answered the call as well.`)] as EntityRecord['body'];
      }
    }

    // overlap: plant a hint for THIS act in the PREVIOUS act's region — across
    // threats too, so the next enemy bleeds into the current fight
    if (i > 0) {
      const hint = add(newEntity('note', `Hint: whispers of ${boss.name}`, regions[i - 1]!.id));
      hint.tags = ['hint', 'epic'];
      const crossThreat = acts[i - 1]!.threat !== act.threat;
      const text = pick(rng, HINTS).replace('{boss}', mention(boss)).replace('{place}', mention(lair));
      hint.body = [para(crossThreat ? `${text} Whatever this is, it is not the enemy you are fighting now.` : text)] as EntityRecord['body'];
    }
  }

  // the campaign root lays out the phases
  const phaseLines: ReturnType<typeof para>[] = [];
  conflicts.forEach((c, t) => {
    const tActs = acts.map((a, i) => ({ a, i })).filter((x) => x.a.threat === t);
    const lo = Math.max(1, tActs[0]!.a.level - 3);
    const hi = tActs[tActs.length - 1]!.a.level;
    phaseLines.push(para(
      `Phase ${ROMAN[t]} (levels ${lo}–${hi}) — ${c.overview} The enemy: ${mention(factions[t]!)}, sworn to ${c.goal}.`,
    ));
  });
  root.body = [
    para(`Structure: ${skeleton.label}.`),
    ...phaseLines,
    ...acts.map((a, i) =>
      para(`Act ${i + 1} — ${mention(regions[i]!)} (level ${a.level} checkpoint): begins with ${mention(actFirstQuests[i]!)}, ends before ${mention(bosses[i]!)}.`)),
    para(planarFinale ? 'The final act does not take place in this world.' : 'The final act is fought on home soil.'),
  ] as EntityRecord['body'];

  Object.assign(world.entities, batch); // atomic mint (CONTRACTS §6)
  return { rootId: root.id, created: Object.keys(batch).length, acts: acts.length, skeleton: skeleton.id };
}

// ---------- small webs: side-quest chains + local life (PLAN §3.5) ----------
// Chains are the common, LOCAL story unit: 2–4 quests sharing a small cast
// in one place (rarely spanning a second region). Life webs mint non-quest
// texture — rival shops, a family, a feud — purely for inhabitedness, and
// chains REUSE those people as patrons, which is what threads the fabric.

const TROUBLES = [
  { what: 'a smuggling ring', epithet: 'Quartermaster of the ring' },
  { what: 'the disappearances', epithet: 'Keeper of the taken' },
  { what: 'the beast on the road', epithet: 'The beast\'s handler' },
  { what: 'an extortion racket', epithet: 'Collector of the debt' },
  { what: 'the poisoned wells', epithet: 'Hand behind the sickness' },
  { what: 'grave-robbing by night', epithet: 'Broker of the dead' },
];

function descendantsOf(world: WorldDoc, rootId: string): EntityRecord[] {
  // One parent→children index, then walk it: the old shape re-scanned EVERY
  // entity once per visited node — O(descendants × total), millions of
  // iterations per click on an Earth-sized world (§10.10 review).
  const kids = new Map<string, EntityRecord[]>();
  for (const e of Object.values(world.entities)) {
    if (e.deleted || !e.parentId) continue;
    const at = kids.get(e.parentId);
    if (at) at.push(e); else kids.set(e.parentId, [e]);
  }
  const out: EntityRecord[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    for (const e of kids.get(id) ?? []) {
      if (seen.has(e.id)) continue; // a parentId cycle must not hang the walk
      seen.add(e.id);
      out.push(e);
      walk(e.id);
    }
  };
  walk(rootId);
  return out;
}

export interface SmallWebResult { rootId: string; created: number; reusedPatron: boolean; wide: boolean }

/** A local side-quest chain anchored to a region or settlement. */
export async function buildQuestChain(world: WorldDoc, run: RunTool, anchor: EntityRecord): Promise<SmallWebResult | null> {
  const stamp = Math.random().toString(36).slice(2, 8);
  const rng = rngFor(`${world.seed}/chain:${stamp}`, STREAM.PLACE);
  const trouble = pick(rng, TROUBLES);
  const len = 2 + Math.floor(rng() * 3); // 2–4 quests
  const wide = rng() < 0.15;             // rare: the chain reaches a second region

  const batch: Record<string, EntityRecord> = {};
  const add = (e: EntityRecord): EntityRecord => { batch[e.id] = e; return e; };

  const chainRootPath = (role: string) => rolePath(world.seed, anchor.id, `${stamp}${role}`);

  const villainRun = await run('npc-block', chainRootPath('Villain'));
  if (!villainRun) return null;
  const villain = add(blocksToEntity(villainRun.metaId, chainRootPath('Villain'), villainRun.blocks, 'Villain', anchor.id));
  villain.kind = 'person';
  villain.tags = ['antagonist'];
  villain.fields = { ...villain.fields, vocation: trouble.epithet };

  // the lair: usually local; rarely in another top-level region (span!)
  const otherRegion = wide
    ? Object.values(world.entities).find((e) => e.kind === 'region' && !e.deleted && !e.parentId && e.id !== anchor.id)
    : undefined;
  const lairRun = await run('landmark', chainRootPath('Lair'));
  if (!lairRun) return null;
  const lair = add(blocksToEntity(lairRun.metaId, chainRootPath('Lair'), lairRun.blocks, 'Hideout', (otherRegion ?? anchor).id));
  lair.kind = 'landmark';
  lair.relations = [{ type: 'heldBy', target: villain.id }];

  // patron: REUSE a local person when one exists (the interconnection dial)
  const locals = descendantsOf(world, anchor.id).filter((e) => e.kind === 'person' && !(e.tags ?? []).includes('antagonist'));
  let patron = locals.length ? locals[Math.floor(rng() * locals.length)]! : null;
  const reusedPatron = !!patron;
  if (!patron) {
    const pRun = await run('npc-block', chainRootPath('Patron'));
    if (!pRun) return null;
    patron = add(blocksToEntity(pRun.metaId, chainRootPath('Patron'), pRun.blocks, 'Patron', anchor.id));
    patron.kind = 'person';
  }

  let prev: EntityRecord | null = null;
  let first: EntityRecord | null = null;
  for (let s = 0; s < len; s++) {
    const last = s === len - 1;
    const q = add(newEntity('quest',
      s === 0 ? `Trouble in ${anchor.name}` : last ? `End ${trouble.what}` : `The trail of ${trouble.what}`,
      anchor.id));
    q.tags = ['side-chain'];
    q.fields = { patron: { ref: patron.id }, reward: last ? 'The gratitude of ' + anchor.name + ', and quiet roads.' : 'A lead worth following.' };
    q.relations = [{ type: 'antagonist', target: villain.id }];
    q.body = [para(
      s === 0
        ? `${mention(patron)} quietly asks for help with ${trouble.what}. Someone local is behind it.`
        : last
          ? `It ends at ${mention(lair)}${otherRegion ? ` — beyond ${anchor.name}'s borders` : ''}: ${mention(villain)} answers for ${trouble.what}.`
          : `The threads of ${trouble.what} tighten toward ${mention(villain)}.`,
    )] as EntityRecord['body'];
    q.gen = { generator: 'web:quest-chain', seed: chainRootPath(`Quest${s}`), genVersion: 1, plan: 'web:quest-chain', role: `quest${s}`, overrides: [] };
    if (prev) prev.relations = [...(prev.relations ?? []), { type: 'leadsTo', target: q.id }];
    prev = q;
    if (!first) first = q;
  }

  Object.assign(world.entities, batch);
  return { rootId: first!.id, created: Object.keys(batch).length, reusedPatron, wide: !!otherRegion };
}

/** Local life: rival shops with keepers, a family, and a feud — no quest attached. */
export async function buildLifeWeb(world: WorldDoc, run: RunTool, settlement: EntityRecord): Promise<SmallWebResult | null> {
  const stamp = Math.random().toString(36).slice(2, 8);
  const rng = rngFor(`${world.seed}/life:${stamp}`, STREAM.PLACE);
  const batch: Record<string, EntityRecord> = {};
  const add = (e: EntityRecord): EntityRecord => { batch[e.id] = e; return e; };
  const path = (role: string) => rolePath(world.seed, settlement.id, `${stamp}${role}`);

  const shops: EntityRecord[] = [];
  const keepers: EntityRecord[] = [];
  for (let i = 0; i < 2; i++) {
    const sRun = await run('shop-page', path(`Shop${i}`));
    if (!sRun) return null;
    const shop = add(blocksToEntity(sRun.metaId, path(`Shop${i}`), sRun.blocks, 'Shop', settlement.id));
    shop.kind = 'building';
    const kRun = await run('npc-block', path(`Keeper${i}`));
    if (!kRun) return null;
    const keeper = add(blocksToEntity(kRun.metaId, path(`Keeper${i}`), kRun.blocks, 'Keeper', shop.id));
    keeper.kind = 'person';
    keeper.relations = [{ type: 'worksAt', target: shop.id }];
    shop.fields = { ...shop.fields, keeper: { ref: keeper.id } };
    shops.push(shop); keepers.push(keeper);
  }
  keepers[0]!.relations!.push({ type: 'rivalOf', target: keepers[1]!.id });
  keepers[1]!.relations!.push({ type: 'rivalOf', target: keepers[0]!.id });

  const kin: EntityRecord[] = [];
  for (let i = 0; i < 2; i++) {
    const fRun = await run('npc-block', path(`Kin${i}`));
    if (!fRun) return null;
    const p = add(blocksToEntity(fRun.metaId, path(`Kin${i}`), fRun.blocks, 'Local', settlement.id));
    p.kind = 'person';
    kin.push(p);
  }
  kin[0]!.relations = [{ type: 'kinOf', target: kin[1]!.id }];
  kin[1]!.relations = [{ type: 'kinOf', target: kin[0]!.id }];

  const feud = add(newEntity('note', `The feud on the square`, settlement.id));
  feud.tags = ['life', 'rumor'];
  feud.body = [para(
    `${mention(shops[0]!)} and ${mention(shops[1]!)} have not shared a civil word in years. ` +
    `${mention(keepers[0]!)} and ${mention(keepers[1]!)} each swear the other started it; ` +
    `${mention(kin[0]!)} and ${mention(kin[1]!)} take different sides at every family supper.`,
  )] as EntityRecord['body'];

  Object.assign(world.entities, batch);
  return { rootId: feud.id, created: Object.keys(batch).length, reusedPatron: false, wide: false };
}

// ---------- a whole kingdom, savable to the world (owner) ----------
// Roll a realm and its supporting web from the standalone tables and drop it
// into the active world as linked entities — the "rolling a kingdom should be
// savable, with the web behind it rolled from the standalone tables" ask. A
// realm region + the crown (faction) + a ruler + the capital that names it +
// towns and villages that inherit the realm's law + a couple of landmarks.
export interface KingdomResult { rootId: string; created: number; capital: string; realm: string }

const REALM_STYLES: Array<(n: string) => string> = [
  // one realm-title vocabulary, shared with the Earth fantasyfier — a private
  // list here had already drifted from it (§10.10 review)
  ...REALM_TITLE.map((t) => (n: string) => `${t} ${n}`),
];

/** Government the caller has already rolled from gm/government (world.astro holds
 *  the registry). name is the short style; brief/detail are the writeup. */
export interface RealmGov { name: string; brief: string; detail: string }

export async function buildKingdom(
  world: WorldDoc, run: RunTool, opts: { gov: RealmGov; parentId?: string },
): Promise<KingdomResult | null> {
  const stamp = Math.random().toString(36).slice(2, 8);
  const rng = rngFor(`${world.seed}/kingdom:${stamp}`, STREAM.PLACE);
  const gov = opts.gov;
  const batch: Record<string, EntityRecord> = {};
  const add = (e: EntityRecord): EntityRecord => { batch[e.id] = e; return e; };
  const path = (role: string): string => `${world.seed}/kingdom:${stamp}/${role}`;
  const lawText = gov.brief + (gov.detail ? ' ' + gov.detail : '');

  // the CAPITAL is rolled first — it names the realm, and its royal-seat type
  // locks a capital-scale economy/trade (batch 76). It carries the realm's law.
  const capRun = await run('settlement', path('Capital'), { size: 'city', type: 'royal seat', government: gov.name });
  if (!capRun) return null;
  const capital = add(blocksToEntity(capRun.metaId, path('Capital'), capRun.blocks, 'Capital', undefined));
  capital.kind = 'settlement';
  const capName = capital.name.split(/[,—]/)[0]!.trim();

  // the realm region (top level, or under a chosen parent continent/region)
  const realmName = pick(rng, REALM_STYLES)(capName);
  const realm = add(newEntity('region', realmName, opts.parentId));
  realm.tags = ['kingdom-lands'];
  capital.parentId = realm.id;
  capital.tags = ['city', 'capital'];

  // the crown (faction) and the ruler on the throne
  const faction = add(newEntity('faction', realmName, realm.id));
  faction.tags = ['kingdom'];
  const rRun = await run('npc-block', path('Ruler'));
  if (!rRun) return null;
  const ruler = add(blocksToEntity(rRun.metaId, path('Ruler'), rRun.blocks, 'Ruler', capital.id));
  ruler.kind = 'person';
  ruler.tags = ['ruler'];

  realm.fields = { government: gov.name, ruler: { ref: ruler.id }, seat: { ref: capital.id } };
  faction.fields = { government: gov.name, leader: { ref: ruler.id }, seat: { ref: capital.id }, goal: `Hold ${capName} and the lands around it together.` };
  realm.body = [
    para(`The lands of ${mention(faction)}, ruled from ${mention(capital)} by ${mention(ruler)}.`),
    { ...para(lawText), label: 'The Law' } as NonNullable<EntityRecord['body']>[number],
  ] as EntityRecord['body'];
  faction.body = [
    para(`${realmName} — the crown seated at ${mention(capital)}, worn by ${mention(ruler)}.`),
    { ...para(lawText), label: 'The Law' } as NonNullable<EntityRecord['body']>[number],
  ] as EntityRecord['body'];

  // the country under the crown: towns, then villages, each inheriting the
  // realm's law (the settlement composite keeps the realm government instead of
  // rolling its own), and a couple of landmarks to give the map bones.
  const nTowns = 2 + Math.floor(rng() * 3);   // 2–4
  for (let i = 0; i < nTowns; i++) {
    const tRun = await run('settlement', path(`Town${i}`), { size: 'town', government: gov.name });
    if (!tRun) continue;
    const t = add(blocksToEntity(tRun.metaId, path(`Town${i}`), tRun.blocks, 'Town', realm.id));
    t.kind = 'settlement';
    t.tags = ['town'];
  }
  const nVill = 3 + Math.floor(rng() * 3);     // 3–5
  for (let i = 0; i < nVill; i++) {
    const vRun = await run('settlement', path(`Village${i}`), { size: 'village', government: gov.name });
    if (!vRun) continue;
    const v = add(blocksToEntity(vRun.metaId, path(`Village${i}`), vRun.blocks, 'Village', realm.id));
    v.kind = 'settlement';
    v.tags = ['village'];
  }
  for (let i = 0; i < 2; i++) {
    const lRun = await run('landmark', path(`Landmark${i}`));
    if (!lRun) continue;
    const l = add(blocksToEntity(lRun.metaId, path(`Landmark${i}`), lRun.blocks, 'Landmark', realm.id));
    l.kind = 'landmark';
  }

  Object.assign(world.entities, batch);
  return { rootId: realm.id, created: Object.keys(batch).length, capital: capName, realm: realmName };
}

// ---------- kin webs (owner, batch 15): every person has people ----------
// One to two generations UP (parents, often a grandparent — some already
// gone), siblings, a friend or two, and an enemy — REUSING the available
// cast wherever it can (a sibling who is already the rival shopkeeper is
// worth ten minted strangers). Not exhaustive genealogy: enough that no
// one stands alone.
export interface KinWebResult { rootId: string; created: number; reused: number }

export async function buildKinWeb(world: WorldDoc, run: RunTool, person: EntityRecord): Promise<KinWebResult | null> {
  const stamp = Math.random().toString(36).slice(2, 8);
  const rng = rngFor(`${world.seed}/kin:${stamp}`, STREAM.PLACE);
  const batch: Record<string, EntityRecord> = {};
  let minted = 0;
  const add = (e: EntityRecord): EntityRecord => { batch[e.id] = e; minted++; return e; };
  const path = (role: string) => rolePath(world.seed, person.id, `${stamp}${role}`);
  const rel = (a: EntityRecord, b: EntityRecord, t: string, t2 = t): void => {
    (a.relations ??= []).push({ type: t, target: b.id });
    (b.relations ??= []).push({ type: t2, target: a.id });
    // EVERY mutated entity rides the batch — `person` and pool-reused kin are
    // pre-existing, and a caller that snapshots/clones instead of holding live
    // references would silently lose their new relations (§10.10 review)
    batch[a.id] ??= a;
    batch[b.id] ??= b;
  };
  let reused = 0;
  const already = new Set((person.relations ?? []).map((r) => r.target));
  const pool = Object.values(world.entities).filter((e) =>
    e.kind === 'person' && !e.deleted && e.id !== person.id &&
    !already.has(e.id) && !(e.tags ?? []).includes('deceased'));
  const takeFromPool = (prefer?: (e: EntityRecord) => boolean): EntityRecord | null => {
    const ranked = prefer ? [...pool.filter(prefer), ...pool.filter((e) => !prefer(e))] : pool;
    const pick = ranked[Math.floor(rng() * Math.min(4, ranked.length))] ?? null;
    if (pick) { pool.splice(pool.indexOf(pick), 1); reused++; }
    return pick;
  };
  const surname = person.name.trim().split(/\s+/).length > 1 ? person.name.trim().split(/\s+/).pop()! : '';
  const familyName = (p: EntityRecord): void => {
    if (surname.length > 2 && rng() < 0.8) p.name = `${p.name.trim().split(/\s+/)[0]} ${surname}`;
  };
  const mint = async (role: string, label: string): Promise<EntityRecord | null> => {
    const r = await run('npc-block', path(role));
    if (!r) return null;
    const p = add(blocksToEntity(r.metaId, path(role), r.blocks, label, person.parentId ?? person.id));
    p.kind = 'person';
    return p;
  };

  // the generation up — and often the one above that
  const father = await mint('Father', 'Parent');
  const mother = await mint('Mother', 'Parent');
  if (!father || !mother) return null;
  familyName(father);
  rel(person, father, 'childOf', 'parentOf');
  rel(person, mother, 'childOf', 'parentOf');
  rel(father, mother, 'marriedTo');
  if (rng() < 0.35) father.tags = [...(father.tags ?? []), 'deceased'];
  let grand: EntityRecord | null = null;
  if (rng() < 0.75) {
    grand = await mint('Grandparent', 'Grandparent');
    if (grand) {
      familyName(grand);
      rel(father, grand, 'childOf', 'parentOf');
      if (rng() < 0.6) grand.tags = [...(grand.tags ?? []), 'deceased'];
    }
  }

  // siblings: sometimes a person who ALREADY exists turns out to be family
  const siblings: EntityRecord[] = [];
  const sibCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < sibCount; i++) {
    if (pool.length && rng() < 0.35) {
      const sib = takeFromPool();
      if (sib) { rel(person, sib, 'siblingOf'); siblings.push(sib); continue; }
    }
    const sib = await mint(`Sibling${i}`, 'Sibling');
    if (!sib) continue;
    familyName(sib);
    rel(person, sib, 'siblingOf');
    rel(sib, father, 'childOf', 'parentOf');
    rel(sib, mother, 'childOf', 'parentOf');
    siblings.push(sib);
  }

  // friends and one enemy — the available web first, strangers last
  const friends: EntityRecord[] = [];
  const friendCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < friendCount; i++) {
    const f = takeFromPool() ?? await mint(`Friend${i}`, 'Friend');
    if (!f) continue;
    rel(person, f, 'friendOf');
    friends.push(f);
  }
  const enemy = takeFromPool((e) => (e.tags ?? []).includes('antagonist')) ?? await mint('Enemy', 'Enemy');
  if (enemy) rel(person, enemy, 'enemyOf');

  // the family page — the tree written down, everyone linked
  const note = add(newEntity('note', `${person.name} — kith and kin`, person.id));
  note.tags = ['kin'];
  const gone = (p: EntityRecord) => ((p.tags ?? []).includes('deceased') ? ' (gone now)' : '');
  note.body = [para(
    `${mention(person)} is the child of ${mention(father)}${gone(father)} and ${mention(mother)}${gone(mother)}` +
    (grand ? `; ${mention(grand)}${gone(grand)} raised ${father.name} before them` : '') + '. ' +
    (siblings.length ? `${siblings.map(mention).join(' and ')} ${siblings.length > 1 ? 'are' : 'is'} their blood. ` : '') +
    (friends.length ? `${friends.map(mention).join(' and ')} would answer a midnight knock. ` : '') +
    (enemy ? `And ${mention(enemy)} would not grieve to hear their name read from a stone.` : ''),
  )] as EntityRecord['body'];

  Object.assign(world.entities, batch);
  return { rootId: note.id, created: minted, reused };
}
