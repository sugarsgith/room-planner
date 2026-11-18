import { describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./domain/storage";
import {
  DEFAULT_TOP_GAP_PX,
  TOP_GAP_KEY,
  clampTopGap,
  effectiveTopGap,
  loadTopGap,
  saveTopGap,
} from "./topGap";

function memory() {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, value: string) => map.set(key, value),
      removeItem: (key: string) => map.delete(key),
    },
  };
}

describe("top gap", () => {
  it("stays off in Safari and on a wide home-screen screen until the user sets it", () => {
    expect(effectiveTopGap(null, false, true)).toBe(0);
    expect(effectiveTopGap(null, true, false)).toBe(0);
    expect(effectiveTopGap(null, true, true)).toBe(DEFAULT_TOP_GAP_PX);
    expect(effectiveTopGap(0, true, true)).toBe(0);
    expect(effectiveTopGap(80, false, true)).toBe(0);
  });

  it("stores the gap beside the room document", () => {
    const { map, storage } = memory();
    map.set(STORAGE_KEY, "{\"schemaVersion\":5}");
    expect(loadTopGap(storage)).toBeNull();
    saveTopGap(storage, 64);
    expect(loadTopGap(storage)).toBe(64);
    expect(map.get(STORAGE_KEY)).toBe("{\"schemaVersion\":5}");
    expect(map.has(TOP_GAP_KEY)).toBe(true);
    expect(clampTopGap(161)).toBe(160);
    expect(clampTopGap(-4)).toBe(0);
  });
});
