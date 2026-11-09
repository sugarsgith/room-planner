import { describe, expect, it } from "vitest";
import { obstacleFootprint, storageSectors } from "./fixtures";
import { analyzeLayout, rectangleOutline } from "./geometry";
import type { Furniture, Room, StorageFixture } from "./types";
import { mmToM } from "./units";

function room(): Room {
  return {
    id: "r",
    name: "部屋",
    width: 4,
    depth: 4,
    ceilingHeight: 2.4,
    outline: rectangleOutline(4, 4),
    openings: [],
    fixtures: [],
  };
}

function box(patch: Partial<Furniture> & Pick<Furniture, "id">): Furniture {
  return {
    name: patch.id,
    shape: "box",
    width: 0.4,
    depth: 0.4,
    height: 0.5,
    x: 2,
    z: 2,
    rotation: 0,
    color: "#888888",
    ...patch,
  };
}

describe("fixture geometry", () => {
  it("places a back-left pillar using 横 and 縦", () => {
    const space = room();
    const box = obstacleFootprint(
      {
        id: "p",
        type: "pillar",
        anchor: { kind: "corner", corner: "back-left" },
        spanX: mmToM(300),
        spanZ: mmToM(300),
      },
      space,
    );
    expect(box).toEqual({ minX: 0, maxX: 0.3, minZ: 3.7, maxZ: 4 });
  });

  it("warns for a door swing and not for a point outside the quarter disk", () => {
    const space = room();
    const storage: StorageFixture = {
      id: "cupboard",
      type: "storage",
      anchor: { kind: "corner", corner: "front-left" },
      width: 0.9,
      depth: 0.45,
      height: 1.8,
      door: "double",
      hinge: "left",
    };
    space.fixtures = [storage];
    const sectors = storageSectors(storage, space);
    expect(sectors).toHaveLength(2);
    expect(sectors[0].radius).toBeCloseTo(0.45, 5);

    const inside = box({ id: "in", x: 0.7, z: 0.6, width: 0.2, depth: 0.2, height: 0.4 });
    const clear = box({ id: "out", x: 2.5, z: 2.5, width: 0.3, depth: 0.3, height: 0.4 });
    const issues = analyzeLayout(space, [inside, clear]);
    expect(issues.find((issue) => issue.id === "in")?.swingFixtureIds).toEqual(["cupboard"]);
    expect(issues.find((issue) => issue.id === "out")?.swingFixtureIds).toEqual([]);
  });

  it("lets furniture sit on storage without an overlap, and blocks anything lower", () => {
    const space = room();
    space.fixtures = [
      {
        id: "cupboard",
        type: "storage",
        anchor: { kind: "corner", corner: "front-left" },
        width: 0.9,
        depth: 0.45,
        height: 1.8,
        door: "none",
        hinge: "left",
      },
    ];
    const onTop = box({
      id: "top",
      x: 0.45,
      z: 0.2,
      width: 0.3,
      depth: 0.2,
      height: 0.3,
      elevation: 1.8,
    });
    const tooLow = { ...onTop, id: "low", elevation: 1.7 };
    const issues = analyzeLayout(space, [onTop, tooLow]);
    expect(issues.find((issue) => issue.id === "top")?.fixtureOverlapIds).toEqual([]);
    expect(issues.find((issue) => issue.id === "low")?.fixtureOverlapIds).toEqual(["cupboard"]);
    expect(issues.find((issue) => issue.id === "top")?.exceedsCeiling).toBe(false);
  });

  it("warns when furniture enters a ceiling beam and ignores pieces that stay below it", () => {
    const space = room();
    space.fixtures = [
      {
        id: "beam",
        type: "beam",
        walls: ["back", "right", "left"],
        protrusion: mmToM(300),
        drop: mmToM(300),
      },
    ];
    const tall = box({ id: "tall", x: 0.15, z: 2, width: 0.2, depth: 0.2, height: 2.2 });
    const short = box({ id: "short", x: 0.15, z: 2, width: 0.2, depth: 0.2, height: 1.5 });
    const away = box({ id: "away", x: 2, z: 2, width: 0.2, depth: 0.2, height: 2.3 });
    const issues = analyzeLayout(space, [tall, short, away]);
    expect(issues.find((issue) => issue.id === "tall")?.beamFixtureIds).toEqual(["beam"]);
    expect(issues.find((issue) => issue.id === "short")?.beamFixtureIds).toEqual([]);
    expect(issues.find((issue) => issue.id === "away")?.beamFixtureIds).toEqual([]);
  });
});
