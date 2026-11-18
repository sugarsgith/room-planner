import { describe, expect, it } from "vitest";
import { fitStoredItem, itemSize, spaceFill } from "./storageFit";
import { cmToM } from "./units";
import type { StorageSpace, StoredItem } from "./types";

function space(widthCm: number, depthCm: number, heightCm: number): StorageSpace {
  return {
    id: "shelf",
    name: "棚",
    width: cmToM(widthCm),
    depth: cmToM(depthCm),
    height: cmToM(heightCm),
    note: "",
  };
}

function item(partial: Partial<StoredItem> = {}): StoredItem {
  return {
    id: "box",
    name: "箱",
    quantity: 1,
    spaceId: "shelf",
    note: "",
    ...partial,
  };
}

function sized(widthCm: number, depthCm: number, heightCm: number, quantity = 1): StoredItem {
  return item({
    quantity,
    width: cmToM(widthCm),
    depth: cmToM(depthCm),
    height: cmToM(heightCm),
  });
}

describe("item fit", () => {
  const shelf = space(90, 40, 30);

  it("skips a blank or incomplete size", () => {
    expect(fitStoredItem(item(), shelf)).toMatchObject({ kind: "unset", label: "サイズ未入力", countNote: null });
    expect(itemSize(item({ width: cmToM(10) }))).toBeNull();
    expect(fitStoredItem(item({ width: cmToM(10), depth: cmToM(10) }), shelf).label).toBe("サイズ未入力");
    expect(fitStoredItem(item({ width: 0, depth: cmToM(10), height: cmToM(10) }), shelf).label).toBe("サイズ未入力");
  });

  it("accepts an exact fit and a flat turn, and refuses a box that matches neither way", () => {
    expect(fitStoredItem(sized(90, 40, 30), shelf).label).toBe("入る");
    expect(fitStoredItem(sized(40, 90, 30), shelf).label).toBe("向きを変えると入る");
    expect(fitStoredItem(sized(20, 20, 10), shelf).label).toBe("入る");
    expect(fitStoredItem(sized(95, 50, 20), shelf).label).toBe("入らない");
  });

  it("reports height before the footprint, and does not tip the item onto its side", () => {
    expect(fitStoredItem(sized(10, 10, 30.1), shelf).label).toBe("高さが足りない");
    expect(fitStoredItem(sized(80, 50, 40), shelf).label).toBe("高さが足りない");
  });

  it("keeps a one-item fit and adds a count note when the volumes no longer fit", () => {
    const one = fitStoredItem(sized(40, 30, 20, 1), shelf);
    expect(one.label).toBe("入る");
    expect(one.countNote).toBeNull();
    const many = fitStoredItem(sized(40, 30, 20, 5), shelf);
    expect(many.label).toBe("入る");
    expect(many.countNote).toBe("5個分の容積は、このスペースの目安を超えます");
    const blocked = fitStoredItem(sized(95, 50, 20, 3), shelf);
    expect(blocked.label).toBe("入らない");
    expect(blocked.countNote).toBeNull();
  });
});

describe("space fill", () => {
  const shelf = space(90, 40, 30);

  it("ignores unsized items and labels the ratio as an estimate", () => {
    const empty = spaceFill([item({ name: "未定" })], shelf);
    expect(empty.ratio).toBeNull();
    expect(empty.label).toBe("目安 —");
    expect(empty.unsizedCount).toBe(1);

    const partial = spaceFill([item({ name: "未定" }), sized(40, 30, 20, 1)], shelf);
    expect(partial.unsizedCount).toBe(1);
    expect(partial.sizedCount).toBe(1);
    expect(partial.label).toBe("目安 22%");

    const over = spaceFill([sized(40, 30, 20, 5)], shelf);
    expect(over.label).toBe("目安 111%");
    expect(over.ratio).toBeGreaterThan(1);
  });
});
