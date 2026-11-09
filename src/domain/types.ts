/**
 * Project file schema v1.
 * Internal lengths are meters. The UI converts to centimeters.
 * See AGENTS.md for the coordinate system and rotation convention.
 */

export const SCHEMA_VERSION = 1;

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
}

/** Box uses width x depth. Cylinder uses width as the diameter; depth must equal width. */
export type FurnitureShape = "box" | "cylinder";

export interface Furniture {
  id: string;
  name: string;
  shape: FurnitureShape;
  /** Meters along local +X. For a cylinder this is the diameter. */
  width: number;
  /** Meters along local +Z. For a cylinder this equals width. */
  depth: number;
  /** Meters, floor to top. */
  height: number;
  /** Footprint center, meters. */
  x: number;
  z: number;
  /**
   * Degrees clockwise when viewed from above.
   * 0 keeps width along +X and depth along +Z.
   */
  rotation: number;
  /** #rrggbb */
  color: string;
}

/** One arrangement of furniture in the room. Comparison UI is not built yet. */
export interface Layout {
  id: string;
  name: string;
  furniture: Furniture[];
}

export interface Project {
  schemaVersion: number;
  /** Identifies files written by this app. Optional on import. */
  app?: string;
  room: Room;
  layouts: Layout[];
  activeLayoutId: string;
}

export const APP_ID = "room-planner";
