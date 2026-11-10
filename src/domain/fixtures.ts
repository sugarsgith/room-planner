import type {
  BeamFixture,
  Furniture,
  PillarFixture,
  PlanCorner,
  PlanWall,
  Room,
  RoomFixture,
  StorageDoor,
  StorageFixture,
  WindowFixture,
  EntranceFixture,
} from "./types";

/** Same tolerance as footprint overlap: touching is not a hit. */
const SECTOR_EPS_M = 0.0001;

export interface Aabb {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Point {
  x: number;
  z: number;
}

/** Quarter-disk of a hinged door, in the floor plan. */
export interface Sector {
  hinge: Point;
  /** Unit vector from the hinge along the closed door, toward the free edge. */
  closed: Point;
  /** Unit vector from the hinge into the room. */
  into: Point;
  radius: number;
}

const WALL_ORDER: PlanWall[] = ["front", "right", "back", "left"];

export function isPlanWall(value: unknown): value is PlanWall {
  return value === "back" || value === "right" || value === "front" || value === "left";
}

export function isPlanCorner(value: unknown): value is PlanCorner {
  return value === "back-left" || value === "back-right" || value === "front-left" || value === "front-right";
}

interface WallFrame {
  origin: Point;
  along: Point;
  into: Point;
  length: number;
}

/** CCW outline start, matching openings. `into` points at the room interior. */
export function wallFrame(wall: PlanWall, room: Pick<Room, "width" | "depth">): WallFrame {
  switch (wall) {
    case "front":
      return { origin: { x: 0, z: 0 }, along: { x: 1, z: 0 }, into: { x: 0, z: 1 }, length: room.width };
    case "right":
      return { origin: { x: room.width, z: 0 }, along: { x: 0, z: 1 }, into: { x: -1, z: 0 }, length: room.depth };
    case "back":
      return { origin: { x: room.width, z: room.depth }, along: { x: -1, z: 0 }, into: { x: 0, z: -1 }, length: room.width };
    case "left":
      return { origin: { x: 0, z: room.depth }, along: { x: 0, z: -1 }, into: { x: 1, z: 0 }, length: room.depth };
  }
}

function aabb(minX: number, maxX: number, minZ: number, maxZ: number): Aabb {
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
  };
}

/**
 * Plan box for a pillar or storage.
 * Corner: width/spanX along X, depth/spanZ along Z, grown into the room from that corner.
 * Wall: width along the wall, depth into the room, starting `offset` from the wall start.
 */
export function obstacleFootprint(
  fixture: PillarFixture | StorageFixture,
  room: Pick<Room, "width" | "depth">,
): Aabb | null {
  const span = spansOf(fixture);
  if (!span) return null;
  const { spanX, spanZ } = span;
  const anchor = fixture.anchor;
  if (anchor.kind === "corner") {
    switch (anchor.corner) {
      case "back-left":
        return aabb(0, spanX, room.depth - spanZ, room.depth);
      case "back-right":
        return aabb(room.width - spanX, room.width, room.depth - spanZ, room.depth);
      case "front-left":
        return aabb(0, spanX, 0, spanZ);
      case "front-right":
        return aabb(room.width - spanX, room.width, 0, spanZ);
    }
  }
  const frame = wallFrame(anchor.wall, room);
  const along = anchor.wall === "left" || anchor.wall === "right" ? spanZ : spanX;
  const into = anchor.wall === "left" || anchor.wall === "right" ? spanX : spanZ;
  const x0 = frame.origin.x + frame.along.x * anchor.offset;
  const z0 = frame.origin.z + frame.along.z * anchor.offset;
  const x1 = x0 + frame.along.x * along + frame.into.x * into;
  const z1 = z0 + frame.along.z * along + frame.into.z * into;
  return aabb(x0, x1, z0, z1);
}

function spansOf(fixture: PillarFixture | StorageFixture): { spanX: number; spanZ: number } | null {
  if (fixture.type === "pillar") {
    if (!(fixture.spanX > 0) || !(fixture.spanZ > 0)) return null;
    return { spanX: fixture.spanX, spanZ: fixture.spanZ };
  }
  if (!(fixture.width > 0) || !(fixture.depth > 0)) return null;
  if (fixture.anchor.kind === "corner") return { spanX: fixture.width, spanZ: fixture.depth };
  if (fixture.anchor.wall === "left" || fixture.anchor.wall === "right") {
    return { spanX: fixture.depth, spanZ: fixture.width };
  }
  return { spanX: fixture.width, spanZ: fixture.depth };
}

export function beamFootprints(fixture: BeamFixture, room: Pick<Room, "width" | "depth">): Aabb[] {
  return fixture.walls.map((wall) => {
    const frame = wallFrame(wall, room);
    const x0 = frame.origin.x;
    const z0 = frame.origin.z;
    const x1 = x0 + frame.along.x * frame.length + frame.into.x * fixture.protrusion;
    const z1 = z0 + frame.along.z * frame.length + frame.into.z * fixture.protrusion;
    return aabb(x0, x1, z0, z1);
  });
}

interface DoorFace {
  left: Point;
  right: Point;
  into: Point;
}

/** Door edge ordered from the viewer's left to right when facing the cabinet from inside the room. */
function doorFace(box: Aabb, into: Point): DoorFace {
  if (into.z > 0) {
    return { left: { x: box.maxX, z: box.maxZ }, right: { x: box.minX, z: box.maxZ }, into };
  }
  if (into.z < 0) {
    return { left: { x: box.minX, z: box.minZ }, right: { x: box.maxX, z: box.minZ }, into };
  }
  if (into.x < 0) {
    return { left: { x: box.minX, z: box.maxZ }, right: { x: box.minX, z: box.minZ }, into };
  }
  return { left: { x: box.maxX, z: box.minZ }, right: { x: box.maxX, z: box.maxZ }, into };
}

function intoDirection(fixture: StorageFixture): Point | null {
  const anchor = fixture.anchor;
  if (anchor.kind === "wall") return wallFrame(anchor.wall, { width: 0, depth: 0 }).into;
  if (anchor.corner === "back-left" || anchor.corner === "back-right") return { x: 0, z: -1 };
  return { x: 0, z: 1 };
}

export function storageSectors(fixture: StorageFixture, room: Pick<Room, "width" | "depth">): Sector[] {
  if (fixture.door === "none" || fixture.door === "sliding") return [];
  const box = obstacleFootprint(fixture, room);
  const into = intoDirection(fixture);
  if (!box || !into) return [];
  const face = doorFace(box, into);
  const dx = face.right.x - face.left.x;
  const dz = face.right.z - face.left.z;
  const width = Math.hypot(dx, dz);
  if (width < 1e-8) return [];
  const closed = { x: dx / width, z: dz / width };
  const reversed = { x: -closed.x, z: -closed.z };
  if (fixture.door === "double") {
    const radius = width / 2;
    return [
      { hinge: face.left, closed, into, radius },
      { hinge: face.right, closed: reversed, into, radius },
    ];
  }
  if (fixture.hinge === "right") {
    return [{ hinge: face.right, closed: reversed, into, radius: width }];
  }
  return [{ hinge: face.left, closed, into, radius: width }];
}

export function pointInSector(point: Point, sector: Sector, eps = SECTOR_EPS_M): boolean {
  const vx = point.x - sector.hinge.x;
  const vz = point.z - sector.hinge.z;
  const along = vx * sector.closed.x + vz * sector.closed.z;
  const inward = vx * sector.into.x + vz * sector.into.z;
  if (along < -eps || inward < -eps) return false;
  return along * along + inward * inward <= sector.radius * sector.radius + eps;
}

export function arcPoints(sector: Sector, steps = 16): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2);
    const c = Math.cos(t);
    const s = Math.sin(t);
    points.push({
      x: sector.hinge.x + sector.radius * (c * sector.closed.x + s * sector.into.x),
      z: sector.hinge.z + sector.radius * (c * sector.closed.z + s * sector.into.z),
    });
  }
  return points;
}

export function fixtureLabel(fixture: RoomFixture): string {
  if (fixture.type === "pillar") return `柱（${anchorLabel(fixture.anchor)}）`;
  if (fixture.type === "storage") return `備え付け収納（${anchorLabel(fixture.anchor)}）`;
  if (fixture.type === "window") return `窓（${wallLabel(fixture.wall)}）`;
  if (fixture.type === "entrance") return `入口（${wallLabel(fixture.wall)}）`;
  return `天井の梁（${fixture.walls.map(wallLabel).join("・")}）`;
}

/** Where “始点から” is measured, matching the outline walk used by every wall fixture. */
export function wallStartLabel(wall: PlanWall): string {
  switch (wall) {
    case "back":
      return "右端から";
    case "front":
      return "左端から";
    case "right":
      return "手前から";
    case "left":
      return "奥から";
  }
}

export interface OpeningPlacement {
  start: Point;
  end: Point;
  into: Point;
  outward: Point;
}

export function openingPlacement(
  wall: PlanWall,
  offset: number,
  width: number,
  room: Pick<Room, "width" | "depth">,
): OpeningPlacement | null {
  if (!(width > 0)) return null;
  const frame = wallFrame(wall, room);
  const start = {
    x: frame.origin.x + frame.along.x * offset,
    z: frame.origin.z + frame.along.z * offset,
  };
  const end = {
    x: frame.origin.x + frame.along.x * (offset + width),
    z: frame.origin.z + frame.along.z * (offset + width),
  };
  return { start, end, into: frame.into, outward: { x: -frame.into.x, z: -frame.into.z } };
}

export function extrudedAabb(place: OpeningPlacement, depth: number, direction: Point): Aabb | null {
  if (!(depth > 0)) return null;
  const farA = { x: place.start.x + direction.x * depth, z: place.start.z + direction.z * depth };
  const farB = { x: place.end.x + direction.x * depth, z: place.end.z + direction.z * depth };
  return aabb(
    Math.min(place.start.x, place.end.x, farA.x, farB.x),
    Math.max(place.start.x, place.end.x, farA.x, farB.x),
    Math.min(place.start.z, place.end.z, farA.z, farB.z),
    Math.max(place.start.z, place.end.z, farA.z, farB.z),
  );
}

export function windowRecess(fixture: WindowFixture, room: Pick<Room, "width" | "depth">): Aabb | null {
  const place = openingPlacement(fixture.wall, fixture.offset, fixture.width, room);
  if (!place) return null;
  return extrudedAabb(place, fixture.recess, place.outward);
}

/** Interior floor in front of an opening, `depth` meters into the room. */
export function openingFront(wall: PlanWall, offset: number, width: number, depth: number, room: Pick<Room, "width" | "depth">): Aabb | null {
  const place = openingPlacement(wall, offset, width, room);
  if (!place) return null;
  return extrudedAabb(place, depth, place.into);
}

/** How far inside the room a tall item counts as covering a window. */
export const WINDOW_NOTE_DEPTH_M = 0.6;

export function entranceSectors(fixture: EntranceFixture, room: Pick<Room, "width" | "depth">): Sector[] {
  if (fixture.door !== "single") return [];
  const place = openingPlacement(fixture.wall, fixture.offset, fixture.width, room);
  if (!place) return [];
  // Along the wall frame, the far end is the viewer's left when facing the wall from inside.
  const left = place.end;
  const right = place.start;
  const dx = right.x - left.x;
  const dz = right.z - left.z;
  const span = Math.hypot(dx, dz);
  if (span < 1e-8) return [];
  const closed = { x: dx / span, z: dz / span };
  const reversed = { x: -closed.x, z: -closed.z };
  if (fixture.hinge === "right") {
    return [{ hinge: right, closed: reversed, into: place.into, radius: span }];
  }
  return [{ hinge: left, closed, into: place.into, radius: span }];
}

export interface WallSolid {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
}

/** Wall volumes with window and entrance holes removed. Thickness sits outside the interior. */
export function wallSolids(room: Pick<Room, "width" | "depth" | "ceilingHeight" | "fixtures">, thickness = 0.08): WallSolid[] {
  const walls: PlanWall[] = ["front", "right", "back", "left"];
  const solids: WallSolid[] = [];
  for (const wall of walls) {
    const frame = wallFrame(wall, room);
    const holes = (room.fixtures ?? []).flatMap((fixture) => {
      if (fixture.type === "window" && fixture.wall === wall) {
        return [{ t0: fixture.offset, t1: fixture.offset + fixture.width, y0: fixture.sillHeight, y1: fixture.sillHeight + fixture.height }];
      }
      if (fixture.type === "entrance" && fixture.wall === wall) {
        return [{ t0: fixture.offset, t1: fixture.offset + fixture.width, y0: 0, y1: fixture.height }];
      }
      return [];
    });
    for (const piece of subtractHoles(frame.length, room.ceilingHeight, holes)) {
      const midT = (piece.t0 + piece.t1) / 2;
      const outward = { x: -frame.into.x, z: -frame.into.z };
      const cx = frame.origin.x + frame.along.x * midT + outward.x * (thickness / 2);
      const cz = frame.origin.z + frame.along.z * midT + outward.z * (thickness / 2);
      const alongLen = piece.t1 - piece.t0;
      const horizontal = wall === "front" || wall === "back";
      solids.push({
        cx,
        cy: (piece.y0 + piece.y1) / 2,
        cz,
        sx: horizontal ? alongLen : thickness,
        sy: piece.y1 - piece.y0,
        sz: horizontal ? thickness : alongLen,
      });
    }
  }
  return solids.filter((solid) => solid.sx > 1e-4 && solid.sy > 1e-4 && solid.sz > 1e-4);
}

function subtractHoles(
  length: number,
  ceiling: number,
  holes: { t0: number; t1: number; y0: number; y1: number }[],
): { t0: number; t1: number; y0: number; y1: number }[] {
  const clipped = holes
    .map((hole) => ({
      t0: Math.max(0, Math.min(length, hole.t0)),
      t1: Math.max(0, Math.min(length, hole.t1)),
      y0: Math.max(0, Math.min(ceiling, hole.y0)),
      y1: Math.max(0, Math.min(ceiling, hole.y1)),
    }))
    .filter((hole) => hole.t1 - hole.t0 > 1e-4 && hole.y1 - hole.y0 > 1e-4);
  const marks = [0, length];
  for (const hole of clipped) marks.push(hole.t0, hole.t1);
  const unique = [...new Set(marks.map((value) => Math.round(value * 10000) / 10000))].sort((a, b) => a - b);
  const pieces: { t0: number; t1: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const t0 = unique[i];
    const t1 = unique[i + 1];
    if (t1 - t0 < 1e-4) continue;
    const mid = (t0 + t1) / 2;
    const covering = clipped.filter((hole) => mid > hole.t0 && mid < hole.t1).sort((a, b) => a.y0 - b.y0);
    let cursor = 0;
    for (const hole of covering) {
      if (hole.y0 - cursor > 1e-4) pieces.push({ t0, t1, y0: cursor, y1: hole.y0 });
      cursor = Math.max(cursor, hole.y1);
    }
    if (ceiling - cursor > 1e-4) pieces.push({ t0, t1, y0: cursor, y1: ceiling });
  }
  return pieces;
}

export function anchorLabel(anchor: PillarFixture["anchor"]): string {
  if (anchor.kind === "corner") return cornerLabel(anchor.corner);
  return `壁の途中・${wallLabel(anchor.wall)}`;
}

export function cornerLabel(corner: PlanCorner): string {
  switch (corner) {
    case "back-left":
      return "左上";
    case "back-right":
      return "右上";
    case "front-left":
      return "左下";
    case "front-right":
      return "右下";
  }
}

export function wallLabel(wall: PlanWall): string {
  switch (wall) {
    case "back":
      return "上";
    case "right":
      return "右";
    case "front":
      return "下";
    case "left":
      return "左";
  }
}

export function doorLabel(door: StorageDoor): string {
  switch (door) {
    case "none":
      return "なし";
    case "single":
      return "片開き";
    case "double":
      return "両開き";
    case "sliding":
      return "引き戸";
  }
}

const CORNERS: PlanCorner[] = ["back-left", "back-right", "front-left", "front-right"];
export const PLAN_CORNERS = CORNERS;
export const PLAN_WALLS = WALL_ORDER;

function insideRoom(box: Aabb, room: Pick<Room, "width" | "depth">, eps = 0.001): boolean {
  return box.minX >= -eps && box.minZ >= -eps && box.maxX <= room.width + eps && box.maxZ <= room.depth + eps;
}

/** Japanese error for a fixture that cannot be stored, or null when it is usable. */
export function fixtureError(fixture: RoomFixture, room: Pick<Room, "width" | "depth" | "ceilingHeight">): string | null {
  if (fixture.type === "beam") return beamError(fixture, room);
  if (fixture.type === "window") return windowError(fixture, room);
  if (fixture.type === "entrance") return entranceError(fixture, room);
  if (fixture.type === "pillar") return boxError("柱", fixture, room, null);
  return boxError("備え付け収納", fixture, room, fixture.height);
}

function fitsOnWall(name: string, wall: PlanWall, offset: number, width: number, room: Pick<Room, "width" | "depth">): string | null {
  const frame = wallFrame(wall, room);
  if (offset < -1e-6) return `${name}の位置が壁の始点より手前です。`;
  if (offset + width > frame.length + 0.001) return `${name}が壁の長さを超えています。`;
  return null;
}

function windowError(fixture: WindowFixture, room: Pick<Room, "width" | "depth" | "ceilingHeight">): string | null {
  if (!(fixture.width > 0) || !(fixture.height > 0)) return "窓の幅と高さは正の数である必要があります。";
  if (fixture.sillHeight < 0 || fixture.recess < 0) return "窓の下端と出幅は 0 以上である必要があります。";
  if (fixture.sillHeight + fixture.height > room.ceilingHeight + 0.001) return "窓が天井を超えています。";
  return fitsOnWall("窓", fixture.wall, fixture.offset, fixture.width, room);
}

function entranceError(fixture: EntranceFixture, room: Pick<Room, "width" | "depth" | "ceilingHeight">): string | null {
  if (!(fixture.width > 0) || !(fixture.height > 0)) return "入口の幅と高さは正の数である必要があります。";
  if (fixture.clearance < 0) return "入口前の空きは 0 以上である必要があります。";
  if (fixture.height > room.ceilingHeight + 0.001) return "入口の高さが天井を超えています。";
  return fitsOnWall("入口", fixture.wall, fixture.offset, fixture.width, room);
}

function boxError(
  name: string,
  fixture: PillarFixture | StorageFixture,
  room: Pick<Room, "width" | "depth" | "ceilingHeight">,
  height: number | null,
): string | null {
  const span = spansOf(fixture);
  if (!span) return `${name}の寸法は正の数である必要があります。`;
  if (height !== null) {
    if (!(height > 0)) return `${name}の高さは正の数である必要があります。`;
    if (height >= room.ceilingHeight - 1e-6) return `${name}の高さは天井より低くしてください。`;
  }
  const anchor = fixture.anchor;
  if (anchor.kind === "wall") {
    const frame = wallFrame(anchor.wall, room);
    const along = anchor.wall === "left" || anchor.wall === "right" ? span.spanZ : span.spanX;
    if (anchor.offset < -1e-6) return `${name}の位置が壁の始点より手前です。`;
    if (anchor.offset + along > frame.length + 0.001) return `${name}が壁の長さを超えています。`;
  }
  const box = obstacleFootprint(fixture, room);
  if (!box || !insideRoom(box, room)) return `${name}が部屋の外にはみ出しています。`;
  return null;
}

function beamError(fixture: BeamFixture, room: Pick<Room, "width" | "depth" | "ceilingHeight">): string | null {
  if (fixture.walls.length === 0) return "梁を付ける壁を1つ以上選んでください。";
  if (new Set(fixture.walls).size !== fixture.walls.length) return "梁の壁が重複しています。";
  if (!(fixture.protrusion > 0) || !(fixture.drop > 0)) return "梁の寸法は正の数である必要があります。";
  if (fixture.drop >= room.ceilingHeight - 1e-6) return "梁の下がりは天井高より小さくしてください。";
  const boxes = beamFootprints(fixture, room);
  if (boxes.some((box) => !insideRoom(box, room))) return "梁が部屋の外にはみ出しています。";
  return null;
}

export function furnitureBottom(item: Pick<Furniture, "elevation">): number {
  return item.elevation ?? 0;
}

export function furnitureTop(item: Pick<Furniture, "elevation" | "height">): number {
  return furnitureBottom(item) + item.height;
}
