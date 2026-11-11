import { analyzeLayout, issueIsActive, minimumClearance } from "./geometry";
import { resolveLayout } from "./schema";
import { normalizeDegrees } from "./units";
import type { Project } from "./types";

export type DiffStatus = "same" | "moved" | "rotated" | "added" | "removed" | "split";

export interface DiffEntry {
  status: DiffStatus;
  furnitureId: string;
  name: string;
  distanceM?: number;
  rotationDelta?: number;
}

export interface LayoutComparison {
  entries: DiffEntry[];
  issues: { left: number; right: number };
  clearance: { left: number | null; right: number | null };
}

const MOVE_EPS_M = 0.0005;

export function compareLayouts(project: Project, leftId: string, rightId: string): LayoutComparison {
  const left = resolveLayout(project, leftId);
  const right = resolveLayout(project, rightId);
  const originOf = new Map(project.furniture.map((item) => [item.id, item.originId]));
  const rightById = new Map(right.map((item) => [item.id, item]));
  const entries: DiffEntry[] = [];
  const matchedRight = new Set<string>();

  for (const item of left) {
    const other = rightById.get(item.id);
    if (!other) continue;
    matchedRight.add(item.id);
    entries.push(classifyPair(item, other));
  }

  const leftLeft = left.filter((item) => !rightById.has(item.id));
  const rightLeft = right.filter((item) => !matchedRight.has(item.id));
  const consumed = new Set<string>();
  for (const item of leftLeft) {
    const pair = rightLeft.find((other) => !consumed.has(other.id) && sharesOrigin(item.id, other.id, originOf));
    if (pair) {
      consumed.add(pair.id);
      entries.push({ status: "split", furnitureId: item.id, name: `${item.name} / ${pair.name}` });
      continue;
    }
    entries.push({ status: "removed", furnitureId: item.id, name: item.name });
  }
  for (const item of rightLeft) {
    if (consumed.has(item.id)) continue;
    entries.push({ status: "added", furnitureId: item.id, name: item.name });
  }

  return {
    entries,
    issues: {
      left: analyzeLayout(project.room, left).filter(issueIsActive).length,
      right: analyzeLayout(project.room, right).filter(issueIsActive).length,
    },
    clearance: {
      left: minimumClearance(project.room, left),
      right: minimumClearance(project.room, right),
    },
  };
}

function sharesOrigin(leftId: string, rightId: string, originOf: Map<string, string | undefined>): boolean {
  if (leftId === rightId) return false;
  const leftOrigin = originOf.get(leftId);
  const rightOrigin = originOf.get(rightId);
  if (leftOrigin && leftOrigin === rightOrigin) return true;
  if (leftOrigin && leftOrigin === rightId) return true;
  if (rightOrigin && rightOrigin === leftId) return true;
  return false;
}

function classifyPair(
  left: { x: number; z: number; rotation: number; name: string; id: string },
  right: { x: number; z: number; rotation: number },
): DiffEntry {
  const distanceM = Math.hypot(left.x - right.x, left.z - right.z);
  const rotationDelta = smallestAngle(left.rotation, right.rotation);
  const moved = distanceM > MOVE_EPS_M;
  const rotated = rotationDelta > 0.05;
  if (moved) return { status: "moved", furnitureId: left.id, name: left.name, distanceM, rotationDelta };
  if (rotated) return { status: "rotated", furnitureId: left.id, name: left.name, rotationDelta };
  return { status: "same", furnitureId: left.id, name: left.name };
}

function smallestAngle(a: number, b: number): number {
  const delta = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(delta, 360 - delta);
}
