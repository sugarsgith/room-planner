import { describe, expect, it } from "vitest";
import { createInitialProject } from "./initial";
import { parseProjectJson, validateProject } from "./schema";
import type { FurnitureItem, Project } from "./types";

function legacyDocument(version: 1 | 2 | 3) {
  const current = createInitialProject();
  return {
    schemaVersion: version,
    app: current.app,
    room: structuredClone(current.room),
    activeLayoutId: current.activeLayoutId,
    layouts: current.layouts.map((layout) => ({
      id: layout.id,
      name: layout.name,
      furniture: layout.placements.map((placement) => {
        const item = current.furniture.find((entry) => entry.id === placement.furnitureId);
        if (!item) throw new Error("missing");
        return {
          id: item.id,
          name: item.name,
          shape: item.shape,
          width: item.width,
          depth: item.depth,
          height: item.height,
          color: item.color,
          x: placement.x,
          z: placement.z,
          rotation: placement.rotation,
          elevation: placement.elevation,
          allowOverlapIds: [...placement.allowOverlapIds],
        };
      }),
    })),
  };
}

function sample(): Project {
  return structuredClone(createInitialProject());
}

describe("import validation", () => {
  it("accepts the initial project and keeps unknown fields", () => {
    const project = sample();
    (project.furniture[0] as FurnitureItem & { note?: string }).note = "将来用";
    const result = validateProject(project);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const bed = result.project.furniture[0] as FurnitureItem & { note?: string };
      expect(bed.note).toBe("将来用");
      expect(result.project).toBe(project);
    }
  });

  it("rejects malformed JSON", () => {
    const result = parseProjectJson("{");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("JSON");
  });

  it("rejects the wrong schema version", () => {
    for (const schemaVersion of [0, 5, "1", "2", null]) {
      const result = validateProject({ ...sample(), schemaVersion });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("schemaVersion");
    }
  });

  it("migrates a version 1 file and keeps the layout", () => {
    const legacy = legacyDocument(1);
    delete (legacy.room as { fixtures?: unknown }).fixtures;
    for (const item of legacy.layouts[0].furniture) delete (item as { elevation?: number }).elevation;
    const result = validateProject(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.schemaVersion).toBe(4);
      expect(result.project.room.fixtures).toEqual([]);
      expect(result.project.baselineLayoutId).toBe("layout-default");
      expect(result.project.layouts[0].placements[0].allowOverlapIds).toEqual([]);
      expect(result.project.furniture.map((item) => item.name)).toEqual([
        "シングルベッド",
        "デスク",
        "2人掛けソファ",
        "丸テーブル",
      ]);
      expect(result.project.layouts[0].placements[0].elevation).toBe(0);
    }
  });

  it("migrates a version 2 file without dropping fixtures", () => {
    const legacy = legacyDocument(2);
    legacy.room.fixtures = [
      {
        id: "pillar-1",
        type: "pillar",
        anchor: { kind: "corner", corner: "back-left" },
        spanX: 0.3,
        spanZ: 0.3,
      },
    ];
    for (const item of legacy.layouts[0].furniture) delete (item as { allowOverlapIds?: string[] }).allowOverlapIds;
    const result = validateProject(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.schemaVersion).toBe(4);
      expect(result.project.room.fixtures).toHaveLength(1);
      expect(result.project.layouts[0].placements[0].allowOverlapIds).toEqual([]);
      expect(result.project.layouts[0].placements[0].x).toBe(legacy.layouts[0].furniture[0].x);
    }
  });

  it("migrates version 3 and splits a catalog item whose dimensions disagree", () => {
    const legacy = legacyDocument(3);
    legacy.layouts.push({
      id: "layout-b",
      name: "検討案B",
      furniture: legacy.layouts[0].furniture.map((item) => ({ ...item, width: item.id === "bed" ? item.width + 0.2 : item.width })),
    });
    const result = validateProject(legacy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const beds = result.project.furniture.filter((item) => item.originId === "bed" || item.id === "bed");
    expect(beds).toHaveLength(2);
    const split = result.project.furniture.find((item) => item.originId === "bed");
    expect(split).toBeTruthy();
    expect(result.project.layouts[1].placements.find((placement) => placement.furnitureId === split!.id)).toBeTruthy();
    expect(result.project.layouts[0].placements.find((placement) => placement.furnitureId === "bed")).toBeTruthy();
  });

  it("rejects negative, zero, NaN, and non-finite dimensions", () => {
    const negative = sample();
    negative.room.width = -1;
    const zero = sample();
    zero.room.depth = 0;
    const nan = sample();
    nan.furniture[0].height = Number.NaN;
    const infinite = sample();
    infinite.room.ceilingHeight = Number.POSITIVE_INFINITY;

    for (const project of [negative, zero, nan, infinite]) {
      const result = validateProject(project);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    }
    const nanResult = validateProject(nan);
    expect(nanResult.ok).toBe(false);
    if (!nanResult.ok) expect(nanResult.error).toContain("NaN");
    const zeroResult = validateProject(zero);
    expect(zeroResult.ok).toBe(false);
    if (!zeroResult.ok) expect(zeroResult.error).toContain("0 より大きい");
  });

  it("rejects unknown furniture and opening types", () => {
    const project = sample();
    project.furniture[1].shape = "mesh" as FurnitureItem["shape"];
    const shape = validateProject(project);
    expect(shape.ok).toBe(false);
    if (!shape.ok) expect(shape.error).toContain("未対応");

    const withOpening = sample();
    withOpening.room.openings = [
      {
        id: "sky",
        type: "skylight" as "door",
        wallIndex: 0,
        offset: 0.2,
        width: 0.8,
        height: 1,
        sillHeight: 0,
      },
    ];
    const opening = validateProject(withOpening);
    expect(opening.ok).toBe(false);
    if (!opening.ok) expect(opening.error).toContain("未対応");
  });

  it("rejects a cylinder whose depth is not the diameter", () => {
    const project = sample();
    project.furniture[3].depth = 1;
    const result = validateProject(project);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("直径");
  });

  it("accepts a valid door opening and rejects an outline that disagrees with the size", () => {
    const project = sample();
    project.room.openings = [
      { id: "door-1", type: "door", wallIndex: 0, offset: 0.4, width: 0.8, height: 2, sillHeight: 0 },
    ];
    expect(validateProject(project).ok).toBe(true);

    project.room.outline = [
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
      { x: 0, z: 1 },
    ];
    const mismatch = validateProject(project);
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error).toContain("outline");
  });
});
