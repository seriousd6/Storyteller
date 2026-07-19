// SRD 5.1 spell reference — the mechanics behind the spell names, so hovering a
// spell (the [[spell:Fireball]] token, engine/inline.ts) shows a card with its
// level, school, casting time, range, components, duration, and effect.
//
// A curated set of the most-cast spells is authored in full below; ANY class
// spell (engine/dnd5e-spells.ts CLASS_SPELLS) still gets at least its level from
// the class lists, so the card is never empty for a real spell. The set grows.
//
// Content: System Reference Document 5.1, CC BY 4.0 (LICENSE-SRD.md).

import { CLASS_SPELLS } from './dnd5e-spells.ts';

export interface SpellInfo {
  name: string;
  level: number; // 0 = cantrip
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  desc: string;
}

/** Normalize a spell name for lookup: lowercase, straighten apostrophes,
 *  drop a trailing "(Ritual)" tag, collapse whitespace. */
export const normSpell = (s: string): string =>
  s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\(ritual\)\s*/gi, '').replace(/\s+/g, ' ').trim();

const A = 'Abjuration', C = 'Conjuration', D = 'Divination', E = 'Enchantment',
  V = 'Evocation', I = 'Illusion', N = 'Necromancy', T = 'Transmutation';

export const SPELLS: SpellInfo[] = [
  // ── Cantrips ──────────────────────────────────────────────────────────────
  { name: 'Fire Bolt', level: 0, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'Hurl a mote of fire at a creature or object — ranged spell attack for 1d10 fire. The damage rises to 2d10 at 5th level, 3d10 at 11th, and 4d10 at 17th.' },
  { name: 'Eldritch Blast', level: 0, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'A beam of crackling energy — ranged spell attack for 1d10 force. You fire two beams at 5th level, three at 11th, and four at 17th.' },
  { name: 'Sacred Flame', level: 0, school: V, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'Radiance descends on a creature (which gains no benefit from cover): DEX save or 1d8 radiant. Scales with level.' },
  { name: 'Vicious Mockery', level: 0, school: E, castingTime: '1 action', range: '60 feet', components: 'V', duration: 'Instantaneous',
    desc: 'A string of magical insults: WIS save or 1d4 psychic and disadvantage on its next attack roll. Scales with level.' },
  { name: 'Ray of Frost', level: 0, school: V, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'A frigid beam — ranged spell attack for 1d8 cold, and the target’s speed drops by 10 feet. Scales with level.' },
  { name: 'Chill Touch', level: 0, school: N, castingTime: '1 action', range: '120 feet', components: 'V, S', duration: '1 round',
    desc: 'A ghostly hand — ranged spell attack for 1d8 necrotic; the target can’t regain hit points until your next turn. Scales with level.' },
  { name: 'Shocking Grasp', level: 0, school: V, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous',
    desc: 'Lightning springs from your hand — melee spell attack (advantage if the target wears metal armor) for 1d8 lightning; it can’t take reactions until its next turn. Scales.' },
  { name: 'Toll the Dead', level: 0, school: N, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'A dolorous bell: WIS save or 1d8 necrotic — 1d12 if the target is already missing hit points. Scales with level.' },
  { name: 'Mage Hand', level: 0, school: C, castingTime: '1 action', range: '30 feet', components: 'V, S', duration: '1 minute',
    desc: 'A spectral hand manipulates objects, opens doors, or carries up to 10 pounds. It can’t attack or wield a weapon.' },
  { name: 'Minor Illusion', level: 0, school: I, castingTime: '1 action', range: '30 feet', components: 'S, M', duration: '1 minute',
    desc: 'Create a sound or the image of an object (within a 5-foot cube). An Investigation check reveals an illusion for what it is.' },
  { name: 'Prestidigitation', level: 0, school: T, castingTime: '1 action', range: '10 feet', components: 'V, S', duration: 'Up to 1 hour',
    desc: 'A minor magical trick: a harmless sensory effect, light or snuff a small flame, clean or soil an object, chill/warm/flavor food, or make a tiny mark or trinket.' },
  { name: 'Guidance', level: 0, school: D, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Concentration, up to 1 minute',
    desc: 'A willing creature can add 1d4 to one ability check of its choice before the spell ends.' },
  { name: 'Light', level: 0, school: V, castingTime: '1 action', range: 'Touch', components: 'V, M', duration: '1 hour',
    desc: 'An object sheds bright light in a 20-foot radius and dim light 20 feet beyond. Cast on an object a creature holds against its will, it makes a DEX save.' },
  { name: 'Thaumaturgy', level: 0, school: T, castingTime: '1 action', range: '30 feet', components: 'V', duration: 'Up to 1 minute',
    desc: 'A minor wonder: your voice booms, flames flicker and change color, harmless tremors shake the ground, or an unlocked door or window flies open or slams shut.' },
  { name: 'Spare the Dying', level: 0, school: N, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous',
    desc: 'Touch a living creature that has 0 hit points; it becomes stable.' },
  { name: 'Mending', level: 0, school: T, castingTime: '1 minute', range: 'Touch', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'Repair a single break or tear in an object — a torn cloak, two halves of a key, a leaking wineskin.' },

  // ── 1st level ─────────────────────────────────────────────────────────────
  { name: 'Magic Missile', level: 1, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'Three glowing darts, each striking automatically for 1d4 + 1 force. One extra dart per slot level above 1st.' },
  { name: 'Cure Wounds', level: 1, school: V, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous',
    desc: 'A creature you touch regains 1d8 + your spellcasting modifier hit points. +1d8 per slot above 1st. No effect on undead or constructs.' },
  { name: 'Healing Word', level: 1, school: V, castingTime: '1 bonus action', range: '60 feet', components: 'V', duration: 'Instantaneous',
    desc: 'A creature you can see regains 1d4 + your spellcasting modifier hit points. +1d4 per slot above 1st.' },
  { name: 'Shield', level: 1, school: A, castingTime: '1 reaction', range: 'Self', components: 'V, S', duration: '1 round',
    desc: 'An invisible barrier: +5 AC until your next turn, including against the triggering attack, and you take no damage from magic missile.' },
  { name: 'Burning Hands', level: 1, school: V, castingTime: '1 action', range: 'Self (15-foot cone)', components: 'V, S', duration: 'Instantaneous',
    desc: 'A sheet of flame: DEX save, 3d6 fire (half on a save). +1d6 per slot above 1st.' },
  { name: 'Thunderwave', level: 1, school: V, castingTime: '1 action', range: 'Self (15-foot cube)', components: 'V, S', duration: 'Instantaneous',
    desc: 'A wave of force: CON save, 2d8 thunder and pushed 10 feet (half and no push on a save). +1d8 per slot above 1st.' },
  { name: 'Bless', level: 1, school: E, castingTime: '1 action', range: '30 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'Up to three creatures add 1d4 to their attack rolls and saving throws. +1 target per slot above 1st.' },
  { name: 'Guiding Bolt', level: 1, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S', duration: '1 round',
    desc: 'A flash of light — ranged spell attack for 4d6 radiant; the next attack against the target has advantage. +1d6 per slot above 1st.' },
  { name: 'Faerie Fire', level: 1, school: V, castingTime: '1 action', range: '60 feet', components: 'V', duration: 'Concentration, up to 1 minute',
    desc: 'Objects and creatures in a 20-foot cube (DEX save) are outlined in light: attacks against them have advantage, and they can’t benefit from being invisible.' },
  { name: 'Sleep', level: 1, school: E, castingTime: '1 action', range: '90 feet', components: 'V, S, M', duration: '1 minute',
    desc: 'Roll 5d8; that many hit points of creatures (lowest current HP first) fall unconscious. +2d8 per slot above 1st.' },
  { name: 'Charm Person', level: 1, school: E, castingTime: '1 action', range: '30 feet', components: 'V, S', duration: '1 hour',
    desc: 'A humanoid makes a WIS save or is charmed, regarding you as a friendly acquaintance, until the spell ends or you harm it. +1 target per slot.' },
  { name: 'Command', level: 1, school: E, castingTime: '1 action', range: '60 feet', components: 'V', duration: '1 round',
    desc: 'A creature makes a WIS save or obeys a one-word command on its next turn (approach, drop, flee, grovel, halt). +1 target per slot above 1st.' },
  { name: 'Detect Magic', level: 1, school: D, castingTime: '1 action', range: 'Self', components: 'V, S', duration: 'Concentration, up to 10 minutes',
    desc: 'Sense the presence of magic within 30 feet; with an action you see a faint aura around anything magical and learn its school. Ritual.' },
  { name: 'Mage Armor', level: 1, school: A, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: '8 hours',
    desc: 'A willing, unarmored creature’s base AC becomes 13 + its Dexterity modifier for the duration.' },
  { name: 'Hex', level: 1, school: E, castingTime: '1 bonus action', range: '90 feet', components: 'V, S, M', duration: 'Concentration, up to 1 hour',
    desc: 'Curse a creature: your attacks deal an extra 1d6 necrotic to it, and it has disadvantage on ability checks with one ability you choose.' },
  { name: 'Chromatic Orb', level: 1, school: V, castingTime: '1 action', range: '90 feet', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'Hurl an orb of a chosen element — ranged spell attack for 3d8 of acid, cold, fire, lightning, poison, or thunder. +1d8 per slot above 1st.' },

  // ── 2nd level ─────────────────────────────────────────────────────────────
  { name: 'Misty Step', level: 2, school: C, castingTime: '1 bonus action', range: 'Self', components: 'V', duration: 'Instantaneous',
    desc: 'Wreathed in mist, teleport up to 30 feet to an unoccupied space you can see.' },
  { name: 'Scorching Ray', level: 2, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'Three rays of fire — a ranged spell attack for each, 2d6 fire on a hit. One extra ray per slot above 2nd.' },
  { name: 'Hold Person', level: 2, school: E, castingTime: '1 action', range: '60 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'A humanoid makes a WIS save or is paralyzed, repeating the save at the end of each of its turns. +1 target per slot above 2nd.' },
  { name: 'Invisibility', level: 2, school: I, castingTime: '1 action', range: 'Touch', components: 'V, S, M', duration: 'Concentration, up to 1 hour',
    desc: 'A creature (and its gear) turns invisible until it attacks or casts a spell. +1 target per slot above 2nd.' },
  { name: 'Spiritual Weapon', level: 2, school: V, castingTime: '1 bonus action', range: '60 feet', components: 'V, S', duration: '1 minute',
    desc: 'Create a floating spectral weapon; as a bonus action move it 20 feet and attack for 1d8 + your spellcasting modifier force. +1d8 per two slots above 2nd.' },
  { name: 'Web', level: 2, school: C, castingTime: '1 action', range: '60 feet', components: 'V, S, M', duration: 'Concentration, up to 1 hour',
    desc: 'Thick webs fill a 20-foot cube (difficult terrain); a creature entering or starting there makes a DEX save or is restrained.' },
  { name: 'Aid', level: 2, school: A, castingTime: '1 action', range: '30 feet', components: 'V, S, M', duration: '8 hours',
    desc: 'Up to three creatures each have their hit point maximum and current hit points raised by 5. +5 per slot above 2nd.' },
  { name: 'Lesser Restoration', level: 2, school: A, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Instantaneous',
    desc: 'End one disease or the blinded, deafened, paralyzed, or poisoned condition on a creature you touch.' },
  { name: 'Moonbeam', level: 2, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'A 5-foot beam of moonlight; a creature that enters or starts there makes a CON save, taking 2d10 radiant (half on a save). Move it 60 feet each turn. +1d10 per slot.' },
  { name: 'Darkness', level: 2, school: V, castingTime: '1 action', range: '60 feet', components: 'V, M', duration: 'Concentration, up to 10 minutes',
    desc: 'Magical darkness fills a 15-foot sphere; even darkvision can’t see through it, and nonmagical light can’t illuminate it.' },
  { name: 'Mirror Image', level: 2, school: I, castingTime: '1 action', range: 'Self', components: 'V, S', duration: '1 minute',
    desc: 'Three illusory duplicates dance around you; an attack that would hit you may strike a duplicate instead (destroyed on a hit).' },

  // ── 3rd level ─────────────────────────────────────────────────────────────
  { name: 'Fireball', level: 3, school: V, castingTime: '1 action', range: '150 feet', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'A streaking bead blossoms into flame in a 20-foot-radius sphere: DEX save, 8d6 fire (half on a save). +1d6 per slot above 3rd.' },
  { name: 'Counterspell', level: 3, school: A, castingTime: '1 reaction', range: '60 feet', components: 'S', duration: 'Instantaneous',
    desc: 'Interrupt a creature casting a spell; a spell of 3rd level or lower fails, while a higher-level one requires your ability check (DC 10 + its level).' },
  { name: 'Lightning Bolt', level: 3, school: V, castingTime: '1 action', range: 'Self (100-foot line)', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'A stroke of lightning 100 feet long and 5 feet wide: DEX save, 8d6 lightning (half on a save). +1d6 per slot above 3rd.' },
  { name: 'Dispel Magic', level: 3, school: A, castingTime: '1 action', range: '120 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'End a spell of 3rd level or lower on a target; for a higher-level spell, make an ability check (DC 10 + its level).' },
  { name: 'Fly', level: 3, school: T, castingTime: '1 action', range: 'Touch', components: 'V, S, M', duration: 'Concentration, up to 10 minutes',
    desc: 'A willing creature gains a flying speed of 60 feet. +1 target per slot above 3rd.' },
  { name: 'Haste', level: 3, school: T, castingTime: '1 action', range: '30 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'A willing creature gains +2 AC, advantage on DEX saves, doubled speed, and one extra action (Attack, Dash, Disengage, Hide, or Use an Object). Lethargic for a turn when it ends.' },
  { name: 'Hypnotic Pattern', level: 3, school: I, castingTime: '1 action', range: '120 feet', components: 'S, M', duration: 'Concentration, up to 1 minute',
    desc: 'A twisting pattern of colors in a 30-foot cube; creatures that see it make a WIS save or become charmed, incapacitated, and slowed.' },
  { name: 'Spirit Guardians', level: 3, school: C, castingTime: '1 action', range: 'Self (15-foot radius)', components: 'V, S, M', duration: 'Concentration, up to 10 minutes',
    desc: 'Protective spirits swirl around you; a hostile creature there makes a WIS save, taking 3d8 radiant or necrotic (half on a save) and moving at half speed. +1d8 per slot.' },
  { name: 'Revivify', level: 3, school: N, castingTime: '1 action', range: 'Touch', components: 'V, S, M (diamonds worth 300 gp, consumed)', duration: 'Instantaneous',
    desc: 'A creature that died within the last minute returns to life with 1 hit point. It doesn’t restore missing body parts.' },
  { name: 'Vampiric Touch', level: 3, school: N, castingTime: '1 action', range: 'Self', components: 'V, S', duration: 'Concentration, up to 1 minute',
    desc: 'A withering touch — melee spell attack for 3d6 necrotic, and you regain half the damage dealt. You can attack again each turn. +1d6 per slot.' },

  // ── 4th level ─────────────────────────────────────────────────────────────
  { name: 'Polymorph', level: 4, school: T, castingTime: '1 action', range: '60 feet', components: 'V, S, M', duration: 'Concentration, up to 1 hour',
    desc: 'A creature (WIS save to resist) is transformed into a beast of challenge rating no higher than its own; it uses the new form’s stats, with temporary hit points as a buffer.' },
  { name: 'Greater Invisibility', level: 4, school: I, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: 'Concentration, up to 1 minute',
    desc: 'A creature you touch is invisible for the duration — even while attacking and casting spells.' },
  { name: 'Dimension Door', level: 4, school: C, castingTime: '1 action', range: '500 feet', components: 'V', duration: 'Instantaneous',
    desc: 'Teleport yourself, and one willing creature beside you, to a spot you can see or otherwise picture.' },
  { name: 'Banishment', level: 4, school: A, castingTime: '1 action', range: '60 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'A creature makes a CHA save or is banished — to a harmless demiplane, or, if extraplanar, back to its home plane. +1 target per slot above 4th.' },
  { name: 'Wall of Fire', level: 4, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'A wall of flame (a 60-foot line or a 20-foot ring, 20 feet high); one side deals 5d8 fire on a DEX save (half). +1d8 per slot above 4th.' },
  { name: 'Ice Storm', level: 4, school: V, castingTime: '1 action', range: '300 feet', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'Hail pounds a 20-foot-radius cylinder: DEX save, 2d8 bludgeoning + 4d6 cold (half on a save); the ground becomes difficult terrain. Cold damage +1d6 per slot.' },
  { name: 'Stoneskin', level: 4, school: A, castingTime: '1 action', range: 'Touch', components: 'V, S, M (diamond dust worth 100 gp, consumed)', duration: 'Concentration, up to 1 hour',
    desc: 'A willing creature gains resistance to nonmagical bludgeoning, piercing, and slashing damage.' },
  { name: 'Death Ward', level: 4, school: A, castingTime: '1 action', range: 'Touch', components: 'V, S', duration: '8 hours',
    desc: 'The first time the warded creature would drop to 0 hit points, it drops to 1 instead; an effect that would kill it outright is negated once.' },

  // ── 5th level ─────────────────────────────────────────────────────────────
  { name: 'Cone of Cold', level: 5, school: V, castingTime: '1 action', range: 'Self (60-foot cone)', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'A blast of frigid air: CON save, 8d8 cold (half on a save). A creature killed becomes a frozen statue. +1d8 per slot above 5th.' },
  { name: 'Wall of Force', level: 5, school: V, castingTime: '1 action', range: '120 feet', components: 'V, S, M', duration: 'Concentration, up to 10 minutes',
    desc: 'An invisible wall of force that nothing can pass through physically; it’s immune to most damage and can’t be dispelled by antimagic on its surface.' },
  { name: 'Hold Monster', level: 5, school: E, castingTime: '1 action', range: '90 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'Any creature (not undead) makes a WIS save or is paralyzed, repeating the save each turn. +1 target per slot above 5th.' },
  { name: 'Mass Cure Wounds', level: 5, school: V, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'Up to six creatures in a 30-foot-radius sphere each regain 3d8 + your spellcasting modifier hit points. +1d8 per slot above 5th.' },
  { name: 'Raise Dead', level: 5, school: N, castingTime: '1 hour', range: 'Touch', components: 'V, S, M (a diamond worth 500 gp, consumed)', duration: 'Instantaneous',
    desc: 'A creature dead no more than 10 days returns to life with 1 hit point, carrying a −4 penalty to rolls that fades over several long rests.' },
  { name: 'Flame Strike', level: 5, school: V, castingTime: '1 action', range: '60 feet', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'A column of divine fire in a 10-foot-radius cylinder: DEX save, 4d6 fire + 4d6 radiant (half on a save). +1d6 (of either) per slot above 5th.' },
  { name: 'Telekinesis', level: 5, school: T, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Concentration, up to 10 minutes',
    desc: 'By concentration you move a creature (STR contest) or an object weighing up to 1,000 pounds, repeating each round.' },

  // ── 6th level ─────────────────────────────────────────────────────────────
  { name: 'Chain Lightning', level: 6, school: V, castingTime: '1 action', range: '150 feet', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'A bolt strikes one creature, then leaps to as many as three others: DEX save, 10d8 lightning (half on a save). +1 target per slot above 6th.' },
  { name: 'Disintegrate', level: 6, school: T, castingTime: '1 action', range: '60 feet', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'A thin green ray: DEX save, 10d6 + 40 force; a creature reduced to 0 hit points is disintegrated to dust. +3d6 per slot above 6th.' },
  { name: 'Heal', level: 6, school: V, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'A surge of vitality restores 70 hit points and ends blindness, deafness, and any disease. +10 hit points per slot above 6th.' },
  { name: 'True Seeing', level: 6, school: D, castingTime: '1 action', range: 'Touch', components: 'V, S, M', duration: '1 hour',
    desc: 'For the duration the creature has truesight out to 120 feet: it sees in darkness, notices invisible things, sees through illusions, and perceives true forms.' },

  // ── 7th level ─────────────────────────────────────────────────────────────
  { name: 'Finger of Death', level: 7, school: N, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Instantaneous',
    desc: 'Negative energy wracks a creature: CON save, 7d8 + 30 necrotic (half on a save). A humanoid it kills rises as a zombie under your command.' },
  { name: 'Teleport', level: 7, school: C, castingTime: '1 action', range: '10 feet', components: 'V', duration: 'Instantaneous',
    desc: 'Instantly transport yourself and up to eight willing creatures to a destination you know; accuracy depends on how well you know it.' },
  { name: 'Delayed Blast Fireball', level: 7, school: V, castingTime: '1 action', range: '150 feet', components: 'V, S, M', duration: 'Concentration, up to 1 minute',
    desc: 'A glowing bead waits and grows — its damage (base 12d6 fire) increases by 1d6 each of your turns until it detonates: DEX save for full effect (half on a save).' },

  // ── 8th level ─────────────────────────────────────────────────────────────
  { name: 'Sunburst', level: 8, school: V, castingTime: '1 action', range: '150 feet', components: 'V, S, M', duration: 'Instantaneous',
    desc: 'Brilliant sunlight fills a 60-foot-radius sphere: CON save, 12d6 radiant and blinded for 1 minute (half and no blindness on a save). Undead and oozes save at disadvantage.' },
  { name: 'Power Word Stun', level: 8, school: E, castingTime: '1 action', range: '60 feet', components: 'V', duration: 'Instantaneous',
    desc: 'A word of power stuns a creature that has 150 hit points or fewer; it then repeats a CON save at the end of each of its turns to end the effect.' },
  { name: 'Dominate Monster', level: 8, school: E, castingTime: '1 action', range: '60 feet', components: 'V, S', duration: 'Concentration, up to 1 hour',
    desc: 'A creature makes a WIS save or is charmed and controlled; you issue commands and, with an action, take over its turn. +duration is unaffected. 9th-level slot lasts 8 hours.' },

  // ── 9th level ─────────────────────────────────────────────────────────────
  { name: 'Wish', level: 9, school: C, castingTime: '1 action', range: 'Self', components: 'V', duration: 'Instantaneous',
    desc: 'The mightiest spell: duplicate any spell of 8th level or lower (no components), or reshape reality itself — pushing beyond the safe uses risks never casting it again.' },
  { name: 'Meteor Swarm', level: 9, school: V, castingTime: '1 action', range: '1 mile', components: 'V, S', duration: 'Instantaneous',
    desc: 'Four fiery orbs plummet, each a 40-foot-radius blast: DEX save, 20d6 fire + 20d6 bludgeoning (half on a save). Overlapping areas don’t stack.' },
  { name: 'Power Word Kill', level: 9, school: E, castingTime: '1 action', range: '60 feet', components: 'V', duration: 'Instantaneous',
    desc: 'Utter a word of power that instantly kills one creature that has 100 hit points or fewer.' },
  { name: 'Time Stop', level: 9, school: T, castingTime: '1 action', range: 'Self', components: 'V', duration: 'Instantaneous',
    desc: 'Take 1d4 + 1 turns in a row while time stands still; the spell ends if one of your actions affects another creature or an object worn or carried by another.' },
  { name: 'True Resurrection', level: 9, school: N, castingTime: '1 hour', range: 'Touch', components: 'V, S, M (diamonds worth 25,000 gp, consumed)', duration: 'Instantaneous',
    desc: 'A creature dead up to 200 years returns fully restored — cured, renewed, even provided a new body if none remains.' },
];

const BY_NAME = new Map<string, SpellInfo>(SPELLS.map((s) => [normSpell(s.name), s]));

/** A spell's level derived from the class spell lists (0 = cantrip), so a real
 *  class spell always has at least a level even before it's fully authored. */
const LEVEL_BY_NAME: Map<string, number> = (() => {
  const m = new Map<string, number>();
  for (const byLevel of Object.values(CLASS_SPELLS)) {
    byLevel.forEach((names, lvl) => {
      for (const n of names) {
        const key = normSpell(n);
        if (!m.has(key)) m.set(key, lvl);
      }
    });
  }
  return m;
})();

export interface SpellLookup {
  name: string;
  level: number;
  full: SpellInfo | null; // the authored mechanics, or null (level-only)
}

/** Look up a spell by (fuzzy) name. Returns the authored card if we have it,
 *  else a level-only card for any real class spell, else null (unknown). */
export function lookupSpell(name: string): SpellLookup | null {
  const key = normSpell(name);
  const full = BY_NAME.get(key) ?? null;
  if (full) return { name: full.name, level: full.level, full };
  const level = LEVEL_BY_NAME.get(key);
  if (level === undefined) return null;
  return { name: name.trim(), level, full: null };
}

// ── mechanics parsed from the prose (owner review 2026-07-18: a spell with
// damage or an attack offers the ROLLS, not just the reading) ──────────────

const DAMAGE_TYPES =
  'fire|cold|force|thunder|lightning|acid|poison|necrotic|radiant|psychic|bludgeoning|piercing|slashing';
const DAMAGE_RE = new RegExp(`(\\d+d\\d+(?:\\s*\\+\\s*\\d+)?)\\s+(${DAMAGE_TYPES})\\b`, 'i');

export interface SpellDamage {
  dice: string; // "8d6", normalized, rollable as-is
  kind: string; // "fire"
}

/** First damage roll in a spell's prose — "8d6 fire", "1d4 + 1 force" — or
 *  null when the spell doesn't deal typed damage. */
export function spellDamage(desc: string): SpellDamage | null {
  const m = DAMAGE_RE.exec(desc);
  if (!m) return null;
  return { dice: m[1]!.replace(/\s+/g, ''), kind: m[2]!.toLowerCase() };
}

/** Does casting this involve a spell attack roll? */
export function spellHasAttack(desc: string): boolean {
  return /spell attack/i.test(desc);
}

/** Cantrip / "Nth-level <school>" label for a card subhead. */
export function spellLevelLabel(level: number, school?: string): string {
  const ord = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][level] ?? `${level}th`;
  const lvl = level === 0 ? 'Cantrip' : `${ord}-level`;
  return school ? (level === 0 ? `${school} cantrip` : `${lvl} ${school.toLowerCase()}`) : lvl;
}
