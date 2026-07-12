// Story webs v1: the epic campaign generator (PLAN.md §3.5, owner batch 3).
// A code-defined web (the declarative plan format arrives with webs v2) that
// mints a whole campaign arc as LINKED entities in one atomic batch:
// variable archetype + act count, one region claimed per act (the finale
// sometimes on another plane), a boss at a level checkpoint per act, a
// stronghold, foreshadowing hints planted an act early, an antagonist
// faction, and a multi-step quest chain threading act to act.
//
// Seeds are canonical role paths under the campaign root (CONTRACTS §1), so
// provenance is real; entity ids come from the store's usual generator.

import type { Block } from '../engine/types.ts';
import { newEntity, type EntityRecord, type WorldDoc } from '../engine/worldStore.ts';
import { blocksToEntity } from './adapters.ts';
import { rngFor, rolePath, STREAM, type Rng } from './seeds.ts';

export type RunTool = (tool: string, seedPath: string) => Promise<{ metaId: string; blocks: Block[] } | null>;

interface Archetype {
  id: string;
  title: string; // {theme} slot
  goal: string;
  factionName: string;
  overview: string;
}

const ARCHETYPES: Archetype[] = [
  {
    id: 'rising-darkness',
    title: 'The {theme} Ascension',
    goal: 'wake a power the world buried on purpose',
    factionName: 'The {theme} Covenant',
    overview: 'Something old is being fed. Each offering is larger than the last, and each of its stewards stands a rung higher than the one before.',
  },
  {
    id: 'usurper',
    title: 'The {theme} Crown',
    goal: 'unmake the rightful order and seat their own upon it',
    factionName: 'Court of the {theme} Crown',
    overview: 'A throne is being stolen one oath at a time. The conspiracy has patient hands, and its reach runs further up than anyone dares say aloud.',
  },
  {
    id: 'planar-breach',
    title: 'The {theme} Door',
    goal: 'pry open a way between worlds and hold it',
    factionName: 'Keepers of the {theme} Door',
    overview: 'The walls between worlds are thinnest where someone has been sanding them. Every hinge they finish needs a keeper — and the keepers are getting stronger.',
  },
  {
    id: 'great-hunt',
    title: 'The {theme} Hunt',
    goal: 'gather the relics that together end an age',
    factionName: 'The {theme} Reliquary',
    overview: 'Five hands seek the same scattered things, and only one hand means to survive the gathering. The trail of each relic is guarded by someone worse.',
  },
];

const THEMES = [
  { word: 'Hollow', tags: ['undead'] },
  { word: 'Ashen', tags: ['demonic'] },
  { word: 'Drowned', tags: ['aberrant'] },
  { word: 'Gilded', tags: ['shady'] },
  { word: 'Wyrmforged', tags: ['draconic'] },
  { word: 'Starless', tags: ['aberrant'] },
];

const REGION_NAMES = [
  'The Sunder Wastes', 'The Bleakmoor Reaches', 'The Verdant Shelf', 'The Saltmarch',
  'The Howling Steppe', 'The Emberfell Heights', 'The Mistwood Deeps', 'The Iron Fens',
];
const PLANE_NAMES = ['The Ashen Veil', 'The Sunless Tide', 'The Court of Glass', 'The Grey Meridian'];

const HINTS = [
  'A half-burned letter, sewn into a courier\'s coat, names {boss} — and begs its reader to stop counting the days.',
  'A dying cultist smiles and says the name {boss} like a debt already paid.',
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

function pick<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}
function mention(e: EntityRecord): string {
  return `{@e ${e.id}|${e.name}}`;
}
function para(text: string): { type: string; id: string; text: string } {
  return { type: 'paragraph', id: 'b_' + Math.random().toString(36).slice(2, 10), text };
}

export interface EpicResult {
  rootId: string;
  created: number;
  acts: number;
  planarFinale: boolean;
}

export async function buildEpicCampaign(world: WorldDoc, run: RunTool): Promise<EpicResult | null> {
  const stamp = Math.random().toString(36).slice(2, 8);
  const basePath = `${world.seed}/epic:${stamp}`;
  const rng = rngFor(basePath, STREAM.PLACE);

  const arch = pick(rng, ARCHETYPES);
  const theme = pick(rng, THEMES);
  const actCount = 3 + Math.floor(rng() * 3); // 3–5 acts
  const planarFinale = rng() < 0.45;
  const checkpoints = { 3: [5, 11, 17], 4: [4, 9, 14, 20], 5: [4, 8, 12, 16, 20] }[actCount as 3 | 4 | 5]!;
  const title = arch.title.replace('{theme}', theme.word);

  const batch: Record<string, EntityRecord> = {};
  const add = (e: EntityRecord): EntityRecord => { batch[e.id] = e; return e; };

  // campaign root + antagonist faction
  const root = add(newEntity('quest', title));
  root.tags = ['campaign', 'epic', ...theme.tags];
  root.gen = { generator: 'web:epic-campaign', seed: basePath, genVersion: 1, plan: `web:${arch.id}`, overrides: [] };
  const faction = add(newEntity('faction', arch.factionName.replace('{theme}', theme.word)));
  faction.tags = [...theme.tags];
  faction.fields = { goal: `To ${arch.goal}.` };
  faction.gen = { generator: 'web:epic-campaign', seed: rolePath(world.seed, root.id, 'faction'), genVersion: 1, plan: `web:${arch.id}`, role: 'faction', overrides: [] };

  // regions: reuse the world's existing top-level regions first (interconnection),
  // then mint what's missing; a planar finale always mints its own plane-region
  const existing = Object.values(world.entities).filter((e) => e.kind === 'region' && !e.deleted && !e.parentId);
  const regions: EntityRecord[] = [];
  const nameBag = [...REGION_NAMES];
  for (let i = 0; i < actCount; i++) {
    const finale = i === actCount - 1;
    if (finale && planarFinale) {
      const plane = add(newEntity('region', pick(rng, PLANE_NAMES)));
      plane.tags = ['otherplane', ...theme.tags];
      plane.fields = { peril: 'This is not a place in the world. Travel here is a story in itself.' };
      regions.push(plane);
    } else if (existing.length) {
      regions.push(existing.shift()!);
    } else {
      const idx = Math.floor(rng() * nameBag.length);
      regions.push(add(newEntity('region', nameBag.splice(idx, 1)[0] ?? `The Far Marches ${i + 1}`)));
    }
  }

  // acts: boss + stronghold + hint (planted an act early) + quest chain
  const actFirstQuests: EntityRecord[] = [];
  const bosses: EntityRecord[] = [];
  let prevQuest: EntityRecord | null = null;
  for (let i = 0; i < actCount; i++) {
    const region = regions[i]!;
    const level = checkpoints[i]!;
    const roleBase = `act${i + 1}`;

    const bossRun = await run('npc-block', rolePath(world.seed, root.id, `${roleBase}Boss`));
    if (!bossRun) return null;
    const boss = add(blocksToEntity(bossRun.metaId, rolePath(world.seed, root.id, `${roleBase}Boss`), bossRun.blocks, 'Boss', region.id));
    boss.kind = 'person';
    boss.tags = [...theme.tags, 'boss', 'antagonist'];
    boss.fields = { ...boss.fields, checkpoint: `Act ${i + 1} boss — level ${level} checkpoint` };
    boss.relations = [{ type: 'memberOf', target: faction.id }];
    if (i === actCount - 1) faction.fields = { ...faction.fields, leader: { ref: boss.id } };
    bosses.push(boss);

    const lairRun = await run('landmark', rolePath(world.seed, root.id, `${roleBase}Lair`));
    if (!lairRun) return null;
    const lair = add(blocksToEntity(lairRun.metaId, rolePath(world.seed, root.id, `${roleBase}Lair`), lairRun.blocks, 'Stronghold', region.id));
    lair.kind = 'landmark';
    lair.tags = [...theme.tags, 'dungeon'];
    lair.relations = [{ type: 'heldBy', target: boss.id }];

    // multi-step quest chain within the act, threading on from the last act
    const steps = 2 + (rng() < 0.5 ? 1 : 0);
    let firstOfAct: EntityRecord | null = null;
    for (let s = 0; s < steps; s++) {
      const verb = QUEST_VERBS[Math.min(s, QUEST_VERBS.length - 1)]![rng() < 0.5 ? 0 : 1]!;
      const target = s === steps - 1 ? lair : boss;
      const q = add(newEntity('quest', `${verb} ${target.name}`, region.id));
      q.tags = ['epic', `act-${i + 1}`, ...theme.tags];
      q.fields = { levels: `Levels ${level - 3 < 1 ? 1 : level - 3}–${level}`, reward: s === steps - 1 ? 'An act-turning revelation, and the road to what comes next.' : 'A thread worth pulling.' };
      q.relations = [{ type: 'antagonist', target: boss.id }];
      q.body = [para(
        s === steps - 1
          ? `The act ends at ${mention(lair)}: face ${mention(boss)} before the ${mention(faction)} finishes what it started here.`
          : `${mention(faction)} has hands in ${mention(region)}. Follow them toward ${mention(boss)} — but quietly.`,
      )] as EntityRecord['body'];
      q.gen = { generator: 'web:epic-campaign', seed: rolePath(world.seed, root.id, `${roleBase}Quest${s}`), genVersion: 1, plan: `web:${arch.id}`, role: `${roleBase}Quest${s}`, overrides: [] };
      if (prevQuest) prevQuest.relations = [...(prevQuest.relations ?? []), { type: 'leadsTo', target: q.id }];
      prevQuest = q;
      if (!firstOfAct) firstOfAct = q;
    }
    actFirstQuests.push(firstOfAct!);

    // foreshadowing: a hint about THIS act, planted in the PREVIOUS act's region
    if (i > 0) {
      const hint = add(newEntity('note', `Hint: whispers of ${boss.name}`, regions[i - 1]!.id));
      hint.tags = ['hint', 'epic'];
      hint.body = [para(pick(rng, HINTS).replace('{boss}', mention(boss)).replace('{place}', mention(lair)))] as EntityRecord['body'];
    }
  }

  // the campaign overview ties it together
  root.body = [
    para(arch.overview),
    para(`The enemy: ${mention(faction)}, sworn to ${arch.goal}.`),
    ...regions.map((r, i) =>
      para(`Act ${i + 1} — ${mention(r)} (level ${checkpoints[i]} checkpoint): begins with ${mention(actFirstQuests[i]!)}, ends before ${mention(bosses[i]!)}.`)),
    para(planarFinale ? 'The final act does not take place in this world.' : 'The final act is fought on home soil.'),
  ] as EntityRecord['body'];

  // atomic mint (CONTRACTS §6): the web lands whole or not at all
  Object.assign(world.entities, batch);
  return { rootId: root.id, created: Object.keys(batch).length, acts: actCount, planarFinale };
}
