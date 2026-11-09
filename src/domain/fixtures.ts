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
  return `天井の梁（${fixture.walls.map(wallLabel).join("・")}）`;
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
  if (fixture.type === "pillar") return boxError("柱", fixture, room, null);
  return boxError("備え付け収納", fixture, room, fixture.height);
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
