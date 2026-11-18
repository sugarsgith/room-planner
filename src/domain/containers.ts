import { itemSize, type ItemSize } from "./storageFit";
import type { StorageSpace, StoredItem } from "./types";

/** Interior size. Missing or incomplete means this item is not a container. */
export function innerSize(item: Pick<StoredItem, "innerWidth" | "innerDepth" | "innerHeight">): ItemSize | null {
  return itemSize({ width: item.innerWidth, depth: item.innerDepth, height: item.innerHeight });
}

/**
 * A container is one object with an interior. Quantity stays 1 because two
 * identical cases would not say which one holds the clothes. A container
 * cannot sit inside another container.
 */
export function isContainer(item: StoredItem): boolean {
  return item.quantity === 1 && !item.containerId && innerSize(item) !== null;
}

/** The container this item sits in, or null when it is directly in the space. */
export function parentContainer(item: StoredItem, items: StoredItem[]): StoredItem | null {
  if (!item.containerId || item.containerId === item.id) return null;
  const parent = items.find((other) => other.id === item.containerId);
  if (!parent || parent.spaceId !== item.spaceId || !isContainer(parent)) return null;
  return parent;
}

export function childItems(container: StoredItem, items: StoredItem[]): StoredItem[] {
  if (!isContainer(container)) return [];
  return items.filter((item) => parentContainer(item, items)?.id === container.id);
}

export function directItems(spaceId: string, items: StoredItem[]): StoredItem[] {
  return items.filter((item) => item.spaceId === spaceId && !parentContainer(item, items));
}

/** 「冬服 / FITS（ベッド下）」, or 「FITS（ベッド下）」 when it is not inside a case. */
export function itemPath(item: StoredItem, items: StoredItem[], spaceName: string): string {
  const parent = parentContainer(item, items);
  if (parent) return `${item.name} / ${parent.name}（${spaceName}）`;
  return `${item.name}（${spaceName}）`;
}

export function innerSpace(container: StoredItem): StorageSpace | null {
  const size = innerSize(container);
  if (!size || !isContainer(container)) return null;
  return { id: container.id, name: container.name, width: size.width, depth: size.depth, height: size.height, note: "" };
}

/**
 * Drop links the published app does not understand how to repair, without
 * deleting the item. Called when this app saves an edit, not when a file is opened.
 */
export function sanitizeStoredItem(item: StoredItem, items: StoredItem[]): StoredItem {
  const next: StoredItem = { ...item };
  const parent = next.containerId ? items.find((other) => other.id === next.containerId) : undefined;
  const parentOk =
    parent &&
    parent.id !== next.id &&
    !parent.containerId &&
    parent.quantity === 1 &&
    parent.spaceId === next.spaceId &&
    innerSize(parent) !== null;
  if (!parentOk) delete next.containerId;
  if (next.containerId || next.quantity !== 1 || !innerSize(next)) {
    delete next.innerWidth;
    delete next.innerDepth;
    delete next.innerHeight;
  }
  return next;
}
