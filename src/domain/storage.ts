import { createInitialProject } from "./initial";
import { parseProjectJson } from "./schema";
import type { Project } from "./types";

export const STORAGE_KEY = "room-planner.project.v1";
export const BACKUP_KEY = "room-planner.project.v1.backup";
/** One-time copy of the pre-v4 document. Never overwritten once present. */
export const V3_BACKUP_KEY = "room-planner.project.v3.backup";

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
  /**
   * The untouched pre-v4 text. Present only after a successful migration.
   * The caller must write it to V3_BACKUP_KEY before the first v4 save.
   */
  legacyRaw?: string;
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
  const legacyRaw = isPreV4(raw) ? raw : undefined;
  return { status: "ok", project: parsed.project, legacyRaw };
}

function isPreV4(raw: string): boolean {
  try {
    const version = (JSON.parse(raw) as { schemaVersion?: unknown }).schemaVersion;
    return version === 1 || version === 2 || version === 3;
  } catch {
    return false;
  }
}

/**
 * Persist a v4 project. When `legacyRaw` is set, copy it to V3_BACKUP_KEY
 * first if that key is empty. A failed backup write skips the v4 write.
 * An existing backup is left as-is.
 */
export function saveProject(storage: KeyValueStorage, project: Project, legacyRaw?: string | null): void {
  if (legacyRaw) {
    let existing: string | null;
    try {
      existing = storage.getItem(V3_BACKUP_KEY);
    } catch {
      throw new Error("backup-read-failed");
    }
    if (existing === null) {
      try {
        storage.setItem(V3_BACKUP_KEY, legacyRaw);
      } catch {
        throw new Error("backup-write-failed");
      }
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}
