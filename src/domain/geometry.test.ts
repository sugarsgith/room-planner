import { describe, expect, it } from "vitest";
import type { Furniture, Room } from "./types";
import { createInitialProject } from "./initial";
import { mToCm } from "./units";
import {
  analyzeLayout,
  exceedsCeiling,
  footprintCorners,
  footprintsOverlap,
  isOutsideRoom,
  rectangleOutline,
  wallSegments,
} from "./geometry";

function box(patch: Partial<Furniture> & Pick<Furniture, "id">): Furniture {
  return {
    name: patch.id,
    shape: "box",
    width: 1,
    depth: 1,
    height: 1,
    x: 0,
    z: 0,
    rotation: 0,
    color: "#888888",
    ...patch,
  };
}

function room(width = 4, depth = 4, ceiling = 2.4): Room {
  return {
    id: "r",
    name: "r",
    width,
    depth,
    ceilingHeight: ceiling,
    outline: rectangleOutline(width, depth),
    openings: [],
  };
}

describe("rotated footprints", () => {
  it("keeps an axis-aligned box on its width and depth", () => {
    const corners = footprintCorners(box({ id: "a", width: 2, depth: 0.4 }));
    expect(Math.max(...corners.map((p) => p.x))).toBeCloseTo(1, 5);
    expect(Math.min(...corners.map((p) => p.x))).toBeCloseTo(-1, 5);
    expect(Math.max(...corners.map((p) => p.z))).toBeCloseTo(0.2, 5);
    expect(Math.min(...corners.map((p) => p.z))).toBeCloseTo(-0.2, 5);
  });

  it("swaps width and depth at 90 degrees clockwise", () => {
    const corners = footprintCorners(box({ id: "a", width: 2, depth: 0.4, rotation: 90 }));
    expect(Math.max(...corners.map((p) => p.x))).toBeCloseTo(0.2, 5);
    expect(Math.min(...corners.map((p) => p.x))).toBeCloseTo(-0.2, 5);
    expect(Math.max(...corners.map((p) => p.z))).toBeCloseTo(1, 5);
    expect(Math.min(...corners.map((p) => p.z))).toBeCloseTo(-1, 5);
  });
});

describe("overlap", () => {
  it("treats touching edges as separate and a 1 cm bite as overlap", () => {
    const left = box({ id: "a" });
    const touching = box({ id: "b", x: 1 });
    const biting = box({ id: "c", x: 0.99 });
    expect(footprintsOverlap(left, touching)).toBe(false);
    expect(footprintsOverlap(left, biting)).toBe(true);
  });

  it("detects a rotated plank crossing another and ignores it when moved aside", () => {
    const horizontal = box({ id: "h", width: 2, depth: 0.2 });
    const vertical = box({ id: "v", width: 2, depth: 0.2, rotation: 90 });
    const aside = box({ id: "s", width: 2, depth: 0.2, rotation: 90, x: 2 });
    expect(footprintsOverlap(horizontal, vertical)).toBe(true);
    expect(footprintsOverlap(horizontal, aside)).toBe(false);
  });

  it("detects circle-circle and circle-box overlaps including rotation", () => {
    const circle = box({ id: "c", shape: "cylinder", width: 0.6, depth: 0.6 });
    const far = box({ id: "f", shape: "cylinder", width: 0.6, depth: 0.6, x: 0.6 });
    const near = box({ id: "n", shape: "cylinder", width: 0.6, depth: 0.6, x: 0.5 });
    expect(footprintsOverlap(circle, far)).toBe(false);
    expect(footprintsOverlap(circle, near)).toBe(true);

    const plank = box({ id: "p", width: 2, depth: 0.2, x: 0, z: 1.2, rotation: 0 });
    const turned = { ...plank, id: "t", rotation: 90 };
    expect(footprintsOverlap(circle, plank)).toBe(false);
    expect(footprintsOverlap(circle, turned)).toBe(true);
  });
});

describe("room bounds", () => {
  const space = room(3, 3, 2.4);

  it("accepts a box flush with the walls and rejects one past them", () => {
    expect(isOutsideRoom(box({ id: "in", x: 0.5, z: 0.5 }), space)).toBe(false);
    expect(isOutsideRoom(box({ id: "edge", x: 0.5, z: 0.5, width: 1, depth: 1 }), room(1, 1))).toBe(false);
    expect(isOutsideRoom(box({ id: "out", x: 0, z: 0.5 }), space)).toBe(true);
  });

  it("uses the rotated corners, not the unrotated box", () => {
    const inside = box({ id: "in", width: 2, depth: 0.2, rotation: 90, x: 1, z: 1 });
    const poking = box({ id: "out", width: 2, depth: 0.2, rotation: 90, x: 0.05, z: 1 });
    expect(isOutsideRoom(inside, space)).toBe(false);
    expect(isOutsideRoom(poking, space)).toBe(true);
  });

  it("keeps a circle inside only when the whole diameter fits", () => {
    const inside = box({ id: "in", shape: "cylinder", width: 0.6, depth: 0.6, x: 1, z: 1 });
    const outside = box({ id: "out", shape: "cylinder", width: 0.6, depth: 0.6, x: 0.2, z: 0.2 });
    expect(isOutsideRoom(inside, space)).toBe(false);
    expect(isOutsideRoom(outside, space)).toBe(true);
  });

  it("flags furniture taller than the ceiling", () => {
    expect(exceedsCeiling(box({ id: "low", height: 2.4 }), 2.4)).toBe(false);
    expect(exceedsCeiling(box({ id: "tall", height: 2.5 }), 2.4)).toBe(true);
  });
});

describe("initial layout and walls", () => {
  it("places the sample furniture inside a 270 x 360 cm room without overlaps", () => {
    const project = createInitialProject();
    expect(mToCm(project.room.width)).toBe(270);
    expect(mToCm(project.room.depth)).toBe(360);
    expect(mToCm(project.room.ceilingHeight)).toBe(240);
    const items = project.layouts[0].furniture;
    expect(items.map((item) => item.name)).toEqual(["シングルベッド", "デスク", "2人掛けソファ", "丸テーブル"]);
    const issues = analyzeLayout(project.room, items);
    expect(issues.every((issue) => !issue.outOfRoom && !issue.exceedsCeiling && issue.overlapIds.length === 0)).toBe(true);
  });

  it("puts wall thickness outside the interior rectangle", () => {
    const segments = wallSegments(rectangleOutline(2.7, 3.6), 0.08);
    expect(segments).toHaveLength(4);
    const front = segments[0];
    expect(front.length).toBeCloseTo(2.7, 5);
    expect(front.cx).toBeCloseTo(1.35, 5);
    expect(front.cz).toBeCloseTo(-0.04, 5);
    expect(front.angle).toBeCloseTo(0, 5);
    const right = segments[1];
    expect(right.length).toBeCloseTo(3.6, 5);
    expect(right.cx).toBeCloseTo(2.74, 5);
    expect(right.cz).toBeCloseTo(1.8, 5);
  });
});
