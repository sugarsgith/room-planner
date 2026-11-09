import { rectangleOutline } from "./geometry";
import { cmToM } from "./units";
import { APP_ID, SCHEMA_VERSION, type Project } from "./types";

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
    },
    layouts: [
      {
        id: "layout-default",
        name: "現在の配置",
        furniture: [
          {
            id: "bed",
            name: "シングルベッド",
            shape: "box",
            width: cmToM(100),
            depth: cmToM(200),
            height: cmToM(45),
            x: cmToM(135),
            z: cmToM(300),
            rotation: 90,
            color: "#7d8fa3",
          },
          {
            id: "desk",
            name: "デスク",
            shape: "box",
            width: cmToM(140),
            depth: cmToM(70),
            height: cmToM(72),
            x: cmToM(45),
            z: cmToM(90),
            rotation: 90,
            color: "#b5814a",
          },
          {
            id: "sofa",
            name: "2人掛けソファ",
            shape: "box",
            width: cmToM(140),
            depth: cmToM(80),
            height: cmToM(75),
            x: cmToM(190),
            z: cmToM(60),
            rotation: 0,
            color: "#3f6b5a",
          },
          {
            id: "table",
            name: "丸テーブル",
            shape: "cylinder",
            width: cmToM(60),
            depth: cmToM(60),
            height: cmToM(70),
            x: cmToM(150),
            z: cmToM(200),
            rotation: 0,
            color: "#c4a574",
          },
        ],
      },
    ],
    activeLayoutId: "layout-default",
  };
}
