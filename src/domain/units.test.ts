import { describe, expect, it } from "vitest";
import { cmToM, formatCm, mToCm, roundM } from "./units";

describe("cm <-> m", () => {
  it("round-trips tenths of a centimeter without display drift", () => {
    for (let tenths = -20000; tenths <= 20000; tenths++) {
      const cm = tenths / 10;
      expect(Math.round(mToCm(cmToM(cm)) * 10)).toBe(tenths);
    }
  });

  it("keeps the room and furniture sizes exact on display", () => {
    for (const cm of [0.1, 1, 10, 33.3, 45, 60, 70, 72, 72.5, 75, 80, 100, 140, 200, 240, 270, 360]) {
      expect(mToCm(cmToM(cm))).toBe(cm);
      expect(formatCm(cmToM(cm))).toBe(cm.toFixed(1));
    }
  });

  it("snaps meters onto the same 0.1 cm lattice", () => {
    expect(mToCm(roundM(1.0004))).toBe(100);
    expect(mToCm(roundM(cmToM(140)))).toBe(140);
    expect(roundM(cmToM(72.5))).toBe(cmToM(72.5));
  });
});
