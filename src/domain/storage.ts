import { createInitialProject } from "./initial";
import { parseProjectJson } from "./schema";
import type { Project } from "./types";

export const STORAGE_KEY = "room-planner.project.v1";
export const BACKUP_KEY = "room-planner.project.v1.backup";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStatus = "empty" | "ok" | "corrupt";

export interface LoadResult {
  status: LoadStatus;
  project: Project;
  error?: string;
  /** Original payload when status is corrupt. Undefined if it could not be read. */
  raw?: string;
}

/**
 * Read the project. On failure the original key is never written.
 * A copy of the raw text is stored under BACKUP_KEY when we could read it.
 */
export function loadProject(storage: KeyValueStorage): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return {
      status: "corrupt",
      project: createInitialProject(),
      error: "ブラウザの保存領域を読めませんでした。自動保存は停止しています。",
    };
  }
  if (raw === null) {
    return { status: "empty", project: createInitialProject() };
  }
  const parsed = parseProjectJson(raw);
  if (!parsed.ok) {
    try {
      storage.setItem(BACKUP_KEY, raw);
    } catch {
      // The original key is still untouched if backup writing fails.
    }
    return {
      status: "corrupt",
      project: createInitialProject(),
      error: parsed.error,
      raw,
    };
  }
  return { status: "ok", project: parsed.project };
}

export function saveProject(storage: KeyValueStorage, project: Project): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}
