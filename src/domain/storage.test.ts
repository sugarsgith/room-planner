import { describe, expect, it } from "vitest";
import { createInitialProject } from "./initial";
import { BACKUP_KEY, loadProject, saveProject, STORAGE_KEY, V3_BACKUP_KEY, type KeyValueStorage } from "./storage";

function memory(initial: Record<string, string> = {}): { storage: KeyValueStorage; map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    storage: {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: (key, value) => map.set(key, value),
      removeItem: (key) => map.delete(key),
    },
  };
}

describe("loadProject", () => {
  it("does not write the original key when the payload is invalid", () => {
    const raw = "{\"schemaVersion\":1,";
    const { storage, map } = memory({ [STORAGE_KEY]: raw });
    const loaded = loadProject(storage);
    expect(loaded.status).toBe("corrupt");
    expect(map.get(STORAGE_KEY)).toBe(raw);
    expect(map.get(BACKUP_KEY)).toBe(raw);
  });

  it("backs up a v3 document once and skips the v4 write when that backup fails", () => {
    const legacy = {
      schemaVersion: 3,
      app: "room-planner",
      room: createInitialProject().room,
      activeLayoutId: "layout-default",
      layouts: [
        {
          id: "layout-default",
          name: "現在の配置",
          furniture: [
            {
              id: "bed",
              name: "シングルベッド",
              shape: "box",
              width: 1,
              depth: 2,
              height: 0.45,
              color: "#7d8fa3",
              x: 1,
              z: 2,
              rotation: 0,
              elevation: 0,
              allowOverlapIds: [],
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(legacy);
    const { storage, map } = memory({ [STORAGE_KEY]: raw });
    const loaded = loadProject(storage);
    expect(loaded.status).toBe("ok");
    expect(loaded.legacyRaw).toBe(raw);
    expect(map.get(STORAGE_KEY)).toBe(raw);
    expect(map.has(V3_BACKUP_KEY)).toBe(false);
    if (loaded.status !== "ok") return;
    saveProject(storage, loaded.project, loaded.legacyRaw);
    expect(map.get(V3_BACKUP_KEY)).toBe(raw);
    expect(JSON.parse(map.get(STORAGE_KEY) ?? "{}").schemaVersion).toBe(4);

    map.set(V3_BACKUP_KEY, "keep-me");
    saveProject(storage, loaded.project, loaded.legacyRaw);
    expect(map.get(V3_BACKUP_KEY)).toBe("keep-me");

    const blocked = memory({ [STORAGE_KEY]: raw });
    blocked.storage.setItem = (key, value) => {
      if (key === V3_BACKUP_KEY) throw new Error("quota");
      blocked.map.set(key, value);
    };
    const again = loadProject(blocked.storage);
    expect(again.legacyRaw).toBe(raw);
    if (again.status !== "ok") return;
    expect(() => saveProject(blocked.storage, again.project, again.legacyRaw)).toThrow("backup-write-failed");
    expect(blocked.map.get(STORAGE_KEY)).toBe(raw);
    expect(blocked.map.has(V3_BACKUP_KEY)).toBe(false);
  });

  it("leaves an empty store empty", () => {
    const { storage, map } = memory();
    const loaded = loadProject(storage);
    expect(loaded.status).toBe("empty");
    expect(map.has(STORAGE_KEY)).toBe(false);
  });
});
