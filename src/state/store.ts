import { create } from "zustand";
import { rectangleOutline } from "../domain/geometry";
import { createInitialProject } from "../domain/initial";
import { activeFurniture, LIMITS, parseProjectJson } from "../domain/schema";
import { loadProject, saveProject, type KeyValueStorage, type LoadStatus } from "../domain/storage";
import type { Furniture, FurnitureShape, Project, Room } from "../domain/types";
import { normalizeDegrees, roundM } from "../domain/units";

const HISTORY_LIMIT = 100;

export type ViewMode = "2d" | "3d";
export type UpdateMode = "commit" | "preview";

export interface ViewCommand {
  id: number;
  type: "zoom-in" | "zoom-out" | "reset";
}

interface Snapshot {
  project: Project;
  selectedId: string | null;
}

export interface EditorState {
  project: Project;
  selectedId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  gestureBefore: Snapshot | null;
  viewMode: ViewMode;
  wallsVisible: boolean;
  wallsTransparent: boolean;
  orbitEnabled: boolean;
  viewCommand: ViewCommand | null;
  persistAllowed: boolean;
  loadStatus: LoadStatus;
  loadError: string | null;
  corruptRaw: string | null;
  importError: string | null;
  select: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setWallsVisible: (value: boolean) => void;
  setWallsTransparent: (value: boolean) => void;
  requestViewCommand: (type: ViewCommand["type"]) => void;
  beginGesture: () => void;
  endGesture: () => void;
  cancelGesture: () => void;
  updateFurniture: (id: string, patch: FurniturePatch, mode?: UpdateMode) => void;
  updateRoom: (patch: RoomPatch, mode?: UpdateMode) => void;
  rotateBy: (id: string, deltaDeg: number) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  addFurniture: (shape: FurnitureShape) => void;
  undo: () => void;
  redo: () => void;
  importJson: (text: string) => { ok: true } | { ok: false; error: string };
  resumePersist: () => void;
  dismissImportError: () => void;
}

export type FurniturePatch = Partial<
  Pick<Furniture, "name" | "shape" | "width" | "depth" | "height" | "x" | "z" | "rotation" | "color">
>;

export type RoomPatch = Partial<Pick<Room, "name" | "width" | "depth" | "ceilingHeight">>;

let boundStorage: KeyValueStorage | null = null;

function snapshotOf(project: Project, selectedId: string | null): Snapshot {
  return { project: structuredClone(project), selectedId };
}

function trim(history: Snapshot[]): Snapshot[] {
  if (history.length <= HISTORY_LIMIT) return history;
  return history.slice(history.length - HISTORY_LIMIT);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) sorted[key] = sortKeys(record[key]);
    return sorted;
  }
  return value;
}

function sameDocument(a: Project, b: Project): boolean {
  return stableStringify(a) === stableStringify(b);
}

export const useEditor = create<EditorState>((set, get) => {
  const persist = () => {
    const state = get();
    if (!boundStorage || !state.persistAllowed || state.gestureBefore) return;
    try {
      saveProject(boundStorage, state.project);
    } catch {
      set({
        persistAllowed: false,
        loadError: "ブラウザへの保存に失敗しました。自動保存を停止しました。書き出しはできます。",
      });
    }
  };

  const commitProject = (project: Project, selectedId: string | null) => {
    const current = get();
    if (sameDocument(current.project, project) && current.selectedId === selectedId) return;
    set({
      project,
      selectedId,
      past: trim([...current.past, snapshotOf(current.project, current.selectedId)]),
      future: [],
    });
    persist();
  };

  return {
    project: createInitialProject(),
    selectedId: null,
    past: [],
    future: [],
    gestureBefore: null,
    viewMode: "2d",
    wallsVisible: true,
    wallsTransparent: true,
    orbitEnabled: true,
    viewCommand: null,
    persistAllowed: false,
    loadStatus: "empty",
    loadError: null,
    corruptRaw: null,
    importError: null,

    select: (id) => set({ selectedId: id }),
    setViewMode: (mode) => set({ viewMode: mode }),
    setWallsVisible: (wallsVisible) => set({ wallsVisible }),
    setWallsTransparent: (wallsTransparent) => set({ wallsTransparent }),
    requestViewCommand: (type) =>
      set({ viewCommand: { id: (get().viewCommand?.id ?? 0) + 1, type } }),

    beginGesture: () => {
      if (get().gestureBefore) return;
      const { project, selectedId } = get();
      set({ gestureBefore: snapshotOf(project, selectedId), orbitEnabled: false });
    },

    endGesture: () => {
      const before = get().gestureBefore;
      if (!before) return;
      const { project, past, future } = get();
      const changed = !sameDocument(before.project, project);
      set({
        gestureBefore: null,
        orbitEnabled: true,
        past: changed ? trim([...past, before]) : past,
        future: changed ? [] : future,
      });
      if (changed) persist();
    },

    cancelGesture: () => {
      const before = get().gestureBefore;
      if (!before) return;
      set({
        project: before.project,
        selectedId: before.selectedId,
        gestureBefore: null,
        orbitEnabled: true,
      });
    },

    updateFurniture: (id, patch, mode = "commit") => {
      const resolved: UpdateMode = mode === "preview" && !get().gestureBefore ? "commit" : mode;
      if (resolved === "commit" && get().gestureBefore) get().endGesture();
      const current = get().project;
      const next = mapFurniture(current, id, (item) => applyFurniturePatch(item, patch));
      if (!next || sameDocument(current, next)) return;
      if (resolved === "preview") {
        set({ project: next });
        return;
      }
      commitProject(next, get().selectedId);
    },

    updateRoom: (patch, mode = "commit") => {
      const resolved: UpdateMode = mode === "preview" && !get().gestureBefore ? "commit" : mode;
      if (resolved === "commit" && get().gestureBefore) get().endGesture();
      const current = get().project;
      const room = applyRoomPatch(current.room, patch);
      if (!room) return;
      const next: Project = { ...current, room };
      if (sameDocument(current, next)) return;
      if (resolved === "preview") {
        set({ project: next });
        return;
      }
      commitProject(next, get().selectedId);
    },

    rotateBy: (id, deltaDeg) => {
      const item = activeFurniture(get().project).find((entry) => entry.id === id);
      if (!item) return;
      get().updateFurniture(id, { rotation: normalizeDegrees(item.rotation + deltaDeg) }, "commit");
    },

    duplicate: (id) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      const source = activeFurniture(project).find((item) => item.id === id);
      if (!source) return;
      const copy: Furniture = {
        ...source,
        id: createId(),
        name: `${source.name} のコピー`.slice(0, LIMITS.name.max),
        x: roundM(source.x + 0.2),
        z: roundM(source.z + 0.2),
      };
      commitProject(mapActive(project, (items) => [...items, copy]), copy.id);
    },

    remove: (id) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      if (!activeFurniture(project).some((item) => item.id === id)) return;
      const selectedId = get().selectedId === id ? null : get().selectedId;
      commitProject(
        mapActive(project, (items) => items.filter((item) => item.id !== id)),
        selectedId,
      );
    },

    addFurniture: (shape) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      const diameter = 0.5;
      const item: Furniture = {
        id: createId(),
        name: shape === "cylinder" ? "新しい円柱" : "新しい家具",
        shape,
        width: shape === "cylinder" ? diameter : 0.6,
        depth: shape === "cylinder" ? diameter : 0.4,
        height: 0.5,
        x: roundM(project.room.width / 2),
        z: roundM(project.room.depth / 2),
        rotation: 0,
        color: shape === "cylinder" ? "#90a4ae" : "#8d6e63",
      };
      commitProject(mapActive(project, (items) => [...items, item]), item.id);
    },

    undo: () => {
      if (get().gestureBefore) get().endGesture();
      const { past, future, project, selectedId } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      set({
        past: past.slice(0, -1),
        future: [...future, snapshotOf(project, selectedId)],
        project: previous.project,
        selectedId: previous.selectedId,
      });
      persist();
    },

    redo: () => {
      if (get().gestureBefore) get().endGesture();
      const { past, future, project, selectedId } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      set({
        future: future.slice(0, -1),
        past: trim([...past, snapshotOf(project, selectedId)]),
        project: next.project,
        selectedId: next.selectedId,
      });
      persist();
    },

    importJson: (text) => {
      if (get().gestureBefore) get().endGesture();
      const parsed = parseProjectJson(text);
      if (!parsed.ok) {
        set({ importError: parsed.error });
        return parsed;
      }
      const { project, selectedId } = get();
      set({
        project: parsed.project,
        selectedId: null,
        past: trim([...get().past, snapshotOf(project, selectedId)]),
        future: [],
        importError: null,
      });
      persist();
      return { ok: true };
    },

    resumePersist: () => {
      set({ persistAllowed: true, loadStatus: "ok", loadError: null });
      persist();
    },

    dismissImportError: () => set({ importError: null }),
  };
});

function mapActive(project: Project, fn: (items: Furniture[]) => Furniture[]): Project {
  return {
    ...project,
    layouts: project.layouts.map((layout) =>
      layout.id === project.activeLayoutId ? { ...layout, furniture: fn(layout.furniture) } : layout,
    ),
  };
}

function mapFurniture(
  project: Project,
  id: string,
  fn: (item: Furniture) => Furniture | null,
): Project | null {
  if (!activeFurniture(project).some((item) => item.id === id)) return null;
  let changed = false;
  const next = mapActive(project, (items) =>
    items.map((item) => {
      if (item.id !== id) return item;
      const updated = fn(item);
      if (!updated || furnitureEqual(item, updated)) return item;
      changed = true;
      return updated;
    }),
  );
  return changed ? next : null;
}

function furnitureEqual(a: Furniture, b: Furniture): boolean {
  return stableStringify(a) === stableStringify(b);
}

function applyFurniturePatch(item: Furniture, patch: FurniturePatch): Furniture | null {
  const shape = patch.shape ?? item.shape;
  if (shape !== "box" && shape !== "cylinder") return null;
  let width = patch.width !== undefined ? roundM(patch.width) : item.width;
  let depth = patch.depth !== undefined ? roundM(patch.depth) : item.depth;
  const height = patch.height !== undefined ? roundM(patch.height) : item.height;
  const x = patch.x !== undefined ? roundM(patch.x) : item.x;
  const z = patch.z !== undefined ? roundM(patch.z) : item.z;
  const rotation = patch.rotation !== undefined ? normalizeDegrees(patch.rotation) : item.rotation;
  const name = patch.name !== undefined ? patch.name : item.name;
  const color = patch.color !== undefined ? patch.color : item.color;
  if (shape === "cylinder") {
    if (patch.width !== undefined) depth = width;
    else if (patch.depth !== undefined) width = depth;
    else depth = width;
  }
  if (!inRange(width, LIMITS.furniture) || !inRange(depth, LIMITS.furniture) || !inRange(height, LIMITS.furniture)) {
    return null;
  }
  if (!inRange(x, LIMITS.position) || !inRange(z, LIMITS.position)) return null;
  if (typeof name !== "string" || name.trim().length === 0 || name.length > LIMITS.name.max) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return null;
  return { ...item, name, shape, width, depth, height, x, z, rotation, color };
}

function applyRoomPatch(room: Room, patch: RoomPatch): Room | null {
  const width = patch.width !== undefined ? roundM(patch.width) : room.width;
  const depth = patch.depth !== undefined ? roundM(patch.depth) : room.depth;
  const ceilingHeight = patch.ceilingHeight !== undefined ? roundM(patch.ceilingHeight) : room.ceilingHeight;
  const name = patch.name !== undefined ? patch.name : room.name;
  if (!inRange(width, LIMITS.roomWidth) || !inRange(depth, LIMITS.roomDepth) || !inRange(ceilingHeight, LIMITS.ceiling)) {
    return null;
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.length > LIMITS.name.max) return null;
  const sizeChanged = width !== room.width || depth !== room.depth;
  return {
    ...room,
    name,
    width,
    depth,
    ceilingHeight,
    outline: sizeChanged ? rectangleOutline(width, depth) : room.outline,
  };
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}

export function initEditor(storage: KeyValueStorage): void {
  boundStorage = storage;
  const loaded = loadProject(storage);
  useEditor.setState({
    project: loaded.project,
    selectedId: null,
    past: [],
    future: [],
    gestureBefore: null,
    viewMode: "2d",
    wallsVisible: true,
    wallsTransparent: true,
    orbitEnabled: true,
    viewCommand: null,
    persistAllowed: loaded.status !== "corrupt",
    loadStatus: loaded.status,
    loadError: loaded.error ?? null,
    corruptRaw: loaded.raw ?? null,
    importError: null,
  });
  if (loaded.status === "empty") {
    try {
      saveProject(storage, loaded.project);
    } catch {
      useEditor.setState({
        persistAllowed: false,
        loadError: "ブラウザへの保存に失敗しました。自動保存を停止しました。書き出しはできます。",
      });
    }
  }
}
