import type { KeyValueStorage } from "./storage";

/** Separate from the project document so a reminder never changes schema 5. */
export const EXPORT_REMINDER_KEY = "room-planner.export-reminder.v1";

/** Show again when the last file export is older than this. */
export const EXPORT_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** 「あとで」 hides the note for this long. */
export const EXPORT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export interface ExportReminderState {
  lastExportedAt: number | null;
  dismissedAt: number | null;
}

export const EMPTY_EXPORT_REMINDER: ExportReminderState = {
  lastExportedAt: null,
  dismissedAt: null,
};

export function parseExportReminder(raw: string | null): ExportReminderState {
  if (!raw) return { ...EMPTY_EXPORT_REMINDER };
  try {
    const data = JSON.parse(raw) as { lastExportedAt?: unknown; dismissedAt?: unknown };
    return {
      lastExportedAt: typeof data.lastExportedAt === "number" && Number.isFinite(data.lastExportedAt) ? data.lastExportedAt : null,
      dismissedAt: typeof data.dismissedAt === "number" && Number.isFinite(data.dismissedAt) ? data.dismissedAt : null,
    };
  } catch {
    return { ...EMPTY_EXPORT_REMINDER };
  }
}

export function loadExportReminder(storage: KeyValueStorage): ExportReminderState {
  try {
    return parseExportReminder(storage.getItem(EXPORT_REMINDER_KEY));
  } catch {
    return { ...EMPTY_EXPORT_REMINDER };
  }
}

export function saveExportReminder(storage: KeyValueStorage, state: ExportReminderState): void {
  storage.setItem(EXPORT_REMINDER_KEY, JSON.stringify(state));
}

/** True when there is no recent export and the note was not dismissed this week. */
export function shouldRemindExport(state: ExportReminderState, now: number): boolean {
  if (state.lastExportedAt != null && now - state.lastExportedAt < EXPORT_STALE_MS) return false;
  if (state.dismissedAt != null && now - state.dismissedAt < EXPORT_DISMISS_MS) return false;
  return true;
}

export function reminderMessage(state: ExportReminderState, now: number): string {
  if (state.lastExportedAt == null) {
    return "この端末の記録は、まだファイルに書き出していません。";
  }
  const days = Math.max(1, Math.floor((now - state.lastExportedAt) / (24 * 60 * 60 * 1000)));
  return `この端末の記録は、${days}日前からファイルに書き出していません。`;
}
