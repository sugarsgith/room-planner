import { describe, expect, it } from "vitest";
import { childItems, directItems, innerSpace, isContainer, itemPath, parentContainer, sanitizeStoredItem } from "./containers";
import { fitStoredItem, spaceFill } from "./storageFit";
import { cmToM } from "./units";
import type { StorageSpace, StoredItem } from "./types";

function space(): StorageSpace {
  return { id: "under-bed", name: "ベッド下", width: cmToM(90), depth: cmToM(190), height: cmToM(20), note: "" };
}

function fits(): StoredItem {
  return {
    id: "fits",
    name: "FITS",
    quantity: 1,
    spaceId: "under-bed",
    note: "",
    width: cmToM(40),
    depth: cmToM(30),
    height: cmToM(15),
    innerWidth: cmToM(35),
    innerDepth: cmToM(25),
    innerHeight: cmToM(12),
  };
}

function clothes(partial: Partial<StoredItem> = {}): StoredItem {
  return {
    id: "clothes",
    name: "冬服",
    quantity: 1,
    spaceId: "under-bed",
    note: "",
    width: cmToM(30),
    depth: cmToM(20),
    height: cmToM(5),
    containerId: "fits",
    ...partial,
  };
}

describe("containers", () => {
  const items = [fits(), clothes()];

  it("nests one level and names the path", () => {
    expect(isContainer(fits())).toBe(true);
    expect(isContainer(clothes())).toBe(false);
    expect(parentContainer(clothes(), items)?.name).toBe("FITS");
    expect(directItems("under-bed", items).map((item) => item.id)).toEqual(["fits"]);
    expect(childItems(fits(), items).map((item) => item.name)).toEqual(["冬服"]);
    expect(itemPath(clothes(), items, "ベッド下")).toBe("冬服 / FITS（ベッド下）");
    expect(itemPath(fits(), items, "ベッド下")).toBe("FITS（ベッド下）");
  });

  it("checks clothes against the inner size, and does not count them twice in the space", () => {
    const inside = innerSpace(fits());
    expect(inside).toBeTruthy();
    expect(fitStoredItem(clothes(), inside!, "入れ物").label).toBe("入る");
    const tooBig = clothes({ width: cmToM(40), depth: cmToM(30), height: cmToM(10) });
    expect(fitStoredItem(tooBig, space()).label).toBe("入る");
    expect(fitStoredItem(tooBig, inside!, "入れ物").label).toBe("入らない");

    const bed = spaceFill(directItems("under-bed", items), space());
    const box = spaceFill(childItems(fits(), items), inside!);
    expect(bed.label).toBe("目安 5%");
    expect(box.label).toBe("目安 29%");
  });

  it("refuses a second level, a cycle, and a container whose count is not 1", () => {
    const nestedBox = clothes({
      id: "inner-box",
      name: "小箱",
      innerWidth: cmToM(10),
      innerDepth: cmToM(10),
      innerHeight: cmToM(10),
    });
    expect(isContainer(nestedBox)).toBe(false);
    expect(sanitizeStoredItem(nestedBox, items).innerWidth).toBeUndefined();

    const cycle = sanitizeStoredItem({ ...fits(), containerId: "clothes" }, [fits(), clothes()]);
    expect(cycle.containerId).toBeUndefined();

    const many = sanitizeStoredItem({ ...fits(), quantity: 2 }, items);
    expect(many.innerWidth).toBeUndefined();
    expect(isContainer(many)).toBe(false);

    const missing = clothes({ containerId: "gone" });
    expect(parentContainer(missing, [fits(), missing])).toBeNull();
    expect(directItems("under-bed", [fits(), missing]).map((item) => item.id)).toContain("clothes");
  });
});
