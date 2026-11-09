import { useEffect, useMemo, useRef } from "react";
import { FurnitureList } from "./components/FurnitureList";
import { Inspector } from "./components/Inspector";
import { PlanView } from "./components/PlanView";
import { RoomScene } from "./components/RoomScene";
import { Toolbar } from "./components/Toolbar";
import { analyzeLayout } from "./domain/geometry";
import { activeFurniture } from "./domain/schema";
import { cmToM, formatCm } from "./domain/units";
import { downloadText } from "./lib/download";
import { useEditor } from "./state/store";

export function App() {
  const viewMode = useEditor((s) => s.viewMode);
  const loadStatus = useEditor((s) => s.loadStatus);
  const loadError = useEditor((s) => s.loadError);
  const corruptRaw = useEditor((s) => s.corruptRaw);
  const resumePersist = useEditor((s) => s.resumePersist);
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  useHistoryKeys();

  const furniture = activeFurniture(project);
  const issues = useMemo(() => analyzeLayout(project.room, furniture), [project.room, furniture]);
  const problemCount = issues.filter((issue) => issue.outOfRoom || issue.exceedsCeiling || issue.overlapIds.length > 0).length;
  const selected = furniture.find((item) => item.id === selectedId);

  return (
    <div className="app">
      <Toolbar />
      {loadStatus === "corrupt" && (
        <div className="banner" role="alert" data-testid="corrupt-banner">
          <p>
            保存データを読み込めなかったため、初期レイアウトを表示しています。自動保存は停止中で、元のデータは上書きしていません。
            {loadError ? ` ${loadError}` : ""}
          </p>
          <div className="banner-actions">
            <button
              type="button"
              onClick={() => downloadText("room-planner-corrupt-backup.txt", corruptRaw ?? "", "text/plain")}
              disabled={!corruptRaw}
            >
              生データを書き出す
            </button>
            <button type="button" onClick={resumePersist}>
              この内容で保存を再開
            </button>
          </div>
        </div>
      )}
      {loadStatus !== "corrupt" && loadError && (
        <div className="banner" role="alert">
          <p>{loadError}</p>
        </div>
      )}
      <div className="workspace">
        <FurnitureList />
        <main className="stage">{viewMode === "2d" ? <PlanView /> : <RoomScene />}</main>
        <Inspector />
      </div>
      <footer className="status" data-testid="status-bar">
        <span>
          部屋 {formatCm(project.room.width)} × {formatCm(project.room.depth)} cm / 天井 {formatCm(project.room.ceilingHeight)} cm
        </span>
        <span>{selected ? `選択: ${selected.name}` : "未選択"}</span>
        <span>{problemCount > 0 ? `重なり・はみ出し ${problemCount} 件` : "重なりなし"}</span>
        <span className="status-help">矢印キーで 1cm（Shift で 10cm）。ドラッグは 1 回の操作として戻せます。</span>
      </footer>
    </div>
  );
}

function useHistoryKeys() {
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const remove = useEditor((s) => s.remove);
  const updateFurniture = useEditor((s) => s.updateFurniture);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const keyGesture = useRef(false);
  const held = useRef(new Set<string>());

  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (meta && ((event.key.toLowerCase() === "z" && event.shiftKey) || event.key.toLowerCase() === "y")) {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const id = useEditor.getState().selectedId;
        if (!id) return;
        event.preventDefault();
        remove(id);
        return;
      }
      const arrow = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key);
      if (!arrow) return;
      const id = useEditor.getState().selectedId;
      if (!id) return;
      event.preventDefault();
      held.current.add(event.key);
      if (!useEditor.getState().gestureBefore) {
        beginGesture();
        keyGesture.current = true;
      }
      if (!keyGesture.current) return;
      const item = activeFurniture(useEditor.getState().project).find((entry) => entry.id === id);
      if (!item) return;
      const step = event.shiftKey ? cmToM(10) : cmToM(1);
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dz = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
      updateFurniture(id, { x: item.x + dx, z: item.z + dz }, "preview");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!held.current.has(event.key)) return;
      held.current.delete(event.key);
      if (held.current.size === 0 && keyGesture.current) {
        keyGesture.current = false;
        endGesture();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [beginGesture, endGesture, redo, remove, undo, updateFurniture]);
}
