import { beforeEach, describe, expect, it, vi } from "vitest";
import { activeFurniture } from "../domain/schema";
import { BACKUP_KEY, STORAGE_KEY, type KeyValueStorage } from "../domain/storage";
import { cmToM, mToCm } from "../domain/units";
import { initEditor, saveStatusLabel, useEditor } from "./store";

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  const writes: string[] = [];
  const storage: KeyValueStorage = {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      writes.push(key);
      map.set(key, value);
    },
    removeItem: (key) => map.delete(key),
  };
  return { map, writes, storage };
}

describe("editor store", () => {
  beforeEach(() => {
    initEditor(memory().storage);
  });

  it("reflects position and rotation in the active layout", () => {
    const before = activeFurniture(useEditor.getState().project).find((item) => item.id === "bed");
    expect(before).toBeTruthy();
    expect(mToCm(before!.x)).toBe(135);
    expect(before!.rotation).toBe(90);

    useEditor.getState().updateFurniture("bed", { x: cmToM(180.5), z: cmToM(42) }, "commit");
    useEditor.getState().rotateBy("bed", 90);
    const after = activeFurniture(useEditor.getState().project).find((item) => item.id === "bed")!;
    expect(mToCm(after.x)).toBe(180.5);
    expect(mToCm(after.z)).toBe(42);
    expect(after.rotation).toBe(180);

    useEditor.getState().undo();
    expect(activeFurniture(useEditor.getState().project).find((item) => item.id === "bed")!.rotation).toBe(90);
    useEditor.getState().undo();
    const restored = activeFurniture(useEditor.getState().project).find((item) => item.id === "bed")!;
    expect(mToCm(restored.x)).toBe(135);
    expect(mToCm(restored.z)).toBe(300);

    useEditor.getState().redo();
    expect(mToCm(activeFurniture(useEditor.getState().project).find((item) => item.id === "bed")!.x)).toBe(180.5);
  });

  it("records one history step for a whole drag", () => {
    const { storage, writes } = memory();
    initEditor(storage);
    const savedAfterInit = writes.filter((key) => key === STORAGE_KEY).length;
    const original = activeFurniture(useEditor.getState().project).find((item) => item.id === "desk")!.x;

    useEditor.getState().beginGesture();
    useEditor.getState().updateFurniture("desk", { x: cmToM(80) }, "preview");
    useEditor.getState().updateFurniture("desk", { x: cmToM(100) }, "preview");
    useEditor.getState().updateFurniture("desk", { x: cmToM(120.5) }, "preview");
    expect(writes.filter((key) => key === STORAGE_KEY).length).toBe(savedAfterInit);
    expect(useEditor.getState().past).toHaveLength(0);

    useEditor.getState().endGesture();
    expect(useEditor.getState().past).toHaveLength(1);
    expect(mToCm(activeFurniture(useEditor.getState().project).find((item) => item.id === "desk")!.x)).toBe(120.5);
    expect(writes.filter((key) => key === STORAGE_KEY).length).toBe(savedAfterInit + 1);

    useEditor.getState().undo();
    expect(activeFurniture(useEditor.getState().project).find((item) => item.id === "desk")!.x).toBe(original);
    useEditor.getState().redo();
    expect(mToCm(activeFurniture(useEditor.getState().project).find((item) => item.id === "desk")!.x)).toBe(120.5);
  });

  it("clears the redo stack after a new edit", () => {
    useEditor.getState().rotateBy("sofa", 90);
    useEditor.getState().undo();
    expect(useEditor.getState().future).toHaveLength(1);
    useEditor.getState().rotateBy("sofa", -90);
    expect(useEditor.getState().future).toHaveLength(0);
    useEditor.getState().redo();
    expect(activeFurniture(useEditor.getState().project).find((item) => item.id === "sofa")!.rotation).toBe(270);
  });

  it("does not apply an invalid import and does not persist it", () => {
    const { storage, map } = memory();
    initEditor(storage);
    const before = map.get(STORAGE_KEY);
    const name = useEditor.getState().project.room.name;
    const result = useEditor.getState().importJson("{\"schemaVersion\":99}");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("schemaVersion");
    expect(useEditor.getState().project.room.name).toBe(name);
    expect(map.get(STORAGE_KEY)).toBe(before);
    expect(useEditor.getState().importError).toContain("schemaVersion");
  });

  it("does not overwrite corrupt storage until the user resumes saving", () => {
    const raw = "{\"schemaVersion\":1,\"broken\":true}";
    const { storage, map, writes } = memory({ [STORAGE_KEY]: raw });
    initEditor(storage);
    expect(useEditor.getState().loadStatus).toBe("corrupt");
    expect(useEditor.getState().persistAllowed).toBe(false);
    expect(map.get(STORAGE_KEY)).toBe(raw);
    expect(map.get(BACKUP_KEY)).toBe(raw);

    useEditor.getState().updateFurniture("bed", { x: cmToM(10) }, "commit");
    useEditor.getState().beginGesture();
    useEditor.getState().updateFurniture("bed", { z: cmToM(20) }, "preview");
    useEditor.getState().endGesture();
    const failedImport = useEditor.getState().importJson("{");
    expect(failedImport.ok).toBe(false);
    expect(map.get(STORAGE_KEY)).toBe(raw);
    expect(writes.filter((key) => key === STORAGE_KEY)).toHaveLength(0);
    expect(mToCm(activeFurniture(useEditor.getState().project).find((item) => item.id === "bed")!.x)).toBe(10);

    useEditor.getState().resumePersist();
    const saved = map.get(STORAGE_KEY);
    expect(saved).not.toBe(raw);
    expect(saved && JSON.parse(saved).layouts[0].furniture.find((item: { id: string }) => item.id === "bed").x).toBe(cmToM(10));
    expect(map.get(BACKUP_KEY)).toBe(raw);
  });

  it("debounces autosave, then records the local time, and a manual save flushes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 9, 8, 23, 0));
    try {
      const { storage, writes } = memory();
      initEditor(storage, { autosaveDelayMs: 400 });
      const baseline = writes.filter((key) => key === STORAGE_KEY).length;
      useEditor.getState().rotateBy("bed", 90);
      expect(useEditor.getState().saveStatus).toBe("pending");
      expect(saveStatusLabel("pending", null)).toBe("未保存の変更あり");
      expect(writes.filter((key) => key === STORAGE_KEY).length).toBe(baseline);
      vi.advanceTimersByTime(400);
      expect(useEditor.getState().saveStatus).toBe("saved");
      expect(saveStatusLabel("saved", useEditor.getState().savedAt)).toBe("保存済み 8:23");
      expect(writes.filter((key) => key === STORAGE_KEY).length).toBe(baseline + 1);

      useEditor.getState().rotateBy("bed", 90);
      expect(useEditor.getState().saveStatus).toBe("pending");
      useEditor.getState().saveNow();
      expect(useEditor.getState().saveStatus).toBe("saved");
      expect(writes.filter((key) => key === STORAGE_KEY).length).toBe(baseline + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a clear failure and does not write again after localStorage rejects the save", () => {
    let fail = false;
    const map = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: (key, value) => {
        if (fail && key === STORAGE_KEY) throw new Error("quota");
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
    };
    initEditor(storage);
    const saved = map.get(STORAGE_KEY);
    fail = true;
    useEditor.getState().rotateBy("sofa", 90);
    expect(useEditor.getState().saveStatus).toBe("error");
    expect(saveStatusLabel("error", null)).toBe("保存できませんでした");
    expect(map.get(STORAGE_KEY)).toBe(saved);
    useEditor.getState().rotateBy("sofa", -90);
    expect(map.get(STORAGE_KEY)).toBe(saved);
  });
});
