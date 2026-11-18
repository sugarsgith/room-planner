/** Used when iOS draws under the status bar but reports a 0 top inset. */
export const STANDALONE_TOP_FALLBACK_PX = 59;
/** Home indicator when the web view is full-bleed and the bottom inset is 0. */
export const STANDALONE_BOTTOM_FALLBACK_PX = 34;
export const STANDALONE_LANDSCAPE_BOTTOM_FALLBACK_PX = 21;
/** Notch on either side in landscape, when both side insets are 0. */
export const STANDALONE_SIDE_FALLBACK_PX = 47;

export interface InsetBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FallbackInput {
  standalone: boolean;
  insets: InsetBox;
  innerHeight: number;
  screenHeight: number;
  portrait: boolean;
}

/** Null means “keep env()”. A number replaces that side. */
export interface FallbackPadding {
  top: number | null;
  right: number | null;
  bottom: number | null;
  left: number | null;
}

const NONE: FallbackPadding = { top: null, right: null, bottom: null, left: null };

/**
 * iOS sometimes paints the status bar over a full-screen home-screen app and
 * still reports safe-area-inset-top as 0. Padding only in that case. If the
 * web view is already shorter than the screen, iOS reserved the bar itself.
 */
export function fallbackPadding(input: FallbackInput): FallbackPadding {
  if (!input.standalone) return NONE;
  const fullBleed = input.innerHeight >= input.screenHeight - 8;
  if (!fullBleed) return NONE;
  if (input.portrait) {
    return {
      top: input.insets.top < 1 ? STANDALONE_TOP_FALLBACK_PX : null,
      right: null,
      bottom: input.insets.bottom < 1 ? STANDALONE_BOTTOM_FALLBACK_PX : null,
      left: null,
    };
  }
  const sidesMissing = input.insets.left < 1 && input.insets.right < 1;
  return {
    top: null,
    right: sidesMissing ? STANDALONE_SIDE_FALLBACK_PX : null,
    bottom: input.insets.bottom < 1 ? STANDALONE_LANDSCAPE_BOTTOM_FALLBACK_PX : null,
    left: sidesMissing ? STANDALONE_SIDE_FALLBACK_PX : null,
  };
}

export function isStandaloneWindow(win: Window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return win.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function readSafeAreaInsets(doc: Document): InsetBox {
  const probe = doc.createElement("div");
  probe.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "pointer-events:none",
    "padding-top:env(safe-area-inset-top)",
    "padding-right:env(safe-area-inset-right)",
    "padding-bottom:env(safe-area-inset-bottom)",
    "padding-left:env(safe-area-inset-left)",
  ].join(";");
  doc.documentElement.appendChild(probe);
  const cs = doc.defaultView?.getComputedStyle(probe);
  const read = (value: string | undefined) => {
    const n = parseFloat(value ?? "");
    return Number.isFinite(n) ? n : 0;
  };
  const insets = {
    top: read(cs?.paddingTop),
    right: read(cs?.paddingRight),
    bottom: read(cs?.paddingBottom),
    left: read(cs?.paddingLeft),
  };
  probe.remove();
  return insets;
}

function applyPadding(style: CSSStyleDeclaration, padding: FallbackPadding): void {
  const set = (name: string, value: number | null) => {
    if (value == null) style.removeProperty(name);
    else style.setProperty(name, `${value}px`);
  };
  set("--safe-area-top", padding.top);
  set("--safe-area-right", padding.right);
  set("--safe-area-bottom", padding.bottom);
  set("--safe-area-left", padding.left);
}

export function applyStandaloneFallback(win: Window = window): void {
  const root = win.document.documentElement;
  if (!isStandaloneWindow(win)) {
    root.classList.remove("standalone");
    applyPadding(root.style, NONE);
    return;
  }
  root.classList.add("standalone");
  applyPadding(
    root.style,
    fallbackPadding({
      standalone: true,
      insets: readSafeAreaInsets(win.document),
      innerHeight: win.innerHeight,
      screenHeight: win.screen.height,
      portrait: win.matchMedia("(orientation: portrait)").matches,
    }),
  );
}

export function installStandaloneInsets(win: Window = window): () => void {
  const apply = () => applyStandaloneFallback(win);
  apply();
  win.addEventListener("resize", apply);
  win.addEventListener("orientationchange", apply);
  return () => {
    win.removeEventListener("resize", apply);
    win.removeEventListener("orientationchange", apply);
  };
}
