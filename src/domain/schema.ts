import { fixtureError, isPlanCorner, isPlanWall } from "./fixtures";
import { mToCm } from "./units";
import {
  SCHEMA_VERSION,
  type Furniture,
  type FurnitureItem,
  type Layout,
  type Opening,
  type Placement,
  type Project,
  type RoomFixture,
} from "./types";

export const LIMITS = {
  roomWidth: { min: 0.5, max: 30 },
  roomDepth: { min: 0.5, max: 30 },
  ceiling: { min: 1, max: 10 },
  furniture: { min: 0.01, max: 10 },
  fixture: { min: 0.001, max: 10 },
  position: { min: -100, max: 100 },
  name: { min: 1, max: 80 },
  opening: { min: 0.01, max: 20 },
} as const;

const KNOWN_SHAPES = new Set(["box", "cylinder"]);
const KNOWN_OPENINGS = new Set(["door", "window"]);
const KNOWN_FIXTURES = new Set(["pillar", "storage", "beam", "window", "entrance"]);
const KNOWN_DOORS = new Set(["none", "single", "double", "sliding"]);
const KNOWN_WINDOW_STYLES = new Set(["sliding", "other"]);
const KNOWN_ENTRANCE_DOORS = new Set(["none", "single", "sliding"]);
const KNOWN_HINGES = new Set(["left", "right"]);
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
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2 && data.schemaVersion !== 3 && data.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `schemaVersion は 1、2、3 または ${SCHEMA_VERSION} である必要があります（受信: ${preview(data.schemaVersion)}）。このバージョンのアプリでは読み込めません。`,
    };
  }
  const migrated = data.schemaVersion === SCHEMA_VERSION ? data : migrateToCurrent(data);
  if (migrated.app !== undefined && migrated.app !== "room-planner") {
    return { ok: false, error: "app は \"room-planner\" である必要があります。" };
  }

  const roomError = validateRoom(migrated.room);
  if (roomError) return { ok: false, error: roomError };

  const catalogError = validateCatalog(migrated.furniture);
  if (catalogError) return { ok: false, error: catalogError };
  const catalogIds = new Set((migrated.furniture as FurnitureItem[]).map((item) => item.id));

  if (!Array.isArray(migrated.layouts) || migrated.layouts.length === 0) {
    return { ok: false, error: "layouts は1件以上の配列である必要があります。" };
  }
  if (migrated.layouts.length > 50) {
    return { ok: false, error: "layouts が多すぎます（上限 50）。" };
  }
  const layoutIds = new Set<string>();
  for (let i = 0; i < migrated.layouts.length; i++) {
    const err = validateLayout(migrated.layouts[i], i, catalogIds);
    if (err) return { ok: false, error: err };
    const id = (migrated.layouts[i] as Layout).id;
    if (layoutIds.has(id)) return { ok: false, error: `レイアウト id「${id}」が重複しています。` };
    layoutIds.add(id);
  }
  if (typeof migrated.activeLayoutId !== "string" || !layoutIds.has(migrated.activeLayoutId)) {
    return { ok: false, error: "activeLayoutId が layouts のいずれかの id と一致しません。" };
  }
  if (typeof migrated.baselineLayoutId !== "string" || !layoutIds.has(migrated.baselineLayoutId)) {
    return { ok: false, error: "baselineLayoutId が layouts のいずれかの id と一致しません。" };
  }

  return { ok: true, project: migrated as unknown as Project };
}

function migrateToCurrent(data: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(data);
  if (isRecord(copy.room) && !Array.isArray(copy.room.fixtures)) copy.room.fixtures = [];
  if (Array.isArray(copy.layouts)) {
    for (const layout of copy.layouts) {
      if (!isRecord(layout) || !Array.isArray(layout.furniture)) continue;
      for (const item of layout.furniture) {
        if (!isRecord(item)) continue;
        if (item.elevation === undefined) item.elevation = 0;
        if (item.allowOverlapIds === undefined) item.allowOverlapIds = [];
      }
    }
  }
  return splitCatalog(copy);
}

function sameCatalog(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.name !== b.name || a.shape !== b.shape) return false;
  if (typeof a.color !== "string" || typeof b.color !== "string") return false;
  if (a.color.toLowerCase() !== b.color.toLowerCase()) return false;
  for (const key of ["width", "depth", "height"] as const) {
    if (!isFiniteNumber(a[key]) || !isFiniteNumber(b[key])) return false;
    if (Math.abs(a[key] - b[key]) > 1e-6) return false;
  }
  return true;
}

function uniqueSplitId(base: string, used: Set<string>): string {
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}#${n}`.slice(0, 80);
    if (!used.has(candidate)) return candidate;
  }
  const fallback = `split-${used.size + 1}`.slice(0, 80);
  return used.has(fallback) ? `split-${Date.now()}`.slice(0, 80) : fallback;
}

function catalogRecord(raw: Record<string, unknown>, id: string, originId: string | undefined): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "x" || key === "z" || key === "rotation" || key === "elevation" || key === "allowOverlapIds" || key === "furnitureId") {
      continue;
    }
    item[key] = value;
  }
  item.id = id;
  if (originId) item.originId = originId;
  return item;
}

function splitCatalog(data: Record<string, unknown>): Record<string, unknown> {
  const layoutsIn = Array.isArray(data.layouts) ? data.layouts : [];
  const catalog: Record<string, unknown>[] = [];
  const byId = new Map<string, Record<string, unknown>>();
  const used = new Set<string>();
  const layouts: unknown[] = [];
  for (const layout of layoutsIn) {
    if (!isRecord(layout) || !Array.isArray(layout.furniture)) {
      layouts.push(layout);
      continue;
    }
    const idMap = new Map<string, string>();
    const placements: Record<string, unknown>[] = [];
    for (const raw of layout.furniture) {
      if (!isRecord(raw) || typeof raw.id !== "string") continue;
      const existing = byId.get(raw.id);
      let catalogId = raw.id;
      if (existing && !sameCatalog(existing, raw)) {
        catalogId = uniqueSplitId(raw.id, used);
        const created = catalogRecord(raw, catalogId, raw.id);
        catalog.push(created);
        byId.set(catalogId, created);
        used.add(catalogId);
      } else if (!existing) {
        const created = catalogRecord(raw, raw.id, undefined);
        catalog.push(created);
        byId.set(raw.id, created);
        used.add(raw.id);
      }
      idMap.set(raw.id, catalogId);
      placements.push({
        furnitureId: catalogId,
        x: raw.x,
        z: raw.z,
        rotation: raw.rotation,
        elevation: raw.elevation ?? 0,
        allowOverlapIds: Array.isArray(raw.allowOverlapIds) ? [...raw.allowOverlapIds] : [],
      });
    }
    for (const placement of placements) {
      if (!Array.isArray(placement.allowOverlapIds)) continue;
      placement.allowOverlapIds = placement.allowOverlapIds.map((id) =>
        typeof id === "string" && idMap.has(id) ? idMap.get(id) : id,
      );
    }
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(layout)) {
      if (key !== "furniture") rest[key] = value;
    }
    layouts.push({ ...rest, placements });
  }
  const active = typeof data.activeLayoutId === "string" ? data.activeLayoutId : "";
  return {
    ...data,
    schemaVersion: SCHEMA_VERSION,
    furniture: catalog,
    layouts,
    baselineLayoutId: active,
  };
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

  if (!Array.isArray(value.fixtures)) return "room.fixtures は配列である必要があります。";
  if (value.fixtures.length > 40) return "room.fixtures が多すぎます（上限 40）。";
  const fixtureIds = new Set<string>();
  for (let i = 0; i < value.fixtures.length; i++) {
    const err = validateFixture(value.fixtures[i], i, value);
    if (err) return err;
    const id = (value.fixtures[i] as RoomFixture).id;
    if (fixtureIds.has(id)) return `出っ張り id「${id}」が重複しています。`;
    fixtureIds.add(id);
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

function validateCatalog(value: unknown): string | null {
  if (!Array.isArray(value)) return "furniture は配列である必要があります。";
  if (value.length > 10000) return "furniture が多すぎます（上限 10000）。";
  const ids = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    const err = validateCatalogItem(value[i], `furniture[${i}]`);
    if (err) return err;
    const id = (value[i] as FurnitureItem).id;
    if (ids.has(id)) return `家具 id「${id}」が重複しています。`;
    ids.add(id);
  }
  return null;
}

function validateCatalogItem(value: unknown, label: string): string | null {
  if (!isRecord(value)) return `${label} はオブジェクトである必要があります。`;
  const idError = checkId(value.id, `${label}.id`);
  if (idError) return idError;
  if (value.originId !== undefined) {
    const originError = checkId(value.originId, `${label}.originId`);
    if (originError) return originError;
  }
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
  if (typeof value.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value.color)) {
    return `${label} の色は #rrggbb 形式である必要があります。`;
  }
  return null;
}

function validateLayout(value: unknown, index: number, catalogIds: Set<string>): string | null {
  const label = `layouts[${index}]`;
  if (!isRecord(value)) return `${label} はオブジェクトである必要があります。`;
  const idError = checkId(value.id, `${label}.id`);
  if (idError) return idError;
  const nameError = checkName(value.name, `${label} の名前`);
  if (nameError) return nameError;
  if (!Array.isArray(value.placements)) return `${label}.placements は配列である必要があります。`;
  if (value.placements.length > 200) return `${label} の家具が多すぎます（上限 200）。`;
  const ids = new Set<string>();
  for (let i = 0; i < value.placements.length; i++) {
    const err = validatePlacement(value.placements[i], `${label}.placements[${i}]`, catalogIds);
    if (err) return err;
    const id = (value.placements[i] as Placement).furnitureId;
    if (ids.has(id)) return `家具 id「${id}」が同じレイアウト内で重複しています。`;
    ids.add(id);
  }
  for (let i = 0; i < value.placements.length; i++) {
    const placement = value.placements[i] as Placement;
    const err = validateAllowList(placement.allowOverlapIds, ids, placement.furnitureId, `${label}.placements[${i}]`);
    if (err) return err;
  }
  return null;
}

function validateAllowList(value: unknown, ids: Set<string>, selfId: string, label: string): string | null {
  if (!Array.isArray(value)) return `${label} の重なってもいい家具は id の配列である必要があります。`;
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || !ids.has(id) || id === selfId) {
      return `${label} の重なってもいい家具に、同じレイアウトの他の家具ではない id があります。`;
    }
    if (seen.has(id)) return `${label} の重なってもいい家具が重複しています。`;
    seen.add(id);
  }
  return null;
}

function validatePlacement(value: unknown, label: string, catalogIds: Set<string>): string | null {
  if (!isRecord(value)) return `${label} はオブジェクトである必要があります。`;
  if (typeof value.furnitureId !== "string" || !catalogIds.has(value.furnitureId)) {
    return `${label} の furnitureId が家具一覧にありません。`;
  }
  const xError = checkPosition(value.x, `${label} の X`);
  if (xError) return xError;
  const zError = checkPosition(value.z, `${label} の Z`);
  if (zError) return zError;
  if (!isFiniteNumber(value.rotation) || Math.abs(value.rotation) > 36000) {
    return `${label} の回転角は有限な数値である必要があります。`;
  }
  if (!isFiniteNumber(value.elevation) || value.elevation < 0 || value.elevation > 20) {
    return `${label} の底の高さは 0〜${mToCm(20)}cm の範囲で指定してください。`;
  }
  return null;
}

function validateFixture(value: unknown, index: number, room: Record<string, unknown>): string | null {
  const label = `room.fixtures[${index}]`;
  if (!isRecord(value)) return `${label} はオブジェクトである必要があります。`;
  const idError = checkId(value.id, `${label}.id`);
  if (idError) return idError;
  if (typeof value.type !== "string" || !KNOWN_FIXTURES.has(value.type)) {
    return `${label} の種類「${preview(value.type)}」は未対応です。`;
  }
  if (value.type === "window") {
    if (!isPlanWall(value.wall)) return `${label} の壁は 上 / 右 / 下 / 左 のいずれかです。`;
    const offsetError = checkNonNegative(value.offset, `${label} の始点からの距離`);
    if (offsetError) return offsetError;
    const width = checkPositive(value.width, LIMITS.fixture, `${label} の幅`);
    if (width) return width;
    const sill = checkNonNegative(value.sillHeight, `${label} の下端の高さ`);
    if (sill) return sill;
    const height = checkPositive(value.height, LIMITS.fixture, `${label} の窓の高さ`);
    if (height) return height;
    const recess = checkNonNegative(value.recess, `${label} の出幅`);
    if (recess) return recess;
    if (typeof value.style !== "string" || !KNOWN_WINDOW_STYLES.has(value.style)) {
      return `${label} の種類は 引き違い または その他 です。`;
    }
  } else if (value.type === "entrance") {
    if (!isPlanWall(value.wall)) return `${label} の壁は 上 / 右 / 下 / 左 のいずれかです。`;
    const offsetError = checkNonNegative(value.offset, `${label} の始点からの距離`);
    if (offsetError) return offsetError;
    const width = checkPositive(value.width, LIMITS.fixture, `${label} の幅`);
    if (width) return width;
    const height = checkPositive(value.height, LIMITS.fixture, `${label} の高さ`);
    if (height) return height;
    const clearance = checkNonNegative(value.clearance, `${label} の入口前の空き`);
    if (clearance) return clearance;
    if (typeof value.door !== "string" || !KNOWN_ENTRANCE_DOORS.has(value.door)) {
      return `${label} の扉は なし / 片開き / 引き戸 のいずれかです。`;
    }
    if (value.hinge !== undefined && (typeof value.hinge !== "string" || !KNOWN_HINGES.has(value.hinge))) {
      return `${label} の吊元は 左 または 右 です。`;
    }
  } else if (value.type === "beam") {
    if (!Array.isArray(value.walls) || value.walls.some((wall) => !isPlanWall(wall))) {
      return `${label} の壁は 上・右・下・左 から選んでください。`;
    }
    const protrusion = checkPositive(value.protrusion, LIMITS.fixture, `${label} の出っ張り`);
    if (protrusion) return protrusion;
    const drop = checkPositive(value.drop, LIMITS.fixture, `${label} の下がり`);
    if (drop) return drop;
  } else {
    const anchorError = validateAnchor(value.anchor, label);
    if (anchorError) return anchorError;
    if (value.type === "pillar") {
      const spanX = checkPositive(value.spanX, LIMITS.fixture, `${label} の横`);
      if (spanX) return spanX;
      const spanZ = checkPositive(value.spanZ, LIMITS.fixture, `${label} の縦`);
      if (spanZ) return spanZ;
    } else {
      const width = checkPositive(value.width, LIMITS.fixture, `${label} の幅`);
      if (width) return width;
      const depth = checkPositive(value.depth, LIMITS.fixture, `${label} の奥行`);
      if (depth) return depth;
      const height = checkPositive(value.height, LIMITS.fixture, `${label} の高さ`);
      if (height) return height;
      if (typeof value.door !== "string" || !KNOWN_DOORS.has(value.door)) {
        return `${label} の扉は なし / 片開き / 両開き / 引き戸 のいずれかです。`;
      }
      if (value.hinge !== undefined && (typeof value.hinge !== "string" || !KNOWN_HINGES.has(value.hinge))) {
        return `${label} の吊元は 左 または 右 です。`;
      }
    }
  }
  if (!isFiniteNumber(room.width) || !isFiniteNumber(room.depth) || !isFiniteNumber(room.ceilingHeight)) return null;
  return fixtureError(value as unknown as RoomFixture, {
    width: room.width,
    depth: room.depth,
    ceilingHeight: room.ceilingHeight,
  });
}

function validateAnchor(value: unknown, label: string): string | null {
  if (!isRecord(value)) return `${label} の位置はオブジェクトである必要があります。`;
  if (value.kind === "corner") {
    if (!isPlanCorner(value.corner)) return `${label} の角は 左上 / 右上 / 左下 / 右下 のいずれかです。`;
    return null;
  }
  if (value.kind === "wall") {
    if (!isPlanWall(value.wall)) return `${label} の壁は 上 / 右 / 下 / 左 のいずれかです。`;
    if (!isFiniteNumber(value.offset) || value.offset < 0 || value.offset > 40) {
      return `${label} の壁に沿った位置は 0 以上の有限数である必要があります。`;
    }
    return null;
  }
  return `${label} の位置種別が不正です。`;
}

function checkNonNegative(value: unknown, label: string): string | null {
  if (typeof value === "number" && Number.isNaN(value)) return `${label}が NaN です。`;
  if (!isFiniteNumber(value) || value < 0 || value > 20) return `${label}は 0〜${mToCm(20)}cm の範囲で指定してください。`;
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

export function resolveLayout(project: Project, layoutId: string): Furniture[] {
  const layout = project.layouts.find((item) => item.id === layoutId);
  if (!layout) return [];
  const byId = new Map(project.furniture.map((item) => [item.id, item]));
  const resolved: Furniture[] = [];
  for (const placement of layout.placements) {
    const item = byId.get(placement.furnitureId);
    if (!item) continue;
    resolved.push({
      ...item,
      x: placement.x,
      z: placement.z,
      rotation: placement.rotation,
      elevation: placement.elevation,
      allowOverlapIds: placement.allowOverlapIds,
    });
  }
  return resolved;
}

export function activeFurniture(project: Project): Furniture[] {
  return resolveLayout(project, project.activeLayoutId);
}
