// Place profiles — the map's geographic realism, made reusable by the
// randomizers (owner, batch 76). The world bake already derives a settlement's
// *type* from where it sits (a coast makes a fishing village, a great-river
// crossing makes a river port) and reads its living off the land. This module
// lifts that logic out of the grid so the standalone Settlement tool — and any
// blind randomizer — can roll a coherent place instead of six contradictory
// table draws: a node type is chosen first, and it LOCKS the economy, trade,
// and standing so they always agree with each other and with the biome.
//
// Pure and deterministic (a roll int is passed in), so it behaves identically
// in the browser, the smoke test, and build-time rendering.

/** The settlement archetypes the bake places (settlements.ts SettleType). */
export type SettleType =
  | 'royal seat'
  | 'regional city'
  | 'river port'
  | 'coastal town'
  | 'market town'
  | 'fishing village'
  | 'farming village';

export const SETTLE_TYPES: SettleType[] = [
  'royal seat', 'regional city', 'river port', 'coastal town',
  'market town', 'fishing village', 'farming village',
];

/** What the land around a biome yields — the bake's ECON map (settlements.ts). */
const LAND_ECON: Record<string, string> = {
  grass: 'good grain and cattle country',
  savanna: 'dry-farmed grain and herds',
  beach: 'strand farms and inshore fishing',
  forest: 'a field-and-woodland mosaic of crops, timber, and game',
  hills: 'terraced fields and hill pasture',
  jungle: 'garden plots worked out of the canopy',
  taiga: 'hard barley, hunting, and furs',
  tundra: 'thin herding at the moss-edge',
  mountain: 'a few high valleys and the wealth of the rock',
  desert: 'oasis fields and the salt roads',
  snow: 'the bare edge of the living world',
  water: "the sea's harvest",
  deep: "the sea's harvest",
};

/** Biome-appropriate trade goods, so a desert town doesn't ship "Mithril Ore". */
const LAND_GOODS: Record<string, string> = {
  grass: 'grain, wool, and cattle',
  savanna: 'grain, hides, and dried meat',
  beach: 'fish, salt, and shell',
  forest: 'timber, game, and charcoal',
  hills: 'wool, stone, and orchard fruit',
  jungle: 'spice, dye, and rare hardwood',
  taiga: 'furs, amber, and pitch',
  tundra: 'furs, ivory, and reindeer hide',
  mountain: 'ore, stone, and worked metal',
  desert: 'salt, glass, and dates',
  snow: 'furs and little else',
  water: 'fish, salt, and shipped cargo',
  deep: 'fish, salt, and shipped cargo',
};

function landOf(biome: string): string {
  return LAND_ECON[biome] ?? 'workable country';
}
function goodsOf(biome: string): string {
  return LAND_GOODS[biome] ?? 'staple crops and local craft';
}

export interface PlaceProfile {
  /** The one-line economic reality — the authoritative Economy field. */
  economy: string;
  /** What leaves the gates — the Trade field, locked to type + biome. */
  trade: string;
  /** Why the place stands where it does — a grounded "Standing" line. */
  standing: string;
}

/** The locked economic profile for a settlement of `type` in `biome`. */
export function profileFor(type: SettleType, biome: string): PlaceProfile {
  const land = landOf(biome);
  const goods = goodsOf(biome);
  switch (type) {
    case 'royal seat':
      return {
        economy: `The seat of a crown: taxes, courts, and the coin of a whole realm run through it, set on ${land}.`,
        trade: `Administration and the realm's finest craft, drawing ${goods} from a wide country.`,
        standing: 'A crown sited it on the richest foodshed it could hold, where a great city can be fed.',
      };
    case 'regional city':
      return {
        economy: `A regional city of trade and craft, drawing ${land} from a wide hinterland.`,
        trade: `Manufactured goods, banking, and bulk staples — ${goods} moving in quantity.`,
        standing: 'Roads and water converge here; the countryside pours its harvest into a city.',
      };
    case 'river port':
      return {
        economy: `A river wharf where ${land} is barged down to bigger markets.`,
        trade: `${goods[0]!.toUpperCase()}${goods.slice(1)}, moved as river freight.`,
        standing: 'It holds a crossing or a landing on the river — a wharf, a bridgehead, a barge road.',
      };
    case 'coastal town':
      return {
        economy: `A harbour town living off the sea and off ${land} behind it.`,
        trade: `${goods[0]!.toUpperCase()}${goods.slice(1)}, and cargo shipped along the coast.`,
        standing: 'The shore feeds it — inshore fishing, and a beach to draw up boats.',
      };
    case 'market town':
      return {
        economy: `A market town for the ${land} around it.`,
        trade: `Livestock, staple crops, and local craft: ${goods}.`,
        standing: 'The roads of the district meet here, and on market day the country comes in.',
      };
    case 'fishing village':
      return {
        economy: `A fishing hamlet working the water, with ${land} at its back.`,
        trade: `${goods[0]!.toUpperCase()}${goods.slice(1)} — little of it leaves the parish.`,
        standing: 'The water at its feet is the whole reason it stands.',
      };
    case 'farming village':
    default:
      return {
        economy: `A farming hamlet set in ${land}.`,
        trade: 'Surplus grain and a little craft, when the harvest is kind.',
        standing: 'The fields around it are the whole of its wealth.',
      };
  }
}

export interface DeriveOpts {
  biome?: string;
  /** 'hamlet' | 'village' | 'town' | 'city' */
  size?: string;
  coastal?: boolean;
  river?: boolean;
  greatRiver?: boolean;
  /** A deterministic roll in [0, 1) — caller supplies it from the seed. */
  roll: number;
}

/** Choose a coherent node type from what's known about the site. Mirrors the
 *  bake's typeOf (settlements.ts) but tolerates missing water info: when the
 *  caller can't say (a standalone roll), water cues are inferred from the biome
 *  and the roll so the tool still yields varied, grounded places. */
export function deriveSettleType(o: DeriveOpts): SettleType {
  const size = o.size ?? 'town';
  const big = size === 'city';
  const small = size === 'village' || size === 'hamlet';
  // infer water when the caller didn't measure it
  const coastal = o.coastal ?? (o.biome === 'beach' || (o.biome === undefined && o.roll < 0.18));
  const onRiver = o.greatRiver || o.river || (o.coastal === undefined && o.river === undefined && o.roll >= 0.18 && o.roll < 0.34);

  if (big) return o.roll < 0.25 ? 'royal seat' : 'regional city';
  if (o.greatRiver || onRiver) return small ? 'fishing village' : 'river port';
  if (coastal) return small ? 'fishing village' : 'coastal town';
  if (size === 'town') return 'market town';
  return 'farming village';
}

/** Human label ("Fishing Village") for a type, for the statblock meta line. */
export function typeLabel(type: SettleType): string {
  return type.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
