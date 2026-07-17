// Fantasy Names — the site's own name forge, surfaced as a tool.
//
// Every name is coined on the spot from the morphemes in engine/nameforge.ts
// (our own phonaesthetic pools, not the old fantasynamegenerators exports). Dial
// a race and gender, or leave it to chance; ask for one (with a sketched face)
// or a whole batch to pick from. A single name comes back as a named plate so
// the Composite island draws a matching portrait; a batch comes back as a list.
//
// No tables are read — the forge is self-contained — but the build stays pure
// and deterministic per seed by drawing every pick from the composer's rng.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import { SYSTEMS, forgeName, forgeNames, raceChoices, RACE_ORDER, type Gender } from '../engine/nameforge.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const COUNTS = [
  { value: '1', label: 'One (with a face)' },
  { value: '3', label: 'Three' },
  { value: '5', label: 'Five' },
  { value: '10', label: 'Ten' },
];
const clampCount = (v: string) => (v === '3' ? 3 : v === '5' ? 5 : v === '10' ? 10 : 1);

export const meta: CompositeMeta = {
  id: 'gm/names',
  title: 'Fantasy Names',
  pillar: 'gm',
  description:
    'A name for anyone at the table — dwarven forge-clans, elven mononyms, orcish battle-names, tiefling virtues, and more. Every name is coined fresh from our own morpheme pools, tuned to the sound of each people. Ask for one and get a face to go with it, or a batch to pick from.',
  addLabel: 'Add name',
  options: [
    { id: 'race', label: 'Race', choices: [{ value: '', label: 'Any race' }, ...raceChoices()], default: 'human' },
    {
      id: 'gender',
      label: 'Gender',
      choices: [
        { value: '', label: 'Any' },
        { value: 'male', label: 'Masculine' },
        { value: 'female', label: 'Feminine' },
      ],
      default: '',
    },
    { id: 'count', label: 'How many', choices: COUNTS, default: '1' },
  ],
};

export function build(_tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(_tables, seed);
  const count = clampCount(opts.count ?? '1');

  // A set race stays; "Any" picks one race for the whole roll so the batch reads
  // as one people (and re-rolls to a different one).
  const race = opts.race && SYSTEMS[opts.race] ? opts.race : c.among(RACE_ORDER);
  const sys = SYSTEMS[race]!;
  const gender = (opts.gender === 'male' || opts.gender === 'female' ? opts.gender : '') as Gender;

  if (count === 1) {
    // Lock a concrete gender so the sketched face matches the name; an "Any"
    // request on a gendered people coin-flips here.
    const hasBoth = !!sys.patterns.male?.length && !!sys.patterns.female?.length;
    const g: Gender = gender || (hasBoth ? (c.chance(0.5) ? 'male' : 'female') : '');
    const name = forgeName(sys, g, c.rng);
    const genderWord = g === 'male' ? 'masculine' : g === 'female' ? 'feminine' : '';
    // "(male)"/"(female)" in the meta lets the island lock the portrait's sex.
    const sexTag = g ? ` (${g})` : '';
    return [
      {
        type: 'statblock',
        name,
        meta: `${sys.label}${sexTag}`,
        sections: genderWord
          ? [{ type: 'paragraph', text: `A ${genderWord} ${sys.label.toLowerCase()} name.` }]
          : [{ type: 'paragraph', text: `A ${sys.label.toLowerCase()} name.` }],
      },
    ];
  }

  const names = forgeNames(sys, gender, count, c.rng);
  return [
    {
      type: 'list',
      label: `${sys.label} names${gender ? ` · ${gender === 'male' ? 'masculine' : 'feminine'}` : ''}`,
      items: names,
    },
  ];
}
