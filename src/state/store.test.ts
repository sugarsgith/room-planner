import { beforeEach, describe, expect, it } from "vitest";
import { activeFurniture } from "../domain/schema";
import { BACKUP_KEY, STORAGE_KEY, type KeyValueStorage } from "../domain/storage";
import { cmToM, mToCm } from "../domain/units";
import { initEditor, useEditor } from "./store";

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
    const result = useEditor.getState().importJson("{\"schemaVersion\":2}");
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
});
