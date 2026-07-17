// Weather & Travel: a leg of an overland journey — the day's weather (by
// season) and wind, a wilderness landmark the party comes across, and now and
// then a strange sign in the sky. Surfaces the world/weather-* / wind /
// phenomenon tables that were buried inside the World grab-bag generator, plus
// the wilderness landmarks from adventure/point-of-interest.
//
// Registry scanner: table ids must be FULL literals — so all four seasonal
// weather tables are named literally below (the season is chosen at runtime).

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const SEASONS = [
  { value: '', label: 'Any season' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
] as const;

const WEATHER: Record<string, string> = {
  spring: '{table:gm/world/weather-spring}',
  summer: '{table:gm/world/weather-summer}',
  fall: '{table:gm/world/weather-fall}',
  winter: '{table:gm/world/weather-winter}',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The headline before a parenthetical, e.g. "Thunderstorm (Lightning…)". */
const headline = (s: string) => s.split(' (')[0]!.trim();

export const meta: CompositeMeta = {
  id: 'gm/travel',
  title: 'Weather & Travel',
  pillar: 'gm',
  description:
    'A leg of the journey in one roll: the day’s weather for the season and the wind behind it, a wilderness landmark the party comes across, and — now and then — a strange sign overhead. Pin a few for a whole trek.',
  addLabel: 'Add travel day',
  options: [{ id: 'season', label: 'Season', choices: SEASONS.map((s) => ({ value: s.value, label: s.label })), default: '' }],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const season =
    opts.season && WEATHER[opts.season] ? opts.season : c.among(['spring', 'summer', 'fall', 'winter']);
  const weather = c.text(WEATHER[season]!);
  const wind = c.text('{table:gm/world/wind}');

  const sections: Block[] = [
    { type: 'paragraph', label: 'Weather', text: weather },
    { type: 'paragraph', label: 'On the road, you come across', text: c.text('{table:gm/adventure/point-of-interest}') },
  ];

  // ~30% of days, something uncanny is in the sky.
  if (c.chance(0.3)) {
    sections.push({ type: 'paragraph', label: 'A strange sign', text: c.text('{table:gm/world/phenomenon}') });
  }

  return [
    {
      type: 'statblock',
      name: `A ${cap(season)} day on the road`,
      meta: `${headline(weather)} · wind from the ${wind}`,
      sections,
    },
  ];
}
