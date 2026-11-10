import { describe, expect, it } from "vitest";
import { analyzeLayout, isOutsideRoom } from "./geometry";
import { rectangleOutline } from "./geometry";
import type { EntranceFixture, Furniture, Room, WindowFixture } from "./types";
import { cmToM } from "./units";

function space(): Room {
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
    width: 0.3,
    depth: 0.3,
    height: 0.4,
    x: 2,
    z: 2,
    rotation: 0,
    color: "#888888",
    ...patch,
  };
}

function backWindow(): WindowFixture {
  return {
    id: "win",
    type: "window",
    wall: "back",
    offset: cmToM(50),
    width: cmToM(165),
    sillHeight: cmToM(90),
    height: cmToM(110),
    recess: cmToM(30),
    style: "sliding",
  };
}

describe("window recess", () => {
  it("allows a footprint in the recess when the sill is at or below the item", () => {
    const room = space();
    room.fixtures = [backWindow()];
    const planted = box({
      id: "plant",
      x: 2.6,
      z: 4.12,
      width: 0.2,
      depth: 0.16,
      height: 0.3,
      elevation: cmToM(90),
    });
    expect(isOutsideRoom(planted, room)).toBe(false);
    const issues = analyzeLayout(room, [planted]);
    expect(issues[0].recessFixtureIds).toEqual([]);
    expect(issues[0].fixtureOverlapIds).toEqual([]);
  });

  it("warns when the recess is used below the sill or above the window head", () => {
    const room = space();
    room.fixtures = [backWindow()];
    const low = box({ id: "low", x: 2.6, z: 4.12, width: 0.2, depth: 0.16, height: 0.3, elevation: 0 });
    const tall = box({ id: "tall", x: 2.6, z: 4.12, width: 0.2, depth: 0.16, height: 1.3, elevation: cmToM(90) });
    expect(isOutsideRoom(low, room)).toBe(true);
    expect(isOutsideRoom(tall, room)).toBe(false);
    const issues = analyzeLayout(room, [low, tall]);
    expect(issues.find((issue) => issue.id === "low")?.recessFixtureIds).toEqual(["win"]);
    expect(issues.find((issue) => issue.id === "tall")?.recessFixtureIds).toEqual(["win"]);
  });

  it("does not treat furniture in front of the glass as an overlap, and notes a tall cover", () => {
    const room = space();
    room.fixtures = [backWindow()];
    const shelf = box({ id: "shelf", x: 2.6, z: 3.55, width: 0.4, depth: 0.3, height: 1.6, elevation: 0 });
    const issues = analyzeLayout(room, [shelf]);
    expect(issues[0].fixtureOverlapIds).toEqual([]);
    expect(issues[0].outOfRoom).toBe(false);
    expect(issues[0].windowNoteIds).toEqual(["win"]);
  });
});

describe("entrance clearance", () => {
  it("warns when furniture sits in front of the opening", () => {
    const room = space();
    const entrance: EntranceFixture = {
      id: "door",
      type: "entrance",
      wall: "front",
      offset: cmToM(100),
      width: cmToM(80),
      height: 2.1,
      door: "none",
      hinge: "left",
      clearance: cmToM(60),
    };
    room.fixtures = [entrance];
    const blocking = box({ id: "block", x: 1.4, z: 0.3, width: 0.4, depth: 0.3, height: 0.8 });
    const clear = box({ id: "clear", x: 1.4, z: 1.4, width: 0.4, depth: 0.3, height: 0.8 });
    const issues = analyzeLayout(room, [blocking, clear]);
    expect(issues.find((issue) => issue.id === "block")?.entranceFixtureIds).toEqual(["door"]);
    expect(issues.find((issue) => issue.id === "clear")?.entranceFixtureIds).toEqual([]);
  });
});

describe("overlap allowance", () => {
  it("suppresses the warning when either item lists the other", () => {
    const room = space();
    const desk = box({ id: "desk", x: 1, z: 1, width: 1, depth: 0.6, height: 0.7 });
    const chair = box({ id: "chair", x: 1.2, z: 1, width: 0.4, depth: 0.4, height: 0.9, allowOverlapIds: ["desk"] });
    const other = box({ id: "other", x: 1.2, z: 1, width: 0.4, depth: 0.4, height: 0.9 });
    const allowed = analyzeLayout(room, [desk, chair]);
    expect(allowed.every((issue) => issue.overlapIds.length === 0)).toBe(true);
    const blocked = analyzeLayout(room, [desk, other]);
    expect(blocked.find((issue) => issue.id === "other")?.overlapIds).toEqual(["desk"]);
    const mutual = analyzeLayout(room, [desk, { ...other, allowOverlapIds: undefined }, { ...chair, allowOverlapIds: undefined, id: "seat" }]);
    const fromDesk = analyzeLayout(room, [{ ...desk, allowOverlapIds: ["seat"] }, { ...chair, id: "seat", allowOverlapIds: [] }]);
    expect(fromDesk.every((issue) => issue.overlapIds.length === 0)).toBe(true);
    expect(mutual.find((issue) => issue.id === "other")?.overlapIds.length).toBeGreaterThan(0);
  });
});
