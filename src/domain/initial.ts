import { rectangleOutline } from "./geometry";
import { cmToM } from "./units";
import { APP_ID, SCHEMA_VERSION, type FurnitureItem, type Placement, type Project } from "./types";

/**
 * About 6 jo (270 x 360 cm, ceiling 240 cm).
 * Top-down, +X right, +Z toward the back of the room:
 * bed lengthwise against the back wall, desk on the left, sofa front-right, table in the middle.
 * Every item is inside the room and none overlap.
 */
export function createInitialProject(): Project {
  const width = cmToM(270);
  const depth = cmToM(360);
  return {
    schemaVersion: SCHEMA_VERSION,
    app: APP_ID,
    room: {
      id: "room-main",
      name: "自分の部屋",
      width,
      depth,
      ceilingHeight: cmToM(240),
      outline: rectangleOutline(width, depth),
      openings: [],
      fixtures: [],
    },
    furniture: [
      item("bed", "シングルベッド", "box", 100, 200, 45, "#7d8fa3"),
      item("desk", "デスク", "box", 140, 70, 72, "#b5814a"),
      item("sofa", "2人掛けソファ", "box", 140, 80, 75, "#3f6b5a"),
      item("table", "丸テーブル", "cylinder", 60, 60, 70, "#c4a574"),
    ],
    layouts: [
      {
        id: "layout-default",
        name: "現在の配置",
        placements: [
          place("bed", 135, 300, 90),
          place("desk", 45, 90, 90),
          place("sofa", 190, 60, 0),
          place("table", 150, 200, 0),
        ],
      },
    ],
    activeLayoutId: "layout-default",
    baselineLayoutId: "layout-default",
  };
}

function item(
  id: string,
  name: string,
  shape: FurnitureItem["shape"],
  widthCm: number,
  depthCm: number,
  heightCm: number,
  color: string,
): FurnitureItem {
  return {
    id,
    name,
    shape,
    width: cmToM(widthCm),
    depth: cmToM(depthCm),
    height: cmToM(heightCm),
    color,
  };
}

function place(furnitureId: string, xCm: number, zCm: number, rotation: number): Placement {
  return {
    furnitureId,
    x: cmToM(xCm),
    z: cmToM(zCm),
    rotation,
    elevation: 0,
    allowOverlapIds: [],
  };
}
