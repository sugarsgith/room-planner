import type { Furniture, Room, Vec2 } from "./types";

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
 * Touching edges are NOT overlaps. EPS is 0.1 mm, finer than the 1 mm UI grid.
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
  return item.height > ceilingHeight + eps;
}

export interface ItemIssue {
  id: string;
  outOfRoom: boolean;
  exceedsCeiling: boolean;
  overlapIds: string[];
}

export function analyzeLayout(room: Room, items: Furniture[]): ItemIssue[] {
  return items.map((item) => {
    const overlapIds: string[] = [];
    for (const other of items) {
      if (other.id === item.id) continue;
      if (footprintsOverlap(item, other)) overlapIds.push(other.id);
    }
    overlapIds.sort();
    return {
      id: item.id,
      outOfRoom: isOutsideRoom(item, room),
      exceedsCeiling: exceedsCeiling(item, room.ceilingHeight),
      overlapIds,
    };
  });
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
