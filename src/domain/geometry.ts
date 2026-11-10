import {
  beamFootprints,
  furnitureBottom,
  furnitureTop,
  obstacleFootprint,
  pointInSector,
  storageSectors,
  type Aabb,
  type Sector,
} from "./fixtures";
import type { Furniture, Room, RoomFixture, Vec2 } from "./types";

/**
 * Rotation is clockwise degrees when looking down from +Y.
 * Screen / SVG with +X right and +Z down uses the same clockwise sense.
 *
 * A local point (lx, lz) maps to world offset:
 *   x = lx * cos θ - lz * sin θ
 *   z = lx * sin θ + lz * cos θ
 * where θ is the stored clockwise angle.
 * Three.js rotation.y must be -θ (radians) because +Y rotation is
 * counter-clockwise from above.
 *
 * Touching edges are NOT overlaps. EPS is 0.01 cm, finer than the 0.1 cm UI grid.
 */
export const OVERLAP_EPSILON_M = 0.0001;

export interface Point {
  x: number;
  z: number;
}

export function rectangleOutline(width: number, depth: number): Vec2[] {
  return [
    { x: 0, z: 0 },
    { x: width, z: 0 },
    { x: width, z: depth },
    { x: 0, z: depth },
  ];
}

export function rotateLocal(lx: number, lz: number, rotationDeg: number): Point {
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: lx * cos - lz * sin,
    z: lx * sin + lz * cos,
  };
}

export function footprintCorners(item: Pick<Furniture, "x" | "z" | "width" | "depth" | "rotation">): Point[] {
  const hw = item.width / 2;
  const hd = item.depth / 2;
  const local: Point[] = [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ];
  return local.map((p) => {
    const r = rotateLocal(p.x, p.z, item.rotation);
    return { x: item.x + r.x, z: item.z + r.z };
  });
}

function worldToLocal(dx: number, dz: number, rotationDeg: number): Point {
  const theta = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    x: dx * cos + dz * sin,
    z: -dx * sin + dz * cos,
  };
}

function projectionsOverlap(
  minA: number,
  maxA: number,
  minB: number,
  maxB: number,
  eps: number,
): boolean {
  if (maxA <= minB + eps || maxB <= minA + eps) return false;
  return true;
}

function polygonsOverlap(a: Point[], b: Point[], eps: number): boolean {
  const axes = [...edgeNormals(a), ...edgeNormals(b)];
  for (const axis of axes) {
    const pa = project(a, axis);
    const pb = project(b, axis);
    if (!projectionsOverlap(pa.min, pa.max, pb.min, pb.max, eps)) return false;
  }
  return true;
}

function edgeNormals(corners: Point[]): Point[] {
  const normals: Point[] = [];
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % corners.length];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-12) continue;
    normals.push({ x: -dz / len, z: dx / len });
  }
  return normals;
}

function project(corners: Point[], axis: Point): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of corners) {
    const d = p.x * axis.x + p.z * axis.z;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

function circleHitsBox(circle: Furniture, box: Furniture, eps: number): boolean {
  const radius = circle.width / 2;
  const local = worldToLocal(circle.x - box.x, circle.z - box.z, box.rotation);
  const hw = box.width / 2;
  const hd = box.depth / 2;
  const cx = clamp(local.x, -hw, hw);
  const cz = clamp(local.z, -hd, hd);
  const dist = Math.hypot(local.x - cx, local.z - cz);
  return dist < radius - eps;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function footprintsOverlap(a: Furniture, b: Furniture, eps = OVERLAP_EPSILON_M): boolean {
  if (a.id === b.id) return false;
  if (a.shape === "cylinder" && b.shape === "cylinder") {
    const ra = a.width / 2;
    const rb = b.width / 2;
    return Math.hypot(a.x - b.x, a.z - b.z) < ra + rb - eps;
  }
  if (a.shape === "cylinder" && b.shape === "box") return circleHitsBox(a, b, eps);
  if (a.shape === "box" && b.shape === "cylinder") return circleHitsBox(b, a, eps);
  return polygonsOverlap(footprintCorners(a), footprintCorners(b), eps);
}

function cornerOutside(
  p: Point,
  width: number,
  depth: number,
  eps: number,
): boolean {
  return p.x < -eps || p.z < -eps || p.x > width + eps || p.z > depth + eps;
}

/**
 * Outside when the footprint is not fully inside the interior rectangle
 * [0, width] x [0, depth]. A non-rectangular outline is stored and drawn,
 * but containment is still tested against that bounding rectangle.
 */
export function isOutsideRoom(
  item: Furniture,
  room: Pick<Room, "width" | "depth">,
  eps = OVERLAP_EPSILON_M,
): boolean {
  if (item.shape === "cylinder") {
    const r = item.width / 2;
    return (
      item.x - r < -eps ||
      item.z - r < -eps ||
      item.x + r > room.width + eps ||
      item.z + r > room.depth + eps
    );
  }
  return footprintCorners(item).some((p) => cornerOutside(p, room.width, room.depth, eps));
}

export function exceedsCeiling(item: Furniture, ceilingHeight: number, eps = OVERLAP_EPSILON_M): boolean {
  return furnitureTop(item) > ceilingHeight + eps;
}

export interface ItemIssue {
  id: string;
  outOfRoom: boolean;
  exceedsCeiling: boolean;
  overlapIds: string[];
  fixtureOverlapIds: string[];
  swingFixtureIds: string[];
  beamFixtureIds: string[];
}

export function issueIsActive(issue: ItemIssue): boolean {
  return (
    issue.outOfRoom ||
    issue.exceedsCeiling ||
    issue.overlapIds.length > 0 ||
    issue.fixtureOverlapIds.length > 0 ||
    issue.swingFixtureIds.length > 0 ||
    issue.beamFixtureIds.length > 0
  );
}

function verticalOverlap(bottomA: number, topA: number, bottomB: number, topB: number, eps = OVERLAP_EPSILON_M): boolean {
  return topA > bottomB + eps && topB > bottomA + eps;
}

export function analyzeLayout(room: Room, items: Furniture[]): ItemIssue[] {
  const fixtures = room.fixtures ?? [];
  return items.map((item) => {
    const overlapIds: string[] = [];
    for (const other of items) {
      if (other.id === item.id) continue;
      const stacked = verticalOverlap(furnitureBottom(item), furnitureTop(item), furnitureBottom(other), furnitureTop(other));
      if (stacked && footprintsOverlap(item, other)) overlapIds.push(other.id);
    }
    overlapIds.sort();
    const fixtureOverlapIds: string[] = [];
    const swingFixtureIds: string[] = [];
    const beamFixtureIds: string[] = [];
    for (const fixture of fixtures) {
      if (fixture.type === "beam") {
        if (hitsBeam(item, fixture, room)) beamFixtureIds.push(fixture.id);
        continue;
      }
      const box = obstacleFootprint(fixture, room);
      if (box && footprintHitsAabb(item, box)) {
        const obstacleTop = fixture.type === "pillar" ? room.ceilingHeight : fixture.height;
        if (verticalOverlap(furnitureBottom(item), furnitureTop(item), 0, obstacleTop)) {
          fixtureOverlapIds.push(fixture.id);
        }
      }
      if (fixture.type === "storage" && hitsSwing(item, fixture, room)) swingFixtureIds.push(fixture.id);
    }
    fixtureOverlapIds.sort();
    swingFixtureIds.sort();
    beamFixtureIds.sort();
    return {
      id: item.id,
      outOfRoom: isOutsideRoom(item, room),
      exceedsCeiling: exceedsCeiling(item, room.ceilingHeight),
      overlapIds,
      fixtureOverlapIds,
      swingFixtureIds,
      beamFixtureIds,
    };
  });
}

function aabbItem(box: Aabb): Furniture {
  return {
    id: "aabb",
    name: "aabb",
    shape: "box",
    width: Math.max(0, box.maxX - box.minX),
    depth: Math.max(0, box.maxZ - box.minZ),
    height: 1,
    x: (box.minX + box.maxX) / 2,
    z: (box.minZ + box.maxZ) / 2,
    rotation: 0,
    color: "#000000",
  };
}

function footprintHitsAabb(item: Furniture, box: Aabb): boolean {
  if (box.maxX - box.minX <= 0 || box.maxZ - box.minZ <= 0) return false;
  return footprintsOverlap(item, aabbItem(box));
}

function hitsBeam(item: Furniture, fixture: RoomFixture & { type: "beam" }, room: Room): boolean {
  const beamBottom = room.ceilingHeight - fixture.drop;
  if (!verticalOverlap(furnitureBottom(item), furnitureTop(item), beamBottom, room.ceilingHeight)) return false;
  return beamFootprints(fixture, room).some((box) => footprintHitsAabb(item, box));
}

function hitsSwing(item: Furniture, fixture: StorageFixtureLike, room: Room): boolean {
  if (!verticalOverlap(furnitureBottom(item), furnitureTop(item), 0, fixture.height)) return false;
  return storageSectors(fixture, room).some((sector) => footprintHitsSector(item, sector));
}

type StorageFixtureLike = Extract<RoomFixture, { type: "storage" }>;

export function footprintHitsSector(item: Furniture, sector: Sector): boolean {
  if (item.shape === "cylinder") return circleHitsSector(item.x, item.z, item.width / 2, sector);
  const corners = footprintCorners(item);
  if (corners.some((corner) => pointInSector(corner, sector))) return true;
  const closed = {
    x: sector.hinge.x + sector.closed.x * sector.radius,
    z: sector.hinge.z + sector.closed.z * sector.radius,
  };
  const open = {
    x: sector.hinge.x + sector.into.x * sector.radius,
    z: sector.hinge.z + sector.into.z * sector.radius,
  };
  if ([sector.hinge, closed, open].some((point) => pointInBoxFootprint(point, item))) return true;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    if (segmentsIntersect(a, b, sector.hinge, closed) || segmentsIntersect(a, b, sector.hinge, open)) return true;
    if (segmentHitsArc(a, b, sector)) return true;
  }
  return false;
}

function circleHitsSector(cx: number, cz: number, radius: number, sector: Sector): boolean {
  const vx = cx - sector.hinge.x;
  const vz = cz - sector.hinge.z;
  const along = vx * sector.closed.x + vz * sector.closed.z;
  const inward = vx * sector.into.x + vz * sector.into.z;
  let px = sector.hinge.x;
  let pz = sector.hinge.z;
  if (along >= 0 && inward >= 0) {
    const dist = Math.hypot(along, inward);
    if (dist <= sector.radius) return true;
    const scale = sector.radius / dist;
    px = sector.hinge.x + vx * scale;
    pz = sector.hinge.z + vz * scale;
  } else if (along >= inward) {
    const clamped = Math.min(sector.radius, Math.max(0, along));
    px = sector.hinge.x + sector.closed.x * clamped;
    pz = sector.hinge.z + sector.closed.z * clamped;
  } else {
    const clamped = Math.min(sector.radius, Math.max(0, inward));
    px = sector.hinge.x + sector.into.x * clamped;
    pz = sector.hinge.z + sector.into.z * clamped;
  }
  return Math.hypot(cx - px, cz - pz) < radius - OVERLAP_EPSILON_M;
}

function pointInBoxFootprint(point: { x: number; z: number }, item: Furniture): boolean {
  const local = worldToLocal(point.x - item.x, point.z - item.z, item.rotation);
  const eps = OVERLAP_EPSILON_M;
  return Math.abs(local.x) <= item.width / 2 + eps && Math.abs(local.z) <= item.depth / 2 + eps;
}

function segmentsIntersect(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
): boolean {
  const d1 = cross(b.x - a.x, b.z - a.z, c.x - a.x, c.z - a.z);
  const d2 = cross(b.x - a.x, b.z - a.z, d.x - a.x, d.z - a.z);
  const d3 = cross(d.x - c.x, d.z - c.z, a.x - c.x, a.z - c.z);
  const d4 = cross(d.x - c.x, d.z - c.z, b.x - c.x, b.z - c.z);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return false;
}

function cross(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

function segmentHitsArc(a: { x: number; z: number }, b: { x: number; z: number }, sector: Sector): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = a.x - sector.hinge.x;
  const fz = a.z - sector.hinge.z;
  const qa = dx * dx + dz * dz;
  const qb = 2 * (fx * dx + fz * dz);
  const qc = fx * fx + fz * fz - sector.radius * sector.radius;
  if (qa < 1e-12) return false;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  for (const t of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) {
    if (t < -1e-6 || t > 1 + 1e-6) continue;
    const point = { x: a.x + t * dx, z: a.z + t * dz };
    if (pointInSector(point, sector)) return true;
  }
  return false;
}

export interface WallSegment {
  /** Center of the wall volume, already shifted outside the interior. */
  cx: number;
  cz: number;
  length: number;
  /** Radians for THREE.Mesh.rotation.y so local +X follows the edge. */
  angle: number;
  thickness: number;
}

/**
 * Walls sit entirely outside the outline so the interior measure stays
 * equal to room.width / room.depth. Thickness is in meters.
 */
export function wallSegments(outline: Vec2[], thickness = 0.08): WallSegment[] {
  const segments: WallSegment[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-8) continue;
    const ox = dz / length;
    const oz = -dx / length;
    segments.push({
      cx: (a.x + b.x) / 2 + ox * (thickness / 2),
      cz: (a.z + b.z) / 2 + oz * (thickness / 2),
      length,
      angle: Math.atan2(-dz, dx),
      thickness,
    });
  }
  return segments;
}
