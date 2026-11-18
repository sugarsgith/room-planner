import { useState } from "react";
import {
  loadExportReminder,
  reminderMessage,
  saveExportReminder,
  shouldRemindExport,
  type ExportReminderState,
} from "../domain/exportReminder";

export function useExportReminder() {
  const [state, setState] = useState<ExportReminderState>(() => loadExportReminder(window.localStorage));

  function persist(update: (current: ExportReminderState) => ExportReminderState) {
    setState((current) => {
      const next = update(current);
      try {
        saveExportReminder(window.localStorage, next);
      } catch {
        // The project file is untouched. A failed reminder write only keeps the note up.
      }
      return next;
    });
  }

  return {
    state,
    visible: shouldRemindExport(state, Date.now()),
    message: reminderMessage(state, Date.now()),
    markExported: () => persist((current) => ({ ...current, lastExportedAt: Date.now(), dismissedAt: null })),
    dismiss: () => persist((current) => ({ ...current, dismissedAt: Date.now() })),
  };
}

export function ExportReminder({
  message,
  onExport,
  onDismiss,
}: {
  message: string;
  onExport: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="remind-banner" role="status" data-testid="export-reminder">
      <p>{message} ファイルに残しておくと安心です。</p>
      <div className="banner-actions">
        <button type="button" data-testid="export-reminder-go" onClick={onExport}>
          書き出し
        </button>
        <button type="button" data-testid="export-reminder-later" onClick={onDismiss}>
          あとで
        </button>
      </div>
    </div>
  );
}
