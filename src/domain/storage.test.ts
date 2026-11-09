import { describe, expect, it } from "vitest";
import { BACKUP_KEY, loadProject, STORAGE_KEY, type KeyValueStorage } from "./storage";

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

  it("leaves an empty store empty", () => {
    const { storage, map } = memory();
    const loaded = loadProject(storage);
    expect(loaded.status).toBe("empty");
    expect(map.has(STORAGE_KEY)).toBe(false);
  });
});
