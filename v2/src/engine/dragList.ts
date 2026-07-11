// Drag-to-reorder for a list container. While dragging, the dragged item is
// moved live within the DOM (its own preview); on drop, onMove(from, to) is
// called with the data indices so the caller can reorder its model and save.

export function enableDragReorder(
  container: HTMLElement,
  itemSelector: string,
  onMove: (from: number, to: number) => void,
): void {
  let fromIndex = -1;

  const items = () => [...container.querySelectorAll<HTMLElement>(itemSelector)];

  container.addEventListener('dragstart', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(itemSelector);
    if (!item) return;
    fromIndex = items().indexOf(item);
    item.classList.add('dragging');
    e.dataTransfer?.setData('text/plain', '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragover', (e) => {
    const dragging = container.querySelector<HTMLElement>('.dragging');
    if (!dragging) return;
    e.preventDefault();
    const target = (e.target as HTMLElement).closest<HTMLElement>(itemSelector);
    if (!target || target === dragging) return;
    const rect = target.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    container.insertBefore(dragging, before ? target : target.nextSibling);
  });

  container.addEventListener('drop', (e) => e.preventDefault());

  container.addEventListener('dragend', () => {
    const dragging = container.querySelector<HTMLElement>('.dragging');
    if (!dragging) return;
    dragging.classList.remove('dragging');
    const toIndex = items().indexOf(dragging);
    if (fromIndex >= 0 && toIndex >= 0 && toIndex !== fromIndex) onMove(fromIndex, toIndex);
    fromIndex = -1;
  });
}

/** Reorder helper for the data side. */
export function moveItem<T>(list: T[], from: number, to: number): void {
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item as T);
}
