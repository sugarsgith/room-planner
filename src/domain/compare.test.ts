import { describe, expect, it } from "vitest";
import { compareLayouts } from "./compare";
import { createInitialProject } from "./initial";
import { cmToM } from "./units";
import type { Project } from "./types";

function withVariant(mutate: (project: Project) => void): Project {
  const project = createInitialProject();
  project.layouts.push({
    id: "layout-b",
    name: "検討案A",
    placements: project.layouts[0].placements.map((placement) => ({ ...placement, allowOverlapIds: [...placement.allowOverlapIds] })),
  });
  mutate(project);
  return project;
}

describe("layout comparison", () => {
  it("classifies a move, a rotation, an addition, and a removal", () => {
    const project = withVariant((draft) => {
      const variant = draft.layouts[1];
      const sofa = variant.placements.find((placement) => placement.furnitureId === "sofa");
      if (!sofa) throw new Error("sofa");
      sofa.x = cmToM(120);
      const desk = variant.placements.find((placement) => placement.furnitureId === "desk");
      if (!desk) throw new Error("desk");
      desk.rotation = 0;
      variant.placements = variant.placements.filter((placement) => placement.furnitureId !== "table");
      draft.furniture.push({
        id: "lamp",
        name: "ランプ",
        shape: "cylinder",
        width: 0.3,
        depth: 0.3,
        height: 0.4,
        color: "#888888",
      });
      variant.placements.push({
        furnitureId: "lamp",
        x: 1,
        z: 1,
        rotation: 0,
        elevation: 0,
        allowOverlapIds: [],
      });
    });
    const comparison = compareLayouts(project, "layout-default", "layout-b");
    const status = (id: string) => comparison.entries.find((entry) => entry.furnitureId === id)?.status;
    expect(status("sofa")).toBe("moved");
    expect(status("desk")).toBe("rotated");
    expect(status("table")).toBe("removed");
    expect(status("lamp")).toBe("added");
    expect(status("bed")).toBe("same");
  });

  it("labels a split catalog pair as 別家具 instead of add and remove", () => {
    const project = createInitialProject();
    const original = project.furniture.find((item) => item.id === "bed");
    if (!original) throw new Error("bed");
    project.furniture.push({ ...original, id: "bed#2", originId: "bed", width: original.width + 0.2 });
    project.layouts.push({
      id: "layout-b",
      name: "検討案A",
      placements: project.layouts[0].placements.map((placement) =>
        placement.furnitureId === "bed"
          ? { ...placement, furnitureId: "bed#2" }
          : { ...placement, allowOverlapIds: [...placement.allowOverlapIds] },
      ),
    });
    const comparison = compareLayouts(project, "layout-default", "layout-b");
    expect(comparison.entries.some((entry) => entry.status === "split")).toBe(true);
    expect(comparison.entries.some((entry) => entry.furnitureId === "bed" && entry.status === "removed")).toBe(false);
    expect(comparison.entries.some((entry) => entry.furnitureId === "bed#2" && entry.status === "added")).toBe(false);
  });

  it("compares active issue counts", () => {
    const project = withVariant((draft) => {
      const sofa = draft.layouts[1].placements.find((placement) => placement.furnitureId === "sofa");
      const desk = draft.layouts[1].placements.find((placement) => placement.furnitureId === "desk");
      if (!sofa || !desk) throw new Error("missing");
      sofa.x = desk.x;
      sofa.z = desk.z;
    });
    const comparison = compareLayouts(project, "layout-default", "layout-b");
    expect(comparison.issues.left).toBe(0);
    expect(comparison.issues.right).toBeGreaterThan(0);
    expect(comparison.clearance.right).toBe(0);
    expect(comparison.clearance.left).not.toBe(0);
  });
});
