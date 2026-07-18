// entityRef (owner decision 2026-07-18, PLAN.md §21.10): a sheet block that
// IS a world entity — not a copy of one. The entity's body renders through
// the kit like any sheet content, but every edit persists through the world
// store: change the sheet and the world page sees it, change the world and
// WORLD_EVENT re-renders the sheet. Two-way because there is exactly one
// copy of the data. §21.9's "no realtime/CRDT" still stands — this is
// same-store referencing, not cross-device sync.

import type { Block, EntityRefBlock } from '../types.ts';
import type { BlockDef, EditCtx, RenderCtx } from '../blockKit.ts';
import { blockRoot, editableText, renderBlockEditable, renderBlockPlay, renderBlockStatic } from '../blockKit.ts';
import type { EntityRecord, WorldDoc } from '../worldStore.ts';
import { getWorld, putWorld, touchEntity, WORLD_EVENT } from '../worldStore.ts';

// One loaded doc per world per page: two refs to the same world must edit
// the SAME objects or their writes would clobber each other.
const docs = new Map<string, Promise<WorldDoc | undefined>>();

// Our own putWorld echoes back as WORLD_EVENT; the page must not treat it
// as an external change (it would tear down the field being edited).
let selfPersists = 0;
export function isSelfPersist(): boolean {
  return selfPersists > 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener(WORLD_EVENT, () => {
    if (!isSelfPersist()) docs.clear(); // external change → refetch on next render
  });
}

function loadDoc(worldId: string): Promise<WorldDoc | undefined> {
  let p = docs.get(worldId);
  if (!p) {
    p = getWorld(worldId);
    docs.set(worldId, p);
  }
  return p;
}

function persist(world: WorldDoc, entity: EntityRecord): void {
  touchEntity(entity);
  selfPersists++;
  void putWorld(world).finally(() => {
    selfPersists--;
  });
}

/** The world-backed commit sink: same undo bus, same mode, same vars — but
 *  save() lands in the world store. The child block defs never know. */
function worldEditCtx(ctx: EditCtx, world: WorldDoc, entity: EntityRecord): EditCtx {
  const sink: EditCtx = {
    mode: ctx.mode,
    vars: ctx.vars,
    renderChild: (b) => renderBlockEditable(b, sink),
    save: () => persist(world, entity),
    execute: (cmd) =>
      ctx.execute({
        label: cmd.label,
        apply: () => {
          cmd.apply();
          persist(world, entity);
        },
        revert: () => {
          cmd.revert();
          persist(world, entity);
        },
      }),
    record: (cmd) =>
      ctx.record({
        label: cmd.label,
        apply: () => {
          cmd.apply();
          persist(world, entity);
        },
        revert: () => {
          cmd.revert();
          persist(world, entity);
        },
      }),
  };
  return sink;
}

function header(entity: EntityRecord, block: EntityRefBlock, editable: boolean, ctx?: EditCtx, world?: WorldDoc): HTMLElement {
  const head = document.createElement('p');
  head.className = 'entity-ref-head';
  const name = document.createElement('b');
  if (editable && ctx && world) {
    editableText(name, worldEditCtx(ctx, world, entity), () => entity.name, (v) => (entity.name = v));
  } else {
    name.textContent = entity.name;
  }
  const kind = document.createElement('span');
  kind.className = 'entity-ref-kind no-print';
  kind.textContent = entity.kind;
  const link = document.createElement('a');
  link.className = 'entity-ref-link no-print';
  link.href = `/world/?world=${encodeURIComponent(block.worldId)}&entity=${encodeURIComponent(block.entityId)}`;
  link.textContent = '↗ world';
  link.title = 'Open this entity in the world wiki — same data, other surface';
  head.append(name, ' ', kind, ' ', link);
  return head;
}

function missing(root: HTMLElement, block: EntityRefBlock): void {
  const warn = document.createElement('p');
  warn.className = 'entity-ref-missing';
  warn.textContent = `⚠ world entity not found (${block.entityId} in ${block.worldId}) — deleted, or its world isn't on this device`;
  root.appendChild(warn);
}

function renderInto(root: HTMLElement, block: EntityRefBlock, editable: boolean, ctx: RenderCtx | EditCtx): void {
  void loadDoc(block.worldId).then((world) => {
    root.replaceChildren();
    const entity = world?.entities[block.entityId];
    if (!world || !entity || entity.deleted) {
      missing(root, block);
      return;
    }
    const editCtx = editable ? (ctx as EditCtx) : (ctx as RenderCtx).edit;
    root.appendChild(header(entity, block, editable, editCtx, world));
    const body = (entity.body ?? []) as unknown as Block[];
    for (const child of body) {
      if (entity.secretBlocks?.includes(child.id ?? '')) continue; // GM-only stays GM-only
      if (editable && editCtx) {
        root.appendChild(renderBlockEditable(child, worldEditCtx(editCtx, world, entity)));
      } else if (editCtx) {
        // play: static look, but trackers/rolls persist to the WORLD
        root.appendChild(renderBlockPlay(child, worldEditCtx(editCtx, world, entity)));
      } else {
        root.appendChild(renderBlockStatic(child));
      }
    }
  });
}

export const entityRefDef: BlockDef<EntityRefBlock> = {
  type: 'entityRef',
  renderStatic(block, ctx) {
    const root = blockRoot('entityRef');
    root.textContent = '…';
    renderInto(root, block, false, ctx);
    return root;
  },
  renderEditable(block, ctx) {
    const root = blockRoot('entityRef');
    root.textContent = '…';
    renderInto(root, block, true, ctx);
    return root;
  },
  toMarkdown(block) {
    return `*(embedded world entity — lives in the world wiki, export it there)*`;
  },
};
