/**
 * Project file schema v4.
 * Internal lengths are meters. Every length in the UI is centimeters (0.1 cm).
 * Versions 1, 2, and 3 migrate on load. Furniture identity lives in `furniture`;
 * each layout stores placements only. See AGENTS.md for the coordinate system.
 */

export const SCHEMA_VERSION = 4;

export interface Vec2 {
  /** Meters, room X (width axis). */
  x: number;
  /** Meters, room Z (depth axis). */
  z: number;
}

export type OpeningType = "door" | "window";

/** Reserved for a later version. The editor does not create these yet. */
export interface Opening {
  id: string;
  type: OpeningType;
  /** Index of the outline edge (vertex i -> i+1, wrapping). */
  wallIndex: number;
  /** Meters along the edge from its start vertex to the opening start. */
  offset: number;
  width: number;
  height: number;
  /** Meters above the floor. Doors use 0. */
  sillHeight: number;
}

export interface Room {
  id: string;
  name: string;
  /** Interior width in meters along +X. Matches the outline bounding box. */
  width: number;
  /** Interior depth in meters along +Z. Matches the outline bounding box. */
  depth: number;
  /** Meters, floor to ceiling. */
  ceilingHeight: number;
  /**
   * Floor outline in the XZ plane, meters, counterclockwise when viewed
   * from above (+Y). Bounding box must be exactly [0, width] x [0, depth].
   * A rectangle is (0,0) -> (width,0) -> (width,depth) -> (0,depth).
   */
  outline: Vec2[];
  openings: Opening[];
  /**
   * Solid additions inside the rectangular room. They do not change `outline`.
   * Empty for a bare rectangle.
   */
  fixtures: RoomFixture[];
}

/** 2D plan corners. 左上 is back-left (x=0, z=depth) because +Z is up the plan. */
export type PlanCorner = "back-left" | "back-right" | "front-left" | "front-right";

/**
 * Walls as seen on the plan: 上 back, 右 right, 下 front, 左 left.
 * A wall anchor's offset starts at the outline's counterclockwise start:
 * 下 left end, 右 front end, 上 right end, 左 back end.
 */
export type PlanWall = "back" | "right" | "front" | "left";

export type FixtureAnchor =
  | { kind: "corner"; corner: PlanCorner }
  | { kind: "wall"; wall: PlanWall; /** Meters from the wall start. */ offset: number };

export type StorageDoor = "none" | "single" | "double" | "sliding";
export type HingeSide = "left" | "right";

interface FixtureBase {
  id: string;
}

/** Floor-to-ceiling box. spanX is 横 (along X), spanZ is 縦 (along Z). */
export interface PillarFixture extends FixtureBase {
  type: "pillar";
  anchor: FixtureAnchor;
  spanX: number;
  spanZ: number;
}

/**
 * Built-in cabinet. On a wall, `width` runs along the wall and `depth` sticks into the room.
 * In a corner, `width` is along X and `depth` is along Z. The door face is `width` long.
 */
export interface StorageFixture extends FixtureBase {
  type: "storage";
  anchor: FixtureAnchor;
  width: number;
  depth: number;
  /** Meters. Must stay below the ceiling. */
  height: number;
  door: StorageDoor;
  /** Used when door is "single". Ignored otherwise. */
  hinge: HingeSide;
}

/** Ceiling beam along one or more walls. */
export interface BeamFixture extends FixtureBase {
  type: "beam";
  walls: PlanWall[];
  /** How far the beam sticks into the room, meters. */
  protrusion: number;
  /** How far the beam hangs down from the ceiling, meters. */
  drop: number;
}

export type WindowStyle = "sliding" | "other";
export type EntranceDoor = "none" | "single" | "sliding";

/** Opening in a wall, with an optional recess outside the room outline. */
export interface WindowFixture extends FixtureBase {
  type: "window";
  wall: PlanWall;
  /** Meters from the wall start (same convention as other wall fixtures). */
  offset: number;
  /** Meters along the wall. */
  width: number;
  /** Meters from the floor to the bottom of the glass. */
  sillHeight: number;
  /** Meters, the glass height. */
  height: number;
  /** Meters the bay sticks outward past the wall. 0 is flush. */
  recess: number;
  style: WindowStyle;
}

/** Doorway in a wall. No hallway is stored or drawn. */
export interface EntranceFixture extends FixtureBase {
  type: "entrance";
  wall: PlanWall;
  offset: number;
  width: number;
  /** Meters. Often the ceiling height. */
  height: number;
  door: EntranceDoor;
  /** Used when door is "single". */
  hinge: HingeSide;
  /** Meters of clear floor in front of the opening, into the room. */
  clearance: number;
}

export type RoomFixture = PillarFixture | StorageFixture | BeamFixture | WindowFixture | EntranceFixture;

/** Box uses width x depth. Cylinder uses width as the diameter; depth must equal width. */
export type FurnitureShape = "box" | "cylinder";

/** Shared across every layout. Position is not stored here. */
export interface FurnitureItem {
  id: string;
  name: string;
  shape: FurnitureShape;
  /** Meters along local +X. For a cylinder this is the diameter. */
  width: number;
  /** Meters along local +Z. For a cylinder this equals width. */
  depth: number;
  /** Meters, floor to top. */
  height: number;
  /** #rrggbb */
  color: string;
  /**
   * Present when migration split this item off an older id whose
   * dimensions disagreed. Comparison labels that pair 「別家具」.
   */
  originId?: string;
}

/** Where one catalog item sits in one layout. */
export interface Placement {
  furnitureId: string;
  /** Footprint center, meters. */
  x: number;
  z: number;
  /**
   * Degrees clockwise when viewed from above.
   * 0 keeps width along +X and depth along +Z.
   */
  rotation: number;
  /** Meters from the floor to the bottom. This layout only. */
  elevation: number;
  /** Other catalog ids this placement may overlap. This layout only. */
  allowOverlapIds: string[];
}

/**
 * Resolved view of one placed item. Geometry and the 2D/3D views
 * keep using this shape; it is not the on-disk layout entry.
 */
export interface Furniture extends FurnitureItem {
  x: number;
  z: number;
  rotation: number;
  elevation?: number;
  allowOverlapIds?: string[];
}

/** One arrangement. The room and its fixtures are not copied per layout. */
export interface Layout {
  id: string;
  name: string;
  placements: Placement[];
}

export interface Project {
  schemaVersion: number;
  /** Identifies files written by this app. Optional on import. */
  app?: string;
  room: Room;
  furniture: FurnitureItem[];
  layouts: Layout[];
  activeLayoutId: string;
  /** Editable reference arrangement. Not a lock. */
  baselineLayoutId: string;
}

export const APP_ID = "room-planner";
