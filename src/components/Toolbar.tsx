import { useRef } from "react";
import { serializeProject } from "../domain/storage";
import { downloadText } from "../lib/download";
import { saveStatusLabel, useEditor } from "../state/store";

export function Toolbar() {
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const requestViewCommand = useEditor((s) => s.requestViewCommand);
  const importJson = useEditor((s) => s.importJson);
  const importError = useEditor((s) => s.importError);
  const dismissImportError = useEditor((s) => s.dismissImportError);
  const project = useEditor((s) => s.project);
  const saveNow = useEditor((s) => s.saveNow);
  const saveStatus = useEditor((s) => s.saveStatus);
  const savedAt = useEditor((s) => s.savedAt);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusText = saveStatusLabel(saveStatus, savedAt);

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>部屋プランナー</strong>
        <span>実寸で家具を置く</span>
      </div>
      <div className="toolbar-group" role="group" aria-label="表示切替">
        <button
          type="button"
          className={viewMode === "2d" ? "active" : ""}
          aria-pressed={viewMode === "2d"}
          data-testid="view-mode-2d"
          onClick={() => setViewMode("2d")}
        >
          2D
        </button>
        <button
          type="button"
          className={viewMode === "3d" ? "active" : ""}
          aria-pressed={viewMode === "3d"}
          data-testid="view-mode-3d"
          onClick={() => setViewMode("3d")}
        >
          3D
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" onClick={undo} disabled={past === 0} title="元に戻す (Ctrl/⌘+Z)">
          元に戻す
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={future === 0}
          title="やり直す (Ctrl/⌘+Shift+Z, Ctrl+Y)"
        >
          やり直す
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" onClick={() => requestViewCommand("zoom-in")}>
          拡大
        </button>
        <button type="button" onClick={() => requestViewCommand("zoom-out")}>
          縮小
        </button>
        <button type="button" onClick={() => requestViewCommand("reset")}>
          全体
        </button>
      </div>
      <div className="toolbar-group">
        <button type="button" data-testid="save-button" onClick={() => saveNow()}>
          保存
        </button>
        {statusText && (
          <span className={`save-status ${saveStatus}`} data-testid="save-status">
            {statusText}
          </span>
        )}
        <button
          type="button"
          onClick={() => downloadText("room-planner.json", serializeProject(project), "application/json")}
        >
          書き出し
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          読み込み
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            importJson(await file.text());
          }}
        />
      </div>
      {importError && (
        <p className="import-error" data-testid="import-error" role="alert">
          読み込めませんでした。{importError}
          <button type="button" onClick={dismissImportError}>
            閉じる
          </button>
        </p>
      )}
    </header>
  );
}
