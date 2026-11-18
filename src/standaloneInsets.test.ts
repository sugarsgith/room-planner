import { describe, expect, it } from "vitest";
import {
  STANDALONE_BOTTOM_FALLBACK_PX,
  STANDALONE_LANDSCAPE_BOTTOM_FALLBACK_PX,
  STANDALONE_SIDE_FALLBACK_PX,
  STANDALONE_TOP_FALLBACK_PX,
  fallbackPadding,
  type InsetBox,
} from "./standaloneInsets";

const zero: InsetBox = { top: 0, right: 0, bottom: 0, left: 0 };

describe("standalone inset fallback", () => {
  it("does nothing in a normal browser tab", () => {
    expect(
      fallbackPadding({
        standalone: false,
        insets: zero,
        innerHeight: 844,
        screenHeight: 844,
        portrait: true,
      }),
    ).toEqual({ top: null, right: null, bottom: null, left: null });
  });

  it("pads the top when the home-screen web view is full-bleed and the inset is 0", () => {
    expect(
      fallbackPadding({
        standalone: true,
        insets: zero,
        innerHeight: 844,
        screenHeight: 844,
        portrait: true,
      }),
    ).toEqual({
      top: STANDALONE_TOP_FALLBACK_PX,
      right: null,
      bottom: STANDALONE_BOTTOM_FALLBACK_PX,
      left: null,
    });
  });

  it("keeps a real inset and does not pad when iOS already shortened the web view", () => {
    expect(
      fallbackPadding({
        standalone: true,
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
        innerHeight: 844,
        screenHeight: 844,
        portrait: true,
      }).top,
    ).toBeNull();
    expect(
      fallbackPadding({
        standalone: true,
        insets: zero,
        innerHeight: 780,
        screenHeight: 844,
        portrait: true,
      }),
    ).toEqual({ top: null, right: null, bottom: null, left: null });
  });

  it("pads the sides in a full-bleed landscape home-screen app", () => {
    expect(
      fallbackPadding({
        standalone: true,
        insets: zero,
        innerHeight: 390,
        screenHeight: 390,
        portrait: false,
      }),
    ).toEqual({
      top: null,
      right: STANDALONE_SIDE_FALLBACK_PX,
      bottom: STANDALONE_LANDSCAPE_BOTTOM_FALLBACK_PX,
      left: STANDALONE_SIDE_FALLBACK_PX,
    });
  });
});
