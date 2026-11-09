import { mToCm } from "./units";
import { SCHEMA_VERSION, type Furniture, type Layout, type Opening, type Project } from "./types";

export const LIMITS = {
  roomWidth: { min: 0.5, max: 30 },
  roomDepth: { min: 0.5, max: 30 },
  ceiling: { min: 1, max: 10 },
  furniture: { min: 0.01, max: 10 },
  position: { min: -100, max: 100 },
  name: { min: 1, max: 80 },
  opening: { min: 0.01, max: 20 },
} as const;

const KNOWN_SHAPES = new Set(["box", "cylinder"]);
const KNOWN_OPENINGS = new Set(["door", "window"]);
const BBOX_EPS = 0.001;

export type ValidateResult = { ok: true; project: Project } | { ok: false; error: string };

export function parseProjectJson(text: string): ValidateResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSONとして解釈できません。括弧やカンマが壊れていないか確認してください。" };
  }
  return validateProject(data);
}

export function validateProject(data: unknown): ValidateResult {
  if (!isRecord(data)) {
    return { ok: false, error: "データのルートはオブジェクトである必要があります。" };
  }
  if (data.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `schemaVersion は ${SCHEMA_VERSION} である必要があります（受信: ${preview(data.schemaVersion)}）。このバージョンのアプリでは読み込めません。`,
    };
  }
  if (data.app !== undefined && data.app !== "room-planner") {
    return { ok: false, error: "app は \"room-planner\" である必要があります。" };
  }

  const roomError = validateRoom(data.room);
  if (roomError) return { ok: false, error: roomError };

  if (!Array.isArray(data.layouts) || data.layouts.length === 0) {
    return { ok: false, error: "layouts は1件以上の配列である必要があります。" };
  }
  if (data.layouts.length > 50) {
    return { ok: false, error: "layouts が多すぎます（上限 50）。" };
  }
  const layoutIds = new Set<string>();
  for (let i = 0; i < data.layouts.length; i++) {
    const err = validateLayout(data.layouts[i], i);
    if (err) return { ok: false, error: err };
    const id = (data.layouts[i] as Layout).id;
    if (layoutIds.has(id)) return { ok: false, error: `レイアウト id「${id}」が重複しています。` };
    layoutIds.add(id);
  }
  if (typeof data.activeLayoutId !== "string" || !layoutIds.has(data.activeLayoutId)) {
    return { ok: false, error: "activeLayoutId が layouts のいずれかの id と一致しません。" };
  }

  return { ok: true, project: data as unknown as Project };
}

function validateRoom(value: unknown): string | null {
  if (!isRecord(value)) return "room はオブジェクトである必要があります。";
  const idError = checkId(value.id, "room.id");
  if (idError) return idError;
  const nameError = checkName(value.name, "部屋名");
  if (nameError) return nameError;

  const widthError = checkPositive(value.width, LIMITS.roomWidth, "部屋の幅");
  if (widthError) return widthError;
  const depthError = checkPositive(value.depth, LIMITS.roomDepth, "部屋の奥行き");
  if (depthError) return depthError;
  const ceilingError = checkPositive(value.ceilingHeight, LIMITS.ceiling, "天井高");
  if (ceilingError) return ceilingError;

  if (!Array.isArray(value.outline) || value.outline.length < 3) {
    return "room.outline は3点以上の配列である必要があります。";
  }
  if (value.outline.length > 64) return "room.outline の頂点が多すぎます（上限 64）。";
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < value.outline.length; i++) {
    const p = value.outline[i];
    if (!isRecord(p) || !isFiniteNumber(p.x) || !isFiniteNumber(p.z)) {
      return `room.outline[${i}] は数値の x と z を持つ必要があります。`;
    }
    if (Math.abs(p.x) > 1000 || Math.abs(p.z) > 1000) {
      return `room.outline[${i}] の座標が大きすぎます。`;
    }
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const width = value.width as number;
  const depth = value.depth as number;
  if (Math.abs(minX) > BBOX_EPS || Math.abs(minZ) > BBOX_EPS) {
    return "room.outline の外接矩形は原点 (0, 0) から始まる必要があります。";
  }
  if (Math.abs(maxX - width) > BBOX_EPS || Math.abs(maxZ - depth) > BBOX_EPS) {
    return "room.outline の外接矩形が width / depth と一致しません。";
  }

  if (!Array.isArray(value.openings)) return "room.openings は配列である必要があります。";
  if (value.openings.length > 100) return "room.openings が多すぎます（上限 100）。";
  const openingIds = new Set<string>();
  for (let i = 0; i < value.openings.length; i++) {
    const err = validateOpening(value.openings[i], i, value.outline.length);
    if (err) return err;
    const id = (value.openings[i] as Opening).id;
    if (openingIds.has(id)) return `開口部 id「${id}」が重複しています。`;
    openingIds.add(id);
  }
  return null;
}

function validateOpening(value: unknown, index: number, outlineLength: number): string | null {
  const label = `room.openings[${index}]`;
  if (!isRecord(value)) return `${label} はオブジェクトである必要があります。`;
  const idError = checkId(value.id, `${label}.id`);
  if (idError) return idError;
  if (typeof value.type !== "string" || !KNOWN_OPENINGS.has(value.type)) {
    return `${label} の type「${preview(value.type)}」は未対応です。door または window を指定してください。`;
  }
  if (!Number.isInteger(value.wallIndex) || (value.wallIndex as number) < 0 || (value.wallIndex as number) >= outlineLength) {
    return `${label}.wallIndex は 0 以上 ${outlineLength - 1} 以下の整数である必要があります。`;
  }
  if (!isFiniteNumber(value.offset) || value.offset < 0 || value.offset > 100) {
    return `${label}.offset は 0 以上の有限なメートル値である必要があります。`;
  }
  const widthError = checkPositive(value.width, LIMITS.opening, `${label} の幅`);
  if (widthError) return widthError;
  const heightError = checkPositive(value.height, LIMITS.opening, `${label} の高さ`);
  if (heightError) return heightError;
  if (!isFiniteNumber(value.sillHeight) || value.sillHeight < 0 || value.sillHeight > LIMITS.opening.max) {
    return `${label}.sillHeight は 0 以上の有限な数である必要があります。`;
  }
  return null;
}

function validateLayout(value: unknown, index: number): string | null {
  const label = `layouts[${index}]`;
  if (!isRecord(value)) return `${label} はオブジェクトである必要があります。`;
  const idError = checkId(value.id, `${label}.id`);
  if (idError) return idError;
  const nameError = checkName(value.name, `${label} の名前`);
  if (nameError) return nameError;
  if (!Array.isArray(value.furniture)) return `${label}.furniture は配列である必要があります。`;
  if (value.furniture.length > 200) return `${label} の家具が多すぎます（上限 200）。`;
  const ids = new Set<string>();
  for (let i = 0; i < value.furniture.length; i++) {
    const err = validateFurniture(value.furniture[i], `${label}.furniture[${i}]`);
    if (err) return err;
    const id = (value.furniture[i] as Furniture).id;
    if (ids.has(id)) return `家具 id「${id}」が同じレイアウト内で重複しています。`;
    ids.add(id);
  }
  return null;
}

function validateFurniture(value: unknown, label: string): string | null {
  if (!isRecord(value)) return `${label} はオブジェクトである必要があります。`;
  const idError = checkId(value.id, `${label}.id`);
  if (idError) return idError;
  const nameError = checkName(value.name, `${label} の名前`);
  if (nameError) return nameError;
  if (typeof value.shape !== "string" || !KNOWN_SHAPES.has(value.shape)) {
    return `${label} の形状「${preview(value.shape)}」は未対応です。box または cylinder を指定してください。`;
  }
  const widthError = checkPositive(value.width, LIMITS.furniture, `${label} の幅`);
  if (widthError) return widthError;
  const depthError = checkPositive(value.depth, LIMITS.furniture, `${label} の奥行き`);
  if (depthError) return depthError;
  const heightError = checkPositive(value.height, LIMITS.furniture, `${label} の高さ`);
  if (heightError) return heightError;
  if (value.shape === "cylinder" && Math.abs((value.width as number) - (value.depth as number)) > 0.0001) {
    return `${label} は円柱なので奥行きは直径と一致している必要があります。`;
  }
  const xError = checkPosition(value.x, `${label} の X`);
  if (xError) return xError;
  const zError = checkPosition(value.z, `${label} の Z`);
  if (zError) return zError;
  if (!isFiniteNumber(value.rotation) || Math.abs(value.rotation) > 36000) {
    return `${label} の回転角は有限な数値である必要があります。`;
  }
  if (typeof value.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.color)) {
    return `${label} の色は #rrggbb 形式である必要があります。`;
  }
  return null;
}

function checkPositive(
  value: unknown,
  range: { min: number; max: number },
  label: string,
): string | null {
  if (typeof value === "number" && Number.isNaN(value)) {
    return `${label}が NaN です。正の有限数を指定してください。`;
  }
  if (!isFiniteNumber(value)) {
    return `${label}は正の有限数である必要があります。`;
  }
  if (value <= 0) {
    return `${label}は 0 より大きい必要があります。`;
  }
  if (value < range.min || value > range.max) {
    return `${label}は ${formatRangeCm(range.min, range.max)} の範囲で指定してください。`;
  }
  return null;
}

function checkPosition(value: unknown, label: string): string | null {
  if (typeof value === "number" && Number.isNaN(value)) {
    return `${label}が NaN です。有限な数を指定してください。`;
  }
  if (!isFiniteNumber(value)) return `${label}は有限な数である必要があります。`;
  if (value < LIMITS.position.min || value > LIMITS.position.max) {
    return `${label}は ${mToCm(LIMITS.position.min)}〜${mToCm(LIMITS.position.max)}cm の範囲で指定してください。`;
  }
  return null;
}

function checkId(value: unknown, label: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 80) {
    return `${label} は1〜80文字の文字列である必要があります。`;
  }
  return null;
}

function checkName(value: unknown, label: string): string | null {
  if (typeof value !== "string") return `${label}は文字列である必要があります。`;
  const trimmed = value.trim();
  if (trimmed.length < LIMITS.name.min || value.length > LIMITS.name.max) {
    return `${label}は1〜${LIMITS.name.max}文字である必要があります。`;
  }
  return null;
}

function formatRangeCm(minM: number, maxM: number): string {
  return `${mToCm(minM)}〜${mToCm(maxM)}cm`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function preview(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 40);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  if (value === undefined) return "未指定";
  return typeof value;
}

export function activeLayout(project: Project): Layout {
  const layout = project.layouts.find((item) => item.id === project.activeLayoutId);
  if (!layout) throw new Error("active layout missing");
  return layout;
}

export function activeFurniture(project: Project): Furniture[] {
  return activeLayout(project).furniture;
}
