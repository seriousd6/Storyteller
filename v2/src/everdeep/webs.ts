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

export type RunTool = (tool: string, seedPath: string) => Promise<{ metaId: string; blocks: Block[] } | null>;

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
