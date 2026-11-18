import { describe, expect, it } from "vitest";
import {
  EXPORT_DISMISS_MS,
  EXPORT_REMINDER_KEY,
  EXPORT_STALE_MS,
  loadExportReminder,
  parseExportReminder,
  reminderMessage,
  saveExportReminder,
  shouldRemindExport,
} from "./exportReminder";
import type { KeyValueStorage } from "./storage";

function memory(): { storage: KeyValueStorage; map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    },
  };
}

describe("export reminder", () => {
  const now = Date.UTC(2026, 10, 18);

  it("asks until there is a recent export, and a dismissal lasts a week", () => {
    expect(shouldRemindExport({ lastExportedAt: null, dismissedAt: null }, now)).toBe(true);
    expect(shouldRemindExport({ lastExportedAt: now - 1000, dismissedAt: null }, now)).toBe(false);
    expect(shouldRemindExport({ lastExportedAt: now - EXPORT_STALE_MS - 1, dismissedAt: null }, now)).toBe(true);
    expect(shouldRemindExport({ lastExportedAt: null, dismissedAt: now - 1000 }, now)).toBe(false);
    expect(shouldRemindExport({ lastExportedAt: null, dismissedAt: now - EXPORT_DISMISS_MS - 1 }, now)).toBe(true);
  });

  it("keeps a broken reminder note from blocking the app", () => {
    expect(parseExportReminder(null)).toEqual({ lastExportedAt: null, dismissedAt: null });
    expect(parseExportReminder("{")).toEqual({ lastExportedAt: null, dismissedAt: null });
    expect(parseExportReminder("{\"lastExportedAt\":\"yesterday\"}")).toEqual({ lastExportedAt: null, dismissedAt: null });
  });

  it("stores the reminder beside the project, not inside it", () => {
    const { storage, map } = memory();
    expect(loadExportReminder(storage).lastExportedAt).toBeNull();
    saveExportReminder(storage, { lastExportedAt: now, dismissedAt: null });
    expect(map.has("room-planner.project.v1")).toBe(false);
    expect(loadExportReminder(storage).lastExportedAt).toBe(now);
    expect(map.has(EXPORT_REMINDER_KEY)).toBe(true);
    expect(reminderMessage({ lastExportedAt: null, dismissedAt: null }, now)).toContain("まだファイルに書き出していません");
    expect(reminderMessage({ lastExportedAt: now - 40 * 24 * 60 * 60 * 1000, dismissedAt: null }, now)).toContain("40日前");
  });
});
