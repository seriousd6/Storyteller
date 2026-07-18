// The spell hover-card (docs/CAMPAIGN-CODEX.md, Phase D): the little panel that
// appears when you hover a [[spell:Fireball]] chip. Built lazily on first hover
// (engine/inline.ts), so the spell dataset stays out of the page bundle until a
// spell is actually inspected. Returns null for an unknown name — the chip then
// just shows the text, nothing pops up.

import { lookupSpell, spellLevelLabel } from './spells.ts';

function line(dl: HTMLElement, term: string, value: string): void {
  const row = document.createElement('div');
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  dl.appendChild(row);
}

/** Build the hover card for a spell name, or null if it isn't a known spell.
 *  The element is `position: fixed` and hidden; the caller places + shows it. */
export function buildSpellCard(name: string): HTMLElement | null {
  const info = lookupSpell(name);
  if (!info) return null;

  const card = document.createElement('div');
  card.className = 'spell-card';
  card.setAttribute('role', 'tooltip');
  card.hidden = true;

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
  } else {
    // A real class spell we haven't fully written up yet — still name its level.
    const note = document.createElement('p');
    note.className = 'spell-card-note';
    note.textContent = 'SRD 5.1 spell — full description coming soon.';
    card.appendChild(note);
  }

  return card;
}
