// SRD 5.1 class spell lists — so a rolled caster gets class-appropriate spells at
// the right level, not a draw from the whole spellbook. Each class maps to an
// array indexed by spell level: index 0 is cantrips, 1..9 are spell levels.
// (Half casters — paladin, ranger — stop at 5; warlock's Mystic Arcanum reaches
// 6..9.) Non-casters are absent.
//
// Names use plain apostrophes; scripts/smoke-dnd5e.mjs cross-checks every entry
// against the gm/spells/level-N tables (normalized), so a wrong level or a
// misspelling fails the gate — the data cannot silently drift from the SRD.
//
// Content: System Reference Document 5.1, CC BY 4.0 (LICENSE-SRD.md).

export const CLASS_SPELLS: Record<string, string[][]> = {
  bard: [
    ['Blade Ward', 'Dancing Lights', 'Friends', 'Light', 'Mage Hand', 'Mending', 'Message', 'Minor Illusion', 'Prestidigitation', 'True Strike', 'Vicious Mockery'],
    ['Animal Friendship', 'Bane', 'Charm Person', 'Comprehend Languages', 'Cure Wounds', 'Detect Magic', 'Disguise Self', 'Dissonant Whispers', 'Faerie Fire', 'Feather Fall', 'Healing Word', 'Heroism', 'Identify', 'Illusory Script', 'Longstrider', 'Silent Image', 'Sleep', 'Speak with Animals', "Tasha's Hideous Laughter", 'Thunderwave', 'Unseen Servant'],
    ['Animal Messenger', 'Blindness/Deafness', 'Calm Emotions', 'Cloud of Daggers', 'Crown of Madness', 'Detect Thoughts', 'Enhance Ability', 'Enthrall', 'Heat Metal', 'Hold Person', 'Invisibility', 'Knock', 'Lesser Restoration', 'Locate Animals or Plants', 'Locate Object', 'Magic Mouth', 'Phantasmal Force', 'See Invisibility', 'Shatter', 'Silence', 'Suggestion', 'Zone of Truth'],
    ['Bestow Curse', 'Clairvoyance', 'Dispel Magic', 'Fear', 'Feign Death', 'Glyph of Warding', 'Hypnotic Pattern', "Leomund's Tiny Hut", 'Major Image', 'Nondetection', 'Plant Growth', 'Sending', 'Speak with Dead', 'Speak with Plants', 'Stinking Cloud', 'Tongues'],
    ['Charm Monster', 'Compulsion', 'Confusion', 'Dimension Door', 'Freedom of Movement', 'Greater Invisibility', 'Hallucinatory Terrain', 'Locate Creature', 'Polymorph'],
    ['Animate Objects', 'Awaken', 'Dominate Person', 'Dream', 'Geas', 'Greater Restoration', 'Hold Monster', 'Legend Lore', 'Mass Cure Wounds', 'Mislead', 'Modify Memory', 'Planar Binding', 'Raise Dead', 'Scrying', 'Seeming', 'Teleportation Circle'],
    ['Eyebite', 'Find the Path', 'Guards and Wards', 'Mass Suggestion', "Otto's Irresistible Dance", 'True Seeing'],
    ['Etherealness', 'Forcecage', 'Mirage Arcane', "Mordenkainen's Magnificent Mansion", "Mordenkainen's Sword", 'Project Image', 'Regenerate', 'Resurrection', 'Symbol', 'Teleport'],
    ['Dominate Monster', 'Feeblemind', 'Glibness', 'Mind Blank', 'Power Word Stun'],
    ['Foresight', 'Power Word Heal', 'Power Word Kill', 'Prismatic Wall', 'True Polymorph'],
  ],
  cleric: [
    ['Guidance', 'Light', 'Mending', 'Resistance', 'Sacred Flame', 'Spare the Dying', 'Thaumaturgy', 'Toll the Dead', 'Word of Radiance'],
    ['Bane', 'Bless', 'Command', 'Create or Destroy Water', 'Cure Wounds', 'Detect Evil and Good', 'Detect Magic', 'Detect Poison and Disease', 'Guiding Bolt', 'Healing Word', 'Inflict Wounds', 'Protection from Evil and Good', 'Purify Food and Drink', 'Sanctuary', 'Shield of Faith'],
    ['Aid', 'Augury', 'Blindness/Deafness', 'Calm Emotions', 'Continual Flame', 'Enhance Ability', 'Find Traps', 'Gentle Repose', 'Hold Person', 'Lesser Restoration', 'Locate Object', 'Prayer of Healing', 'Protection from Poison', 'Silence', 'Spiritual Weapon', 'Warding Bond', 'Zone of Truth'],
    ['Animate Dead', 'Beacon of Hope', 'Bestow Curse', 'Clairvoyance', 'Create Food and Water', 'Daylight', 'Dispel Magic', 'Feign Death', 'Glyph of Warding', 'Magic Circle', 'Mass Healing Word', 'Meld into Stone', 'Protection from Energy', 'Remove Curse', 'Revivify', 'Sending', 'Speak with Dead', 'Spirit Guardians', 'Tongues', 'Water Walk'],
    ['Banishment', 'Control Water', 'Death Ward', 'Divination', 'Freedom of Movement', 'Guardian of Faith', 'Locate Creature', 'Stone Shape'],
    ['Commune', 'Contagion', 'Dispel Evil and Good', 'Flame Strike', 'Geas', 'Greater Restoration', 'Hallow', 'Insect Plague', 'Legend Lore', 'Mass Cure Wounds', 'Planar Binding', 'Raise Dead', 'Scrying'],
    ['Blade Barrier', 'Create Undead', 'Find the Path', 'Forbiddance', 'Harm', 'Heal', "Heroes' Feast", 'Planar Ally', 'True Seeing', 'Word of Recall'],
    ['Conjure Celestial', 'Divine Word', 'Etherealness', 'Fire Storm', 'Plane Shift', 'Regenerate', 'Resurrection', 'Symbol'],
    ['Antimagic Field', 'Control Weather', 'Earthquake', 'Holy Aura', 'Sunburst'],
    ['Astral Projection', 'Gate', 'Mass Heal', 'Power Word Heal', 'True Resurrection'],
  ],
  druid: [
    ['Control Flames', 'Create Bonfire', 'Druidcraft', 'Frostbite', 'Guidance', 'Gust', 'Infestation', 'Magic Stone', 'Mending', 'Mold Earth', 'Poison Spray', 'Primal Savagery', 'Produce Flame', 'Resistance', 'Shape Water', 'Shillelagh', 'Thorn Whip', 'Thunderclap'],
    ['Absorb Elements', 'Animal Friendship', 'Beast Bond', 'Charm Person', 'Create or Destroy Water', 'Cure Wounds', 'Detect Magic', 'Detect Poison and Disease', 'Earth Tremor', 'Entangle', 'Faerie Fire', 'Fog Cloud', 'Goodberry', 'Healing Word', 'Ice Knife', 'Jump', 'Longstrider', 'Purify Food and Drink', 'Speak with Animals', 'Thunderwave'],
    ['Animal Messenger', 'Barkskin', 'Beast Sense', 'Darkvision', 'Dust Devil', 'Earthbind', 'Enhance Ability', 'Find Traps', 'Flame Blade', 'Flaming Sphere', 'Gust of Wind', 'Healing Spirit', 'Heat Metal', 'Hold Person', 'Lesser Restoration', 'Locate Animals or Plants', 'Locate Object', 'Moonbeam', 'Pass Without Trace', 'Protection from Poison', 'Spike Growth'],
    ['Call Lightning', 'Conjure Animals', 'Daylight', 'Dispel Magic', 'Erupting Earth', 'Feign Death', 'Flame Arrows', 'Meld into Stone', 'Plant Growth', 'Protection from Energy', 'Sleet Storm', 'Speak with Plants', 'Tidal Wave', 'Wall of Water', 'Water Breathing', 'Water Walk', 'Wind Wall'],
    ['Blight', 'Confusion', 'Conjure Minor Elementals', 'Conjure Woodland Beings', 'Control Water', 'Dominate Beast', 'Freedom of Movement', 'Giant Insect', 'Grasping Vine', 'Hallucinatory Terrain', 'Ice Storm', 'Locate Creature', 'Polymorph', 'Stone Shape', 'Stoneskin', 'Wall of Fire'],
    ['Antilife Shell', 'Awaken', 'Commune with Nature', 'Cone of Cold', 'Conjure Elemental', 'Contagion', 'Geas', 'Greater Restoration', 'Insect Plague', 'Mass Cure Wounds', 'Planar Binding', 'Reincarnate', 'Scrying', 'Tree Stride', 'Wall of Stone', 'Wrath of Nature'],
    ['Bones of the Earth', 'Conjure Fey', 'Druid Grove', 'Find the Path', 'Flesh to Stone', 'Heal', "Heroes' Feast", 'Investiture of Flame', 'Investiture of Ice', 'Investiture of Stone', 'Investiture of Wind', 'Move Earth', 'Primordial Ward', 'Sunbeam', 'Transport via Plants', 'Wall of Thorns', 'Wind Walk'],
    ['Fire Storm', 'Mirage Arcane', 'Plane Shift', 'Regenerate', 'Reverse Gravity', 'Whirlwind'],
    ['Animal Shapes', 'Antipathy/Sympathy', 'Control Weather', 'Earthquake', 'Feeblemind', 'Sunburst', 'Tsunami'],
    ['Foresight', 'Shapechange', 'Storm of Vengeance', 'True Resurrection'],
  ],
  paladin: [
    [],
    ['Bless', 'Command', 'Compelled Duel', 'Cure Wounds', 'Detect Evil and Good', 'Detect Magic', 'Detect Poison and Disease', 'Divine Favor', 'Heroism', 'Protection from Evil and Good', 'Purify Food and Drink', 'Searing Smite', 'Shield of Faith', 'Thunderous Smite', 'Wrathful Smite'],
    ['Aid', 'Branding Smite', 'Find Steed', 'Lesser Restoration', 'Locate Object', 'Magic Weapon', 'Protection from Poison', 'Zone of Truth'],
    ['Aura of Vitality', 'Blinding Smite', 'Create Food and Water', "Crusader's Mantle", 'Daylight', 'Dispel Magic', 'Elemental Weapon', 'Magic Circle', 'Remove Curse', 'Revivify'],
    ['Aura of Life', 'Aura of Purity', 'Banishment', 'Death Ward', 'Find Greater Steed', 'Locate Creature', 'Staggering Smite'],
    ['Banishing Smite', 'Circle of Power', 'Destructive Wave', 'Dispel Evil and Good', 'Geas', 'Holy Weapon', 'Raise Dead'],
    [], [], [], [],
  ],
  ranger: [
    [],
    ['Absorb Elements', 'Alarm', 'Animal Friendship', 'Beast Bond', 'Cure Wounds', 'Detect Magic', 'Detect Poison and Disease', 'Ensnaring Strike', 'Entangle', 'Fog Cloud', 'Goodberry', 'Hail of Thorns', "Hunter's Mark", 'Jump', 'Longstrider', 'Snare', 'Speak with Animals', 'Zephyr Strike'],
    ['Animal Messenger', 'Barkskin', 'Beast Sense', 'Cordon of Arrows', 'Darkvision', 'Enhance Ability', 'Find Traps', 'Gust of Wind', 'Healing Spirit', 'Lesser Restoration', 'Locate Animals or Plants', 'Locate Object', 'Pass Without Trace', 'Protection from Poison', 'Silence', 'Spike Growth'],
    ['Conjure Animals', 'Conjure Barrage', 'Daylight', 'Dispel Magic', 'Elemental Weapon', 'Flame Arrows', 'Lightning Arrow', 'Meld into Stone', 'Nondetection', 'Plant Growth', 'Protection from Energy', 'Speak with Plants', 'Water Breathing', 'Water Walk', 'Wind Wall'],
    ['Conjure Woodland Beings', 'Dominate Beast', 'Freedom of Movement', 'Grasping Vine', 'Locate Creature', 'Stoneskin'],
    ['Commune with Nature', 'Conjure Volley', 'Steel Wind Strike', 'Swift Quiver', 'Tree Stride'],
    [], [], [], [],
  ],
  sorcerer: [
    ['Acid Splash', 'Blade Ward', 'Chill Touch', 'Control Flames', 'Create Bonfire', 'Dancing Lights', 'Fire Bolt', 'Friends', 'Frostbite', 'Gust', 'Light', 'Mage Hand', 'Mending', 'Message', 'Minor Illusion', 'Mold Earth', 'Poison Spray', 'Prestidigitation', 'Ray of Frost', 'Shape Water', 'Shocking Grasp', 'Thunderclap', 'True Strike'],
    ['Burning Hands', 'Chaos Bolt', 'Charm Person', 'Chromatic Orb', 'Color Spray', 'Comprehend Languages', 'Detect Magic', 'Disguise Self', 'Expeditious Retreat', 'False Life', 'Feather Fall', 'Fog Cloud', 'Ice Knife', 'Jump', 'Mage Armor', 'Magic Missile', 'Ray of Sickness', 'Shield', 'Silent Image', 'Sleep', 'Thunderwave', 'Witch Bolt'],
    ["Aganazzar's Scorcher", 'Alter Self', 'Blindness/Deafness', 'Blur', 'Cloud of Daggers', 'Crown of Madness', 'Darkness', 'Darkvision', 'Detect Thoughts', "Dragon's Breath", 'Dust Devil', 'Enhance Ability', 'Enlarge/Reduce', 'Gust of Wind', 'Hold Person', 'Invisibility', 'Knock', 'Levitate', 'Mind Spike', 'Mirror Image', 'Misty Step', 'Phantasmal Force', 'Pyrotechnics', 'Scorching Ray', 'See Invisibility', 'Shatter', "Snilloc's Snowball Swarm", 'Spider Climb', 'Suggestion', 'Web'],
    ['Blink', 'Clairvoyance', 'Counterspell', 'Daylight', 'Dispel Magic', 'Fear', 'Fireball', 'Fly', 'Gaseous Form', 'Haste', 'Hypnotic Pattern', 'Lightning Bolt', 'Major Image', 'Protection from Energy', 'Sleet Storm', 'Slow', 'Stinking Cloud', 'Tongues', 'Wall of Water', 'Water Breathing', 'Water Walk'],
    ['Banishment', 'Blight', 'Confusion', 'Dimension Door', 'Dominate Beast', 'Greater Invisibility', 'Ice Storm', 'Polymorph', 'Stoneskin', 'Storm Sphere', 'Vitriolic Sphere', 'Wall of Fire', 'Watery Sphere'],
    ['Animate Objects', 'Cloudkill', 'Cone of Cold', 'Creation', 'Dominate Person', 'Hold Monster', 'Immolation', 'Insect Plague', 'Seeming', 'Synaptic Static', 'Telekinesis', 'Teleportation Circle', 'Wall of Light', 'Wall of Stone'],
    ['Arcane Gate', 'Chain Lightning', 'Circle of Death', 'Disintegrate', 'Eyebite', 'Globe of Invulnerability', 'Mass Suggestion', 'Move Earth', "Otiluke's Freezing Sphere", 'Sunbeam', 'True Seeing', 'Wall of Ice'],
    ['Delayed Blast Fireball', 'Etherealness', 'Finger of Death', 'Fire Storm', 'Plane Shift', 'Power Word Pain', 'Prismatic Spray', 'Reverse Gravity', 'Teleport'],
    ['Dominate Monster', 'Earthquake', 'Incendiary Cloud', 'Power Word Stun', 'Sunburst'],
    ['Gate', 'Meteor Swarm', 'Power Word Kill', 'Psychic Scream', 'Time Stop', 'Wish'],
  ],
  warlock: [
    ['Blade Ward', 'Chill Touch', 'Eldritch Blast', 'Friends', 'Mage Hand', 'Minor Illusion', 'Poison Spray', 'Prestidigitation', 'True Strike'],
    ['Armor of Agathys', 'Arms of Hadar', 'Cause Fear', 'Charm Person', 'Comprehend Languages', 'Expeditious Retreat', 'Hellish Rebuke', 'Hex', 'Illusory Script', 'Protection from Evil and Good', 'Unseen Servant', 'Witch Bolt'],
    ['Cloud of Daggers', 'Crown of Madness', 'Darkness', 'Enthrall', 'Hold Person', 'Invisibility', 'Mind Spike', 'Mirror Image', 'Misty Step', 'Ray of Enfeeblement', 'Shatter', 'Spider Climb', 'Suggestion'],
    ['Counterspell', 'Dispel Magic', 'Fear', 'Fly', 'Gaseous Form', 'Hunger of Hadar', 'Hypnotic Pattern', 'Magic Circle', 'Major Image', 'Remove Curse', 'Summon Lesser Demons', 'Vampiric Touch'],
    ['Banishment', 'Blight', 'Charm Monster', 'Dimension Door', 'Hallucinatory Terrain', 'Shadow of Moil', 'Summon Greater Demon'],
    ['Contact Other Plane', 'Danse Macabre', 'Dream', 'Enervation', 'Far Step', 'Hold Monster', 'Infernal Calling', 'Negative Energy Flood', 'Planar Binding', 'Scrying', 'Synaptic Static', 'Wall of Light'],
    ['Arcane Gate', 'Circle of Death', 'Conjure Fey', 'Create Undead', 'Eyebite', 'Flesh to Stone', 'Mental Prison', 'Soul Cage', 'True Seeing'],
    ['Etherealness', 'Finger of Death', 'Forcecage', 'Plane Shift', 'Power Word Pain', 'Prismatic Spray'],
    ['Demiplane', 'Dominate Monster', 'Feeblemind', 'Glibness', 'Maddening Darkness', 'Power Word Stun'],
    ['Astral Projection', 'Foresight', 'Imprisonment', 'Power Word Kill', 'Psychic Scream', 'True Polymorph', 'Weird'],
  ],
  wizard: [
    ['Acid Splash', 'Chill Touch', 'Dancing Lights', 'Fire Bolt', 'Light', 'Mage Hand', 'Mending', 'Message', 'Minor Illusion', 'Poison Spray', 'Prestidigitation', 'Ray of Frost', 'Shocking Grasp', 'True Strike'],
    ['Alarm', 'Burning Hands', 'Charm Person', 'Chromatic Orb', 'Color Spray', 'Comprehend Languages', 'Detect Magic', 'Disguise Self', 'Expeditious Retreat', 'False Life', 'Feather Fall', 'Find Familiar', 'Fog Cloud', 'Grease', 'Identify', 'Illusory Script', 'Jump', 'Longstrider', 'Mage Armor', 'Magic Missile', 'Protection from Evil and Good', 'Ray of Sickness', 'Shield', 'Silent Image', 'Sleep', "Tenser's Floating Disk", 'Thunderwave', 'Unseen Servant', 'Witch Bolt'],
    ['Alter Self', 'Arcane Lock', 'Blindness/Deafness', 'Blur', 'Continual Flame', 'Darkness', 'Darkvision', 'Detect Thoughts', 'Enlarge/Reduce', 'Flaming Sphere', 'Gentle Repose', 'Gust of Wind', 'Hold Person', 'Invisibility', 'Knock', 'Levitate', 'Locate Object', 'Magic Mouth', 'Magic Weapon', 'Mirror Image', 'Misty Step', 'Ray of Enfeeblement', 'Rope Trick', 'Scorching Ray', 'See Invisibility', 'Shatter', 'Spider Climb', 'Suggestion', 'Web'],
    ['Animate Dead', 'Bestow Curse', 'Blink', 'Clairvoyance', 'Counterspell', 'Dispel Magic', 'Fear', 'Fireball', 'Fly', 'Gaseous Form', 'Glyph of Warding', 'Haste', 'Hypnotic Pattern', 'Lightning Bolt', 'Magic Circle', 'Major Image', 'Nondetection', 'Phantom Steed', 'Protection from Energy', 'Remove Curse', 'Sending', 'Sleet Storm', 'Slow', 'Stinking Cloud', 'Tongues', 'Vampiric Touch', 'Water Breathing'],
    ['Arcane Eye', 'Banishment', 'Blight', 'Confusion', 'Conjure Minor Elementals', 'Control Water', 'Dimension Door', "Evard's Black Tentacles", 'Fabricate', 'Fire Shield', 'Greater Invisibility', 'Ice Storm', 'Locate Creature', 'Phantasmal Killer', 'Polymorph', 'Stone Shape', 'Stoneskin', 'Wall of Fire'],
    ['Animate Objects', "Bigby's Hand", 'Cloudkill', 'Cone of Cold', 'Conjure Elemental', 'Contact Other Plane', 'Creation', 'Dominate Person', 'Dream', 'Geas', 'Hold Monster', 'Legend Lore', 'Mislead', 'Modify Memory', 'Passwall', 'Planar Binding', 'Scrying', 'Seeming', 'Telekinesis', 'Teleportation Circle', 'Wall of Force', 'Wall of Stone'],
    ['Arcane Gate', 'Chain Lightning', 'Circle of Death', 'Contingency', 'Create Undead', 'Disintegrate', 'Eyebite', 'Flesh to Stone', 'Globe of Invulnerability', 'Guards and Wards', 'Magic Jar', 'Mass Suggestion', 'Move Earth', "Otiluke's Freezing Sphere", "Otto's Irresistible Dance", 'Sunbeam', 'True Seeing', 'Wall of Ice'],
    ['Delayed Blast Fireball', 'Etherealness', 'Finger of Death', 'Forcecage', 'Mirage Arcane', "Mordenkainen's Magnificent Mansion", "Mordenkainen's Sword", 'Plane Shift', 'Prismatic Spray', 'Project Image', 'Reverse Gravity', 'Sequester', 'Simulacrum', 'Symbol', 'Teleport'],
    ['Antimagic Field', 'Antipathy/Sympathy', 'Clone', 'Control Weather', 'Demiplane', 'Dominate Monster', 'Feeblemind', 'Incendiary Cloud', 'Maze', 'Mind Blank', 'Power Word Stun', 'Sunburst'],
    ['Astral Projection', 'Foresight', 'Gate', 'Imprisonment', 'Meteor Swarm', 'Power Word Kill', 'Prismatic Wall', 'Shapechange', 'Time Stop', 'True Polymorph', 'Weird', 'Wish'],
  ],
};
