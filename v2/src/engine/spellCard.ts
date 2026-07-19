// The spell hover-card (docs/CAMPAIGN-CODEX.md, Phase D): the little panel that
// appears when you hover a [[spell:Fireball]] chip. Built lazily on first hover
// (engine/inline.ts), so the spell dataset stays out of the page bundle until a
// spell is actually inspected. Returns null for an unknown name — the chip then
// just shows the text, nothing pops up.

import { lookupSpell, spellDamage, spellHasAttack, spellLevelLabel } from './spells.ts';
import { fmtMod } from './vars.ts';
import { randomSeed } from './rng.ts';
import { pushRoll } from './rollLog.ts';

async function castRoll(formula: string, label: string, vars: Record<string, number>, out: HTMLElement): Promise<void> {
  const [{ roll }, { showRoll }] = await Promise.all([import('./dice.ts'), import('./diceStage.ts')]);
  const result = roll(formula, randomSeed(), vars);
  showRoll(result, label);
  out.textContent = ` ${result.total}`;
  out.title = result.breakdown;
  pushRoll({ label, detail: result.breakdown, total: result.total });
}

function rollRow(name: string, vars: Record<string, number>, desc: string): HTMLElement | null {
  const damage = spellDamage(desc);
  // the character's spell attack bonus, when the sheet publishes one
  // ($spell_atk preferred; the 5e sheet's spellcasting grid exposes $attack)
  const atk = vars['spell_atk'] ?? vars['attack'];
  const hasAttack = spellHasAttack(desc) && atk !== undefined;
  if (!damage && !hasAttack) return null;
  const row = document.createElement('p');
  row.className = 'spell-card-rolls';
  const add = (label: string, formula: string, rollLabel: string): void => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip chip-action';
    btn.textContent = label;
    btn.title = `Roll ${formula}`;
    const out = document.createElement('span');
    out.className = 'chip-result';
    btn.addEventListener('click', () => {
      castRoll(formula, rollLabel, vars, out).catch((err) => {
        out.textContent = ' ⚠';
        out.title = err instanceof Error ? err.message : 'roll failed';
      });
    });
    row.append(btn, out, ' ');
  };
  if (hasAttack) add(`⚔ to hit ${fmtMod(atk!)}`, `1d20+${atk}`, `${name} — to hit`);
  if (damage) add(`🎲 ${damage.dice} ${damage.kind}`, damage.dice, `${name} — damage`);
  return row;
}

function line(dl: HTMLElement, term: string, value: string): void {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  dl.appendChild(row);
}

/** Build the hover card for a spell name. Known spells carry their SRD text
 *  (and, with `vars`, live to-hit/damage buttons — hover to read, click to
 *  cast); names outside the reference still get a minimal card, so every
 *  spell chip hovers to SOMETHING (owner ask 2026-07-19) — a dead hover
 *  reads as broken. The element is `position: fixed` and hidden; the caller
 *  places + shows it. */
export function buildSpellCard(name: string, vars?: () => Record<string, number>): HTMLElement | null {
  const info = lookupSpell(name);

  const card = document.createElement('div');
  card.className = 'spell-card';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;

  if (!info) {
    const nameEl = document.createElement('div');
    nameEl.className = 'spell-card-name';
    nameEl.textContent = name;
    const note = document.createElement('p');
    note.className = 'spell-card-note';
    note.textContent = 'Not in the SRD 5.1 reference — a house spell or one from another book. Its details live in your sourcebook.';
    card.append(nameEl, note);
    return card;
  }

  const nameEl = document.createElement('div');
  nameEl.className = 'spell-card-name';
  nameEl.textContent = info.full?.name ?? info.name;

  const sub = document.createElement('div');
  sub.className = 'spell-card-sub';
  sub.textContent = spellLevelLabel(info.level, info.full?.school);

  card.append(nameEl, sub);

  if (info.full) {
    const dl = document.createElement('dl');
    dl.className = 'spell-card-meta';
    line(dl, 'Casting Time', info.full.castingTime);
    line(dl, 'Range', info.full.range);
    line(dl, 'Components', info.full.components);
    line(dl, 'Duration', info.full.duration);
    card.appendChild(dl);

    const desc = document.createElement('p');
    desc.className = 'spell-card-desc';
    desc.textContent = info.full.desc;
    card.appendChild(desc);

    const rolls = rollRow(info.full.name, vars?.() ?? {}, info.full.desc);
    if (rolls) card.appendChild(rolls);
  } else {
    // A real class spell we haven't fully written up yet — still name its level.
    const note = document.createElement('p');
    note.className = 'spell-card-note';
    note.textContent = 'SRD 5.1 spell — full description coming soon.';
    card.appendChild(note);
  }

  return card;
}
