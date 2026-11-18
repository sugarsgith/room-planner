import { mToCm } from "./units";
import type { StorageSpace, StoredItem } from "./types";

/** Shown on each stored item. Blank size is skipped, not treated as a failure. */
export type FitKind = "unset" | "fits" | "fits-rotated" | "too-tall" | "no-fit";

export interface ItemFit {
  kind: FitKind;
  /** サイズ未入力 / 入る / 向きを変えると入る / 高さが足りない / 入らない */
  label: string;
  /**
   * Set when one item fits (as stored, or turned flat) but quantity times
   * its volume is larger than the space. Height and footprint failures
   * stay on `label` and do not add this note.
   */
  countNote: string | null;
}

export interface SpaceFill {
  /** used / capacity. Null when nothing has a complete size. */
  ratio: number | null;
  sizedCount: number;
  unsizedCount: number;
  /** Always starts with 目安 so the bar is not read as an exact pack. */
  label: string;
}

export interface ItemSize {
  width: number;
  depth: number;
  height: number;
}

/** All three sizes, or null when any is missing or not a positive finite length. */
export function itemSize(item: Pick<StoredItem, "width" | "depth" | "height">): ItemSize | null {
  const { width, depth, height } = item;
  if (!isPositive(width) || !isPositive(depth) || !isPositive(height)) return null;
  return { width, depth, height };
}

export function fitStoredItem(item: StoredItem, space: StorageSpace): ItemFit {
  const size = itemSize(item);
  if (!size) return { kind: "unset", label: "サイズ未入力", countNote: null };
  if (!cmFits(size.height, space.height)) return { kind: "too-tall", label: "高さが足りない", countNote: null };
  const asStored = cmFits(size.width, space.width) && cmFits(size.depth, space.depth);
  const turned = cmFits(size.depth, space.width) && cmFits(size.width, space.depth);
  if (!asStored && !turned) return { kind: "no-fit", label: "入らない", countNote: null };
  const kind: FitKind = asStored ? "fits" : "fits-rotated";
  const label = asStored ? "入る" : "向きを変えると入る";
  const countNote = countExceeds(size, item.quantity, space)
    ? `${item.quantity}個分の容積は、このスペースの目安を超えます`
    : null;
  return { kind, label, countNote };
}

export function spaceFill(items: StoredItem[], space: StorageSpace): SpaceFill {
  const capacity = volumeCm(space.width, space.depth, space.height);
  let used = 0;
  let sizedCount = 0;
  let unsizedCount = 0;
  for (const item of items) {
    const size = itemSize(item);
    if (!size) {
      unsizedCount += 1;
      continue;
    }
    sizedCount += 1;
    const qty = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1;
    used += volumeCm(size.width, size.depth, size.height) * qty;
  }
  if (sizedCount === 0 || !(capacity > 0)) {
    return { ratio: null, sizedCount, unsizedCount, label: "目安 —" };
  }
  const ratio = used / capacity;
  return { ratio, sizedCount, unsizedCount, label: `目安 ${Math.round(ratio * 100)}%` };
}

/** Compare the centimeters the screen shows, so 20.0 fits in 20.0. */
function cmFits(itemM: number, spaceM: number): boolean {
  return mToCm(itemM) <= mToCm(spaceM);
}

function volumeCm(widthM: number, depthM: number, heightM: number): number {
  return mToCm(widthM) * mToCm(depthM) * mToCm(heightM);
}

function countExceeds(size: ItemSize, quantity: number, space: StorageSpace): boolean {
  if (!Number.isInteger(quantity) || quantity <= 1) return false;
  const used = volumeCm(size.width, size.depth, size.height) * quantity;
  const capacity = volumeCm(space.width, space.depth, space.height);
  return used > capacity + 0.05;
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
