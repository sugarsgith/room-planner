import { useRef, useState } from "react";
import { APP_VERSION } from "../appVersion";
import { parseProjectJson } from "../domain/schema";
import { applyTopGap, effectiveTopGap, isPhoneLayout, loadTopGap, saveTopGap } from "../topGap";
import { serializeProject } from "../domain/storage";
import { downloadText } from "../lib/download";
import { saveStatusLabel, useEditor } from "../state/store";

export function Toolbar({ onExported }: { onExported: () => void }) {
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const workMode = useEditor((s) => s.workMode);
  const setWorkMode = useEditor((s) => s.setWorkMode);
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [standalone] = useState(() => document.documentElement.classList.contains("standalone"));
  const [topGap, setTopGap] = useState(() =>
    effectiveTopGap(loadTopGap(window.localStorage), document.documentElement.classList.contains("standalone"), isPhoneLayout(window)),
  );
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const statusText = saveStatusLabel(saveStatus, savedAt);

  function openImport() {
    setMoreOpen(false);
    fileRef.current?.click();
  }

  function exportProject() {
    setMoreOpen(false);
    downloadText("room-planner.json", serializeProject(project), "application/json");
    onExported();
  }

  function acceptImport() {
    if (!pendingImport) return;
    const text = pendingImport;
    setPendingImport(null);
    importJson(text);
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>部屋プランナー</strong>
        <span>実寸で家具を置く</span>
      </div>
      <div className="toolbar-group" role="group" aria-label="画面">
        <button
          type="button"
          className={workMode === "layout" ? "active" : ""}
          aria-pressed={workMode === "layout"}
          data-testid="work-mode-layout"
          onClick={() => setWorkMode("layout")}
        >
          配置
        </button>
        <button
          type="button"
          className={workMode === "storage" ? "active" : ""}
          aria-pressed={workMode === "storage"}
          data-testid="work-mode-storage"
          onClick={() => setWorkMode("storage")}
        >
          収納
        </button>
      </div>
      {workMode === "layout" && (
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
      )}
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
      {workMode === "layout" && (
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
      )}
      <div className="toolbar-group">
        <button type="button" data-testid="save-button" onClick={() => saveNow()}>
          保存
        </button>
        {statusText && (
          <span className={`save-status ${saveStatus}`} data-testid="save-status">
            {statusText}
          </span>
        )}
      </div>
      <div className="toolbar-group toolbar-secondary">
        <button type="button" onClick={exportProject}>
          書き出し
        </button>
        <button type="button" onClick={openImport}>
          読み込み
        </button>
      </div>
      <div className="toolbar-more">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-label="その他"
          data-testid="toolbar-more"
          onClick={() => setMoreOpen((open) => !open)}
        >
          …
        </button>
        {moreOpen && (
          <div className="more-menu" data-testid="toolbar-more-menu">
            <p className="hint" data-testid="app-version-menu">
              画面の版 {APP_VERSION}
            </p>
            {standalone && (
              <div className="top-gap-control" data-testid="top-gap-control">
                <span>上の余白</span>
                <div className="list-actions">
                  <button
                    type="button"
                    data-testid="top-gap-less"
                    onClick={() => {
                      const next = Math.max(0, topGap - 8);
                      saveTopGap(window.localStorage, next);
                      setTopGap(applyTopGap(window));
                    }}
                  >
                    減らす
                  </button>
                  <span className="top-gap-value" data-testid="top-gap-value">
                    {topGap}px
                  </span>
                  <button
                    type="button"
                    data-testid="top-gap-more"
                    onClick={() => {
                      const next = Math.min(160, topGap + 8);
                      saveTopGap(window.localStorage, next);
                      setTopGap(applyTopGap(window));
                    }}
                  >
                    増やす
                  </button>
                </div>
                <p className="hint">ホーム画面だけで、上のぼかしを避けます。0 で追加の余白はありません。</p>
              </div>
            )}
            <button type="button" onClick={exportProject}>
              書き出し
            </button>
            <button type="button" onClick={openImport}>
              読み込み
            </button>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="import-file"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const text = await file.text();
          const parsed = parseProjectJson(text);
          if (!parsed.ok) {
            importJson(text);
            return;
          }
          setPendingImport(text);
        }}
      />
      {pendingImport && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="import-confirm-title" data-testid="import-confirm">
            <h2 id="import-confirm-title">読み込み</h2>
            <p data-testid="import-confirm-message">この端末の記録を、ファイルの内容に置き換えます。</p>
            <div className="list-actions">
              <button type="button" data-testid="import-confirm-accept" onClick={acceptImport}>
                置き換える
              </button>
              <button type="button" data-testid="import-confirm-cancel" onClick={() => setPendingImport(null)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
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
