import type { KeyValueStorage } from "./domain/storage";

/** Separate from the room document. Home-screen blur padding only. */
export const TOP_GAP_KEY = "room-planner.top-gap.v1";

/** Clears about one toolbar row of the iOS top fade. 0 means the user turned it off. */
export const DEFAULT_TOP_GAP_PX = 56;
export const TOP_GAP_STEP_PX = 8;
export const TOP_GAP_MAX_PX = 160;

export function clampTopGap(px: number): number {
  if (!Number.isFinite(px)) return 0;
  return Math.min(TOP_GAP_MAX_PX, Math.max(0, Math.round(px / TOP_GAP_STEP_PX) * TOP_GAP_STEP_PX));
}

export function loadTopGap(storage: KeyValueStorage): number | null {
  try {
    const raw = storage.getItem(TOP_GAP_KEY);
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return clampTopGap(n);
  } catch {
    return null;
  }
}

export function saveTopGap(storage: KeyValueStorage, px: number): void {
  storage.setItem(TOP_GAP_KEY, String(clampTopGap(px)));
}

/** Phone layout, including a short landscape iPhone. iPad width stays at 0 unless the user set a value. */
export function isPhoneLayout(win: Window): boolean {
  return win.matchMedia("(max-width: 767px), (max-height: 500px) and (orientation: landscape)").matches;
}

export function effectiveTopGap(stored: number | null, standalone: boolean, phone: boolean): number {
  if (!standalone) return 0;
  if (stored != null) return clampTopGap(stored);
  return phone ? DEFAULT_TOP_GAP_PX : 0;
}

export function applyTopGap(win: Window = window): number {
  const root = win.document.documentElement;
  const standalone = root.classList.contains("standalone");
  const px = effectiveTopGap(loadTopGap(win.localStorage), standalone, isPhoneLayout(win));
  if (!standalone || px === 0) root.style.removeProperty("--top-gap");
  else root.style.setProperty("--top-gap", `${px}px`);
  return px;
}
