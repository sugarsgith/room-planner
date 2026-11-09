import { describe, expect, it } from "vitest";
import { createInitialProject } from "./initial";
import { parseProjectJson, validateProject } from "./schema";
import type { Furniture, Project } from "./types";

function sample(): Project {
  return structuredClone(createInitialProject());
}

describe("import validation", () => {
  it("accepts the initial project and keeps unknown fields", () => {
    const project = sample();
    (project.layouts[0].furniture[0] as Furniture & { note?: string }).note = "将来用";
    const result = validateProject(project);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const bed = result.project.layouts[0].furniture[0] as Furniture & { note?: string };
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
    for (const schemaVersion of [0, 3, "1", "2", null]) {
      const result = validateProject({ ...sample(), schemaVersion });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("schemaVersion");
    }
  });

  it("migrates a version 1 file and keeps the layout", () => {
    const legacy = sample();
    legacy.schemaVersion = 1;
    delete (legacy.room as { fixtures?: unknown }).fixtures;
    for (const item of legacy.layouts[0].furniture) delete item.elevation;
    const result = validateProject(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.schemaVersion).toBe(2);
      expect(result.project.room.fixtures).toEqual([]);
      expect(result.project.layouts[0].furniture.map((item) => item.name)).toEqual([
        "シングルベッド",
        "デスク",
        "2人掛けソファ",
        "丸テーブル",
      ]);
      expect(result.project.layouts[0].furniture[0].elevation).toBe(0);
      expect(result.project.layouts[0].furniture[0].x).toBe(legacy.layouts[0].furniture[0].x);
    }
  });

  it("rejects negative, zero, NaN, and non-finite dimensions", () => {
    const negative = sample();
    negative.room.width = -1;
    const zero = sample();
    zero.room.depth = 0;
    const nan = sample();
    nan.layouts[0].furniture[0].height = Number.NaN;
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
    (project.layouts[0].furniture[1] as Furniture).shape = "mesh" as Furniture["shape"];
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
    project.layouts[0].furniture[3].depth = 1;
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
