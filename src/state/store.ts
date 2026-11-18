import { create } from "zustand";
import { rectangleOutline } from "../domain/geometry";
import { createInitialProject } from "../domain/initial";
import { activeFurniture, activeLayout, LIMITS, parseProjectJson } from "../domain/schema";
import { loadProject, saveProject, type KeyValueStorage, type LoadStatus } from "../domain/storage";
import { isContainer, sanitizeStoredItem } from "../domain/containers";
import { fixtureError } from "../domain/fixtures";
import type { Furniture, FurnitureItem, FurnitureShape, Placement, Project, Room, RoomFixture, StorageSpace, StoredItem } from "../domain/types";
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
  selectionSeq: number;
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
  /** Pre-v4 text waiting for a one-time backup. Not part of undo. */
  legacyRaw: string | null;
  /** Pre-v5 text waiting for a one-time backup. Not part of undo. */
  legacyV4Raw: string | null;
  /** Read-only comparison against the baseline. Not part of the document. */
  compareLayoutId: string | null;
  /** Layout plan, or the storage ledger. Not part of the saved document. */
  workMode: "layout" | "storage";
  importError: string | null;
  select: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setWorkMode: (mode: "layout" | "storage") => void;
  setActiveLayout: (id: string) => void;
  duplicateLayout: () => void;
  setCompareLayout: (id: string | null) => void;
  deleteFurniture: (id: string) => void;
  addStorageSpace: (furnitureId: string, space: StorageSpace) => void;
  updateStorageSpace: (furnitureId: string, space: StorageSpace, mode?: UpdateMode) => void;
  removeStorageSpace: (furnitureId: string, spaceId: string) => void;
  addStoredItem: (item: StoredItem) => void;
  updateStoredItem: (item: StoredItem, mode?: UpdateMode) => void;
  removeStoredItem: (id: string, contents?: "release" | "discard") => void;
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
  saveStatus: SaveStatus;
  savedAt: number | null;
  saveNow: () => void;
  addFixture: (fixture: RoomFixture) => void;
  replaceFixture: (fixture: RoomFixture, mode?: UpdateMode) => void;
  removeFixture: (id: string) => void;
}

export type SaveStatus = "idle" | "pending" | "saved" | "error";

export type FurniturePatch = Partial<
  Pick<Furniture, "name" | "shape" | "width" | "depth" | "height" | "x" | "z" | "rotation" | "color" | "elevation" | "allowOverlapIds">
>;

export type RoomPatch = Partial<Pick<Room, "name" | "width" | "depth" | "ceilingHeight">>;

let boundStorage: KeyValueStorage | null = null;
let autosaveDelayMs = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function clearSaveTimer(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

export function saveStatusLabel(status: SaveStatus, savedAt: number | null, now = new Date()): string {
  if (status === "error") return "保存できませんでした";
  if (status === "pending") return "未保存の変更あり";
  if (status === "saved" && savedAt !== null) {
    const when = new Date(savedAt);
    const shown = Number.isNaN(when.getTime()) ? now : when;
    return `保存済み ${shown.getHours()}:${String(shown.getMinutes()).padStart(2, "0")}`;
  }
  return "";
}

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
  const persistNow = () => {
    clearSaveTimer();
    const state = get();
    if (state.gestureBefore) return;
    if (!boundStorage || !state.persistAllowed || state.loadStatus === "corrupt") {
      if (state.loadStatus === "corrupt" || !state.persistAllowed) set({ saveStatus: "error" });
      return;
    }
    try {
      saveProject(boundStorage, state.project, state.legacyRaw, state.legacyV4Raw);
      set({ saveStatus: "saved", savedAt: Date.now(), legacyRaw: null, legacyV4Raw: null });
    } catch {
      set({
        persistAllowed: false,
        saveStatus: "error",
        loadError: "保存できませんでした",
      });
    }
  };

  const scheduleSave = () => {
    const state = get();
    if (!state.persistAllowed || state.loadStatus === "corrupt" || state.gestureBefore) return;
    if (autosaveDelayMs <= 0) {
      persistNow();
      return;
    }
    set({ saveStatus: "pending" });
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      persistNow();
    }, autosaveDelayMs);
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
    scheduleSave();
  };

  return {
    project: createInitialProject(),
    selectedId: null,
    selectionSeq: 0,
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
    legacyRaw: null,
    legacyV4Raw: null,
    compareLayoutId: null,
    workMode: "layout",
    importError: null,
    saveStatus: "idle",
    savedAt: null,

    select: (id) =>
      set((state) => ({
        selectedId: id,
        selectionSeq: id ? state.selectionSeq + 1 : state.selectionSeq,
      })),
    setViewMode: (mode) => set({ viewMode: mode, compareLayoutId: mode === "3d" ? null : get().compareLayoutId }),
    setWorkMode: (workMode) => set({ workMode }),
    setActiveLayout: (id) => {
      const project = get().project;
      if (!project.layouts.some((layout) => layout.id === id) || project.activeLayoutId === id) return;
      const next = { ...project, activeLayoutId: id };
      const selected = activeFurniture(next).some((item) => item.id === get().selectedId) ? get().selectedId : null;
      set({ project: next, selectedId: selected });
      scheduleSave();
    },
    duplicateLayout: () => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      const source = activeLayout(project);
      const copyId = createId();
      const copy = {
        id: copyId,
        name: nextVariantName(project.layouts),
        placements: structuredClone(source.placements),
      };
      commitProject({ ...project, layouts: [...project.layouts, copy], activeLayoutId: copyId }, null);
    },
    setCompareLayout: (id) => {
      if (id !== null) {
        const project = get().project;
        if (!project.layouts.some((layout) => layout.id === id) || id === project.baselineLayoutId) return;
      }
      set({ compareLayoutId: id, viewMode: id ? "2d" : get().viewMode });
    },
    deleteFurniture: (id) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      if (!project.furniture.some((item) => item.id === id)) return;
      const removedSpaces = new Set(
        (project.furniture.find((item) => item.id === id)?.spaces ?? []).map((space) => space.id),
      );
      const next: Project = {
        ...project,
        furniture: project.furniture.filter((item) => item.id !== id),
        storedItems: project.storedItems.filter((item) => !removedSpaces.has(item.spaceId)),
        layouts: project.layouts.map((layout) => ({
          ...layout,
          placements: layout.placements
            .filter((placement) => placement.furnitureId !== id)
            .map((placement) => ({
              ...placement,
              allowOverlapIds: placement.allowOverlapIds.filter((other) => other !== id),
            })),
        })),
      };
      commitProject(next, get().selectedId === id ? null : get().selectedId);
    },
    addStorageSpace: (furnitureId, space) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      if (!project.furniture.some((item) => item.id === furnitureId)) return;
      if (project.furniture.some((item) => (item.spaces ?? []).some((entry) => entry.id === space.id))) return;
      commitProject(mapSpaces(project, furnitureId, (spaces) => [...spaces, space]), get().selectedId);
    },
    updateStorageSpace: (furnitureId, space, mode = "commit") => {
      const resolved = openUpdate(get, mode);
      const project = get().project;
      const owner = project.furniture.find((item) => item.id === furnitureId);
      if (!owner || !(owner.spaces ?? []).some((entry) => entry.id === space.id)) return;
      const next = mapSpaces(project, furnitureId, (spaces) =>
        spaces.map((entry) => (entry.id === space.id ? { ...entry, ...space } : entry)),
      );
      if (sameDocument(project, next)) return;
      if (resolved === "preview") {
        set({ project: next });
        return;
      }
      commitProject(next, get().selectedId);
    },
    removeStorageSpace: (furnitureId, spaceId) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      const next: Project = {
        ...mapSpaces(project, furnitureId, (spaces) => spaces.filter((space) => space.id !== spaceId)),
        storedItems: project.storedItems.filter((item) => item.spaceId !== spaceId),
      };
      commitProject(next, get().selectedId);
    },
    addStoredItem: (item) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      if (!project.furniture.some((entry) => (entry.spaces ?? []).some((space) => space.id === item.spaceId))) return;
      if (project.storedItems.some((entry) => entry.id === item.id)) return;
      commitProject({ ...project, storedItems: [...project.storedItems, item] }, get().selectedId);
    },
    updateStoredItem: (item, mode = "commit") => {
      const resolved = openUpdate(get, mode);
      const project = get().project;
      const previous = project.storedItems.find((entry) => entry.id === item.id);
      if (!previous) return;
      if (!project.furniture.some((entry) => (entry.spaces ?? []).some((space) => space.id === item.spaceId))) return;
      const merged = sanitizeStoredItem(mergeStoredItem(previous, item), project.storedItems);
      let storedItems = project.storedItems.map((entry) => (entry.id === item.id ? merged : entry));
      if (isContainer(previous) && !isContainer(merged)) {
        storedItems = storedItems.map((entry) => clearContainerLink(entry, merged.id));
      } else if (isContainer(merged) && previous.spaceId !== merged.spaceId) {
        storedItems = storedItems.map((entry) =>
          entry.containerId === merged.id ? { ...entry, spaceId: merged.spaceId } : entry,
        );
      }
      const next: Project = { ...project, storedItems };
      if (sameDocument(project, next)) return;
      if (resolved === "preview") {
        set({ project: next });
        return;
      }
      commitProject(next, get().selectedId);
    },
    removeStoredItem: (id, contents) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      const kids = project.storedItems.filter((item) => item.containerId === id);
      if (kids.length > 0 && contents !== "release" && contents !== "discard") return;
      let storedItems = project.storedItems.filter((item) => item.id !== id);
      if (contents === "discard") {
        storedItems = storedItems.filter((item) => item.containerId !== id);
      } else {
        storedItems = storedItems.map((entry) => clearContainerLink(entry, id));
      }
      commitProject({ ...project, storedItems }, get().selectedId);
    },
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
      if (changed) scheduleSave();
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
      const currentItem = activeFurniture(current).find((item) => item.id === id);
      if (!currentItem) return;
      const patched = applyFurniturePatch(currentItem, patch);
      if (!patched) return;
      const next = projectWithResolved(current, id, patched);
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
      const copyId = createId();
      const catalog: FurnitureItem = {
        id: copyId,
        name: `${source.name} のコピー`.slice(0, LIMITS.name.max),
        shape: source.shape,
        width: source.width,
        depth: source.depth,
        height: source.height,
        color: source.color,
        spaces: (source.spaces ?? []).map((space) => ({ ...space, id: createId() })),
      };
      const placement: Placement = {
        furnitureId: copyId,
        x: roundM(source.x + 0.2),
        z: roundM(source.z + 0.2),
        rotation: source.rotation,
        elevation: source.elevation ?? 0,
        allowOverlapIds: [...(source.allowOverlapIds ?? [])],
      };
      commitProject(placeOnActive({ ...project, furniture: [...project.furniture, catalog] }, placement), copyId);
    },

    remove: (id) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      if (!activeFurniture(project).some((item) => item.id === id)) return;
      const selectedId = get().selectedId === id ? null : get().selectedId;
      commitProject(dropFromLayout(project, project.activeLayoutId, id), selectedId);
    },

    addFurniture: (shape) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      const diameter = 0.5;
      const id = createId();
      const catalog: FurnitureItem = {
        id,
        name: shape === "cylinder" ? "新しい円柱" : "新しい家具",
        shape,
        width: shape === "cylinder" ? diameter : 0.6,
        depth: shape === "cylinder" ? diameter : 0.4,
        height: 0.5,
        color: shape === "cylinder" ? "#90a4ae" : "#8d6e63",
        spaces: [],
      };
      const placement: Placement = {
        furnitureId: id,
        x: roundM(project.room.width / 2),
        z: roundM(project.room.depth / 2),
        rotation: 0,
        elevation: 0,
        allowOverlapIds: [],
      };
      commitProject(placeOnActive({ ...project, furniture: [...project.furniture, catalog] }, placement), id);
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
      scheduleSave();
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
      scheduleSave();
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
      persistNow();
      return { ok: true };
    },

    resumePersist: () => {
      set({ persistAllowed: true, loadStatus: "ok", loadError: null });
      persistNow();
    },

    saveNow: () => {
      if (get().loadStatus === "corrupt") {
        set({ saveStatus: "error" });
        return;
      }
      if (!get().persistAllowed) set({ persistAllowed: true });
      persistNow();
    },

    addFixture: (fixture) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      if (fixtureError(fixture, project.room)) return;
      if (project.room.fixtures.some((item) => item.id === fixture.id)) return;
      commitProject(
        { ...project, room: { ...project.room, fixtures: [...project.room.fixtures, fixture] } },
        get().selectedId,
      );
    },

    replaceFixture: (fixture, mode = "commit") => {
      const resolved: UpdateMode = mode === "preview" && !get().gestureBefore ? "commit" : mode;
      if (resolved === "commit" && get().gestureBefore) get().endGesture();
      const project = get().project;
      if (!project.room.fixtures.some((item) => item.id === fixture.id)) return;
      if (fixtureError(fixture, project.room)) return;
      const next: Project = {
        ...project,
        room: {
          ...project.room,
          fixtures: project.room.fixtures.map((item) => (item.id === fixture.id ? fixture : item)),
        },
      };
      if (sameDocument(project, next)) return;
      if (resolved === "preview") {
        set({ project: next });
        return;
      }
      commitProject(next, get().selectedId);
    },

    removeFixture: (id) => {
      if (get().gestureBefore) get().endGesture();
      const project = get().project;
      if (!project.room.fixtures.some((item) => item.id === id)) return;
      commitProject(
        {
          ...project,
          room: { ...project.room, fixtures: project.room.fixtures.filter((item) => item.id !== id) },
        },
        get().selectedId,
      );
    },

    dismissImportError: () => set({ importError: null }),
  };
});

function openUpdate(get: () => EditorState, mode: UpdateMode): UpdateMode {
  const resolved: UpdateMode = mode === "preview" && !get().gestureBefore ? "commit" : mode;
  if (resolved === "commit" && get().gestureBefore) get().endGesture();
  return resolved;
}

function mergeStoredItem(previous: StoredItem, next: StoredItem): StoredItem {
  const merged: StoredItem = { ...previous, ...next };
  if (next.width === undefined) delete merged.width;
  if (next.depth === undefined) delete merged.depth;
  if (next.height === undefined) delete merged.height;
  if (next.innerWidth === undefined) delete merged.innerWidth;
  if (next.innerDepth === undefined) delete merged.innerDepth;
  if (next.innerHeight === undefined) delete merged.innerHeight;
  if (next.containerId === undefined) delete merged.containerId;
  return merged;
}

function clearContainerLink(item: StoredItem, containerId: string): StoredItem {
  if (item.containerId !== containerId) return item;
  const next: StoredItem = { ...item };
  delete next.containerId;
  return next;
}

function mapSpaces(project: Project, furnitureId: string, fn: (spaces: StorageSpace[]) => StorageSpace[]): Project {
  return {
    ...project,
    furniture: project.furniture.map((item) =>
      item.id === furnitureId ? { ...item, spaces: fn(item.spaces ?? []) } : item,
    ),
  };
}

function nextVariantName(layouts: { name: string }[]): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const letter of letters) {
    const name = `検討案${letter}`;
    if (!layouts.some((layout) => layout.name === name)) return name;
  }
  return `検討案${layouts.length + 1}`;
}

function projectWithResolved(project: Project, id: string, patched: Furniture): Project | null {
  const furniture = project.furniture.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      name: patched.name,
      shape: patched.shape,
      width: patched.width,
      depth: patched.depth,
      height: patched.height,
      color: patched.color,
    };
  });
  const layouts = project.layouts.map((layout) => {
    if (layout.id !== project.activeLayoutId) return layout;
    return {
      ...layout,
      placements: layout.placements.map((placement) => {
        if (placement.furnitureId !== id) return placement;
        return {
          ...placement,
          x: patched.x,
          z: patched.z,
          rotation: patched.rotation,
          elevation: patched.elevation ?? 0,
          allowOverlapIds: [...(patched.allowOverlapIds ?? [])],
        };
      }),
    };
  });
  const next = { ...project, furniture, layouts };
  return sameDocument(project, next) ? null : next;
}

function placeOnActive(project: Project, placement: Placement): Project {
  return {
    ...project,
    layouts: project.layouts.map((layout) =>
      layout.id === project.activeLayoutId
        ? { ...layout, placements: [...layout.placements, placement] }
        : layout,
    ),
  };
}

function dropFromLayout(project: Project, layoutId: string, furnitureId: string): Project {
  return {
    ...project,
    layouts: project.layouts.map((layout) => {
      if (layout.id !== layoutId) return layout;
      return {
        ...layout,
        placements: layout.placements
          .filter((placement) => placement.furnitureId !== furnitureId)
          .map((placement) => ({
            ...placement,
            allowOverlapIds: placement.allowOverlapIds.filter((other) => other !== furnitureId),
          })),
      };
    }),
  };
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
  const elevation = patch.elevation !== undefined ? roundM(patch.elevation) : (item.elevation ?? 0);
  const allowOverlapIds = patch.allowOverlapIds !== undefined ? [...patch.allowOverlapIds] : item.allowOverlapIds;
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
  if (!Number.isFinite(elevation) || elevation < 0 || elevation > 20) return null;
  if (allowOverlapIds !== undefined && allowOverlapIds.some((other) => other === item.id)) return null;
  return { ...item, name, shape, width, depth, height, x, z, rotation, color, elevation, allowOverlapIds };
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

export function initEditor(storage: KeyValueStorage, options?: { autosaveDelayMs?: number }): void {
  clearSaveTimer();
  boundStorage = storage;
  autosaveDelayMs = options?.autosaveDelayMs ?? 0;
  const loaded = loadProject(storage);
  const now = Date.now();
  useEditor.setState({
    project: loaded.project,
    selectedId: null,
    selectionSeq: 0,
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
    legacyRaw: loaded.legacyRaw ?? null,
    legacyV4Raw: loaded.legacyV4Raw ?? null,
    compareLayoutId: null,
    workMode: "layout",
    importError: null,
    saveStatus: loaded.status === "ok" ? "saved" : "idle",
    savedAt: loaded.status === "ok" ? now : null,
  });
  if (loaded.status === "empty") {
    try {
      saveProject(storage, loaded.project);
      useEditor.setState({ saveStatus: "saved", savedAt: Date.now() });
    } catch {
      useEditor.setState({
        persistAllowed: false,
        saveStatus: "error",
        loadError: "保存できませんでした",
      });
    }
  }
}
