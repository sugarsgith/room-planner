import { useState } from "react";
import {
  PLAN_CORNERS,
  PLAN_WALLS,
  cornerLabel,
  fixtureError,
  fixtureLabel,
  wallLabel,
  wallStartLabel,
} from "../domain/fixtures";
import type {
  EntranceDoor,
  EntranceFixture,
  PlanCorner,
  PlanWall,
  Room,
  RoomFixture,
  StorageDoor,
  StorageFixture,
  WindowFixture,
  WindowStyle,
} from "../domain/types";
import { cmToM, formatCm } from "../domain/units";
import { useEditor } from "../state/store";
import { NumberField } from "./fields";

type DraftKind = "pillar" | "storage" | "beam" | "window" | "entrance";

interface Draft {
  kind: DraftKind;
  anchorKind: "corner" | "wall";
  corner: PlanCorner;
  wall: PlanWall;
  offsetCm: string;
  spanXCm: string;
  spanZCm: string;
  widthCm: string;
  depthCm: string;
  heightCm: string;
  door: StorageDoor;
  hinge: "left" | "right";
  beamWalls: PlanWall[];
  protrusionCm: string;
  dropCm: string;
  openingWall: PlanWall;
  sillCm: string;
  recessCm: string;
  windowStyle: WindowStyle;
  entranceDoor: EntranceDoor;
  clearanceCm: string;
}

function emptyDraft(kind: DraftKind): Draft {
  return {
    kind,
    anchorKind: "corner",
    corner: "back-left",
    wall: "back",
    offsetCm: "",
    spanXCm: "",
    spanZCm: "",
    widthCm: "",
    depthCm: "",
    heightCm: "",
    door: "none",
    hinge: "left",
    beamWalls: [],
    protrusionCm: "",
    dropCm: "",
    openingWall: kind === "entrance" ? "front" : "back",
    sillCm: "",
    recessCm: "",
    windowStyle: "sliding",
    entranceDoor: "none",
    clearanceCm: kind === "entrance" ? "60" : "",
  };
}

export function FixturesSection() {
  const room = useEditor((s) => s.project.room);
  const addFixture = useEditor((s) => s.addFixture);
  const replaceFixture = useEditor((s) => s.replaceFixture);
  const removeFixture = useEditor((s) => s.removeFixture);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function commitDraft() {
    if (!draft) return;
    const id = createId();
    const fixture = draftToFixture(draft, id);
    if (!fixture) {
      setDraftError("寸法を cm で入力してください。");
      return;
    }
    const error = fixtureError(fixture, room);
    if (error) {
      setDraftError(error);
      return;
    }
    addFixture(fixture);
    setDraft(null);
    setDraftError(null);
    setEditingId(fixture.id);
  }

  return (
    <section data-testid="fixture-panel">
      <div className="panel-head">
        <h2>部屋の出っ張り</h2>
      </div>
      <p className="hint">外形はそのままに、柱・備え付け収納・梁を足します。寸法は cm です。推定値は入っていません。</p>
      {room.fixtures.length === 0 && <p className="hint">まだありません。</p>}
      <ul className="furniture-list">
        {room.fixtures.map((fixture) => (
          <li key={fixture.id}>
            <div className="fixture-row">
              <button type="button" className={editingId === fixture.id ? "active" : ""} onClick={() => setEditingId(fixture.id)}>
                {fixtureLabel(fixture)}
              </button>
              <button type="button" className="danger" onClick={() => removeFixture(fixture.id)}>
                削除
              </button>
            </div>
            {editingId === fixture.id && (
              <FixtureFields
                fixture={fixture}
                room={room}
                onChange={(next) => replaceFixture(next, "preview")}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="choice">
        <button type="button" data-testid="fixture-add-pillar" onClick={() => { setDraft(emptyDraft("pillar")); setDraftError(null); }}>
          ＋柱
        </button>
        <button type="button" data-testid="fixture-add-storage" onClick={() => { setDraft(emptyDraft("storage")); setDraftError(null); }}>
          ＋備え付け収納
        </button>
        <button type="button" data-testid="fixture-add-beam" onClick={() => { setDraft(emptyDraft("beam")); setDraftError(null); }}>
          ＋天井の梁
        </button>
        <button type="button" data-testid="fixture-add-window" onClick={() => { setDraft(emptyDraft("window")); setDraftError(null); }}>
          ＋窓
        </button>
        <button
          type="button"
          data-testid="fixture-add-entrance"
          onClick={() => {
            const next = emptyDraft("entrance");
            next.heightCm = formatCm(room.ceilingHeight);
            setDraft(next);
            setDraftError(null);
          }}
        >
          ＋入口
        </button>
      </div>
      {draft && (
        <div className="draft">
          <p className="hint">
            {draft.kind === "pillar" ? "柱" : draft.kind === "storage" ? "備え付け収納" : draft.kind === "beam" ? "天井の梁" : draft.kind === "window" ? "窓" : "入口"}
          </p>
          {draft.kind !== "beam" && (
            <AnchorFields
              anchorKind={draft.anchorKind}
              corner={draft.corner}
              wall={draft.wall}
              offsetCm={draft.offsetCm}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
          )}
          {draft.kind === "pillar" && (
            <>
              <CmInput label="横の出っ張り" value={draft.spanXCm} testId="fixture-span-x" onChange={(spanXCm) => setDraft({ ...draft, spanXCm })} />
              <CmInput label="縦の出っ張り" value={draft.spanZCm} testId="fixture-span-z" onChange={(spanZCm) => setDraft({ ...draft, spanZCm })} />
            </>
          )}
          {draft.kind === "storage" && (
            <>
              <CmInput label="幅" value={draft.widthCm} testId="fixture-width" onChange={(widthCm) => setDraft({ ...draft, widthCm })} />
              <CmInput label="奥行" value={draft.depthCm} testId="fixture-depth" onChange={(depthCm) => setDraft({ ...draft, depthCm })} />
              <CmInput label="高さ" value={draft.heightCm} testId="fixture-height" onChange={(heightCm) => setDraft({ ...draft, heightCm })} />
              <label className="field field-wide">
                <span>扉</span>
                <select data-testid="fixture-door" value={draft.door} onChange={(event) => setDraft({ ...draft, door: event.target.value as StorageDoor })}>
                  <option value="none">なし</option>
                  <option value="single">片開き</option>
                  <option value="double">両開き</option>
                  <option value="sliding">引き戸</option>
                </select>
              </label>
              {draft.door === "single" && (
                <div className="choice">
                  <button type="button" className={draft.hinge === "left" ? "active" : ""} onClick={() => setDraft({ ...draft, hinge: "left" })}>
                    吊元 左
                  </button>
                  <button type="button" className={draft.hinge === "right" ? "active" : ""} onClick={() => setDraft({ ...draft, hinge: "right" })}>
                    吊元 右
                  </button>
                </div>
              )}
            </>
          )}
          {(draft.kind === "window" || draft.kind === "entrance") && (
            <OpeningDraft draft={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          )}
          {draft.kind === "beam" && (
            <>
              <div className="choice">
                {(["back", "right", "front", "left"] as PlanWall[]).map((wall) => (
                  <button
                    key={wall}
                    type="button"
                    data-testid={`fixture-wall-${wall}`}
                    className={draft.beamWalls.includes(wall) ? "active" : ""}
                    onClick={() => {
                      const beamWalls = draft.beamWalls.includes(wall)
                        ? draft.beamWalls.filter((item) => item !== wall)
                        : [...draft.beamWalls, wall];
                      setDraft({ ...draft, beamWalls });
                    }}
                  >
                    {wallLabel(wall)}
                  </button>
                ))}
              </div>
              <CmInput label="壁からの出っ張り" value={draft.protrusionCm} testId="fixture-beam-out" onChange={(protrusionCm) => setDraft({ ...draft, protrusionCm })} />
              <CmInput label="天井から下がる量" value={draft.dropCm} testId="fixture-beam-drop" onChange={(dropCm) => setDraft({ ...draft, dropCm })} />
            </>
          )}
          {draftError && <p className="warn">{draftError}</p>}
          <div className="list-actions">
            <button type="button" data-testid="fixture-commit" onClick={commitDraft}>
              追加
            </button>
            <button type="button" onClick={() => { setDraft(null); setDraftError(null); }}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function AnchorFields({
  anchorKind,
  corner,
  wall,
  offsetCm,
  onChange,
}: {
  anchorKind: "corner" | "wall";
  corner: PlanCorner;
  wall: PlanWall;
  offsetCm: string;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <>
      <div className="choice">
        <button type="button" className={anchorKind === "corner" ? "active" : ""} data-testid="fixture-anchor-corner" onClick={() => onChange({ anchorKind: "corner" })}>
          角
        </button>
        <button type="button" className={anchorKind === "wall" ? "active" : ""} data-testid="fixture-anchor-wall" onClick={() => onChange({ anchorKind: "wall" })}>
          壁の途中
        </button>
      </div>
      {anchorKind === "corner" ? (
        <label className="field field-wide">
          <span>角</span>
          <select data-testid="fixture-corner" value={corner} onChange={(event) => onChange({ corner: event.target.value as PlanCorner })}>
            {PLAN_CORNERS.map((item) => (
              <option key={item} value={item}>
                {cornerLabel(item)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="field field-wide">
            <span>壁</span>
            <select data-testid="fixture-wall" value={wall} onChange={(event) => onChange({ wall: event.target.value as PlanWall })}>
              {PLAN_WALLS.map((item) => (
                <option key={item} value={item}>
                  {wallLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">始点は 下=左端、右=手前、上=右端、左=奥 です。</p>
          <CmInput label="始点からの距離" value={offsetCm} testId="fixture-offset" onChange={(offsetCm) => onChange({ offsetCm })} />
        </>
      )}
    </>
  );
}

function CmInput({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input data-testid={testId} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
      <span className="unit">cm</span>
    </label>
  );
}

function FixtureFields({
  fixture,
  room,
  onChange,
}: {
  fixture: RoomFixture;
  room: Room;
  onChange: (fixture: RoomFixture) => void;
}) {
  const heightMax = Math.max(0.001, room.ceilingHeight - 0.001);
  return (
    <>
      {(fixture.type === "pillar" || fixture.type === "storage") && <EditAnchor fixture={fixture} onChange={onChange} />}
      {fixture.type === "window" && <WindowFields fixture={fixture} onChange={onChange} />}
      {fixture.type === "entrance" && <EntranceFields fixture={fixture} room={room} onChange={onChange} />}
      {fixture.type === "pillar" && (
        <>
          <NumberField label="横の出っ張り" valueM={fixture.spanX} minM={0.001} maxM={10} testId="edit-span-x" onPreview={(spanX) => onChange({ ...fixture, spanX })} />
          <NumberField label="縦の出っ張り" valueM={fixture.spanZ} minM={0.001} maxM={10} testId="edit-span-z" onPreview={(spanZ) => onChange({ ...fixture, spanZ })} />
        </>
      )}
      {fixture.type === "storage" && (
        <>
          <NumberField label="幅" valueM={fixture.width} minM={0.001} maxM={10} testId="edit-storage-width" onPreview={(width) => onChange({ ...fixture, width })} />
          <NumberField label="奥行" valueM={fixture.depth} minM={0.001} maxM={10} testId="edit-storage-depth" onPreview={(depth) => onChange({ ...fixture, depth })} />
          <NumberField label="高さ" valueM={fixture.height} minM={0.001} maxM={heightMax} testId="edit-storage-height" onPreview={(height) => onChange({ ...fixture, height })} />
          <DoorFields fixture={fixture} onChange={onChange} />
        </>
      )}
      {fixture.type === "beam" && (
        <>
          <div className="choice">
            {(["back", "right", "front", "left"] as PlanWall[]).map((wall) => (
              <button
                key={wall}
                type="button"
                data-testid={`edit-wall-${wall}`}
                className={fixture.walls.includes(wall) ? "active" : ""}
                onClick={() => {
                  const walls = fixture.walls.includes(wall)
                    ? fixture.walls.filter((item) => item !== wall)
                    : [...fixture.walls, wall];
                  onChange({ ...fixture, walls });
                }}
              >
                {wallLabel(wall)}
              </button>
            ))}
          </div>
          <NumberField label="壁からの出っ張り" valueM={fixture.protrusion} minM={0.001} maxM={5} testId="edit-beam-out" onPreview={(protrusion) => onChange({ ...fixture, protrusion })} />
          <NumberField label="天井から下がる量" valueM={fixture.drop} minM={0.001} maxM={heightMax} testId="edit-beam-drop" onPreview={(drop) => onChange({ ...fixture, drop })} />
        </>
      )}
    </>
  );
}

function EditAnchor({
  fixture,
  onChange,
}: {
  fixture: Extract<RoomFixture, { type: "pillar" | "storage" }>;
  onChange: (fixture: RoomFixture) => void;
}) {
  const anchor = fixture.anchor;
  return (
    <>
      <div className="choice">
        <button
          type="button"
          data-testid="edit-anchor-corner"
          className={anchor.kind === "corner" ? "active" : ""}
          onClick={() => {
            if (anchor.kind === "corner") return;
            onChange({ ...fixture, anchor: { kind: "corner", corner: "back-left" } });
          }}
        >
          角
        </button>
        <button
          type="button"
          data-testid="edit-anchor-wall"
          className={anchor.kind === "wall" ? "active" : ""}
          onClick={() => {
            if (anchor.kind === "wall") return;
            onChange({ ...fixture, anchor: { kind: "wall", wall: "back", offset: 0 } });
          }}
        >
          壁の途中
        </button>
      </div>
      {anchor.kind === "corner" ? (
        <label className="field field-wide">
          <span>角</span>
          <select
            data-testid="edit-fixture-corner"
            value={anchor.corner}
            onChange={(event) => onChange({ ...fixture, anchor: { kind: "corner", corner: event.target.value as PlanCorner } })}
          >
            {PLAN_CORNERS.map((item) => (
              <option key={item} value={item}>
                {cornerLabel(item)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="field field-wide">
            <span>壁</span>
            <select
              data-testid="edit-fixture-wall"
              value={anchor.wall}
              onChange={(event) =>
                onChange({ ...fixture, anchor: { kind: "wall", wall: event.target.value as PlanWall, offset: anchor.offset } })
              }
            >
              {PLAN_WALLS.map((item) => (
                <option key={item} value={item}>
                  {wallLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">始点は 下=左端、右=手前、上=右端、左=奥 です。</p>
          <NumberField
            label="始点からの距離"
            valueM={anchor.offset}
            minM={0}
            maxM={20}
            testId="edit-fixture-offset"
            onPreview={(offset) => onChange({ ...fixture, anchor: { kind: "wall", wall: anchor.wall, offset } })}
          />
        </>
      )}
    </>
  );
}

function DoorFields({
  fixture,
  onChange,
}: {
  fixture: StorageFixture;
  onChange: (fixture: RoomFixture) => void;
}) {
  return (
    <>
      <label className="field field-wide">
        <span>扉</span>
        <select
          data-testid="edit-fixture-door"
          value={fixture.door}
          onChange={(event) => onChange({ ...fixture, door: event.target.value as StorageDoor })}
        >
          <option value="none">なし</option>
          <option value="single">片開き</option>
          <option value="double">両開き</option>
          <option value="sliding">引き戸</option>
        </select>
      </label>
      {fixture.door === "single" && (
        <div className="choice">
          <button
            type="button"
            data-testid="edit-hinge-left"
            className={fixture.hinge === "left" ? "active" : ""}
            onClick={() => onChange({ ...fixture, hinge: "left" })}
          >
            吊元 左
          </button>
          <button
            type="button"
            data-testid="edit-hinge-right"
            className={fixture.hinge === "right" ? "active" : ""}
            onClick={() => onChange({ ...fixture, hinge: "right" })}
          >
            吊元 右
          </button>
        </div>
      )}
    </>
  );
}

function OpeningDraft({ draft, onChange }: { draft: Draft; onChange: (patch: Partial<Draft>) => void }) {
  const walls: PlanWall[] = ["back", "right", "front", "left"];
  return (
    <>
      <label className="field field-wide">
        <span>壁</span>
        <select data-testid="fixture-opening-wall" value={draft.openingWall} onChange={(event) => onChange({ openingWall: event.target.value as PlanWall })}>
          {walls.map((wall) => (
            <option key={wall} value={wall}>
              {wallLabel(wall)}
            </option>
          ))}
        </select>
      </label>
      <CmInput
        label={wallStartLabel(draft.openingWall)}
        value={draft.offsetCm}
        testId="fixture-opening-offset"
        onChange={(offsetCm) => onChange({ offsetCm })}
      />
      <CmInput label="幅" value={draft.widthCm} testId="fixture-opening-width" onChange={(widthCm) => onChange({ widthCm })} />
      {draft.kind === "window" ? (
        <>
          <CmInput label="床から下端までの高さ" value={draft.sillCm} testId="fixture-window-sill" onChange={(sillCm) => onChange({ sillCm })} />
          <CmInput label="窓の高さ" value={draft.heightCm} testId="fixture-window-height" onChange={(heightCm) => onChange({ heightCm })} />
          <CmInput label="壁より奥に出ている量" value={draft.recessCm} testId="fixture-window-recess" onChange={(recessCm) => onChange({ recessCm })} />
          <label className="field field-wide">
            <span>種類</span>
            <select data-testid="fixture-window-style" value={draft.windowStyle} onChange={(event) => onChange({ windowStyle: event.target.value as WindowStyle })}>
              <option value="sliding">引き違い（2枚）</option>
              <option value="other">その他</option>
            </select>
          </label>
        </>
      ) : (
        <>
          <CmInput label="開口の高さ" value={draft.heightCm} testId="fixture-entrance-height" onChange={(heightCm) => onChange({ heightCm })} />
          <CmInput label="入口前の空き" value={draft.clearanceCm} testId="fixture-entrance-clearance" onChange={(clearanceCm) => onChange({ clearanceCm })} />
          <label className="field field-wide">
            <span>扉</span>
            <select data-testid="fixture-entrance-door" value={draft.entranceDoor} onChange={(event) => onChange({ entranceDoor: event.target.value as EntranceDoor })}>
              <option value="none">なし</option>
              <option value="single">片開き</option>
              <option value="sliding">引き戸</option>
            </select>
          </label>
          {draft.entranceDoor === "single" && (
            <div className="choice">
              <button type="button" className={draft.hinge === "left" ? "active" : ""} onClick={() => onChange({ hinge: "left" })}>
                吊元 左
              </button>
              <button type="button" className={draft.hinge === "right" ? "active" : ""} onClick={() => onChange({ hinge: "right" })}>
                吊元 右
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function WindowFields({ fixture, onChange }: { fixture: WindowFixture; onChange: (fixture: RoomFixture) => void }) {
  return (
    <>
      <WallSelect testId="edit-window-wall" wall={fixture.wall} onChange={(wall) => onChange({ ...fixture, wall })} />
      <NumberField label={wallStartLabel(fixture.wall)} valueM={fixture.offset} minM={0} maxM={20} testId="edit-window-offset" onPreview={(offset) => onChange({ ...fixture, offset })} />
      <NumberField label="幅" valueM={fixture.width} minM={0.001} maxM={10} testId="edit-window-width" onPreview={(width) => onChange({ ...fixture, width })} />
      <NumberField label="床から下端までの高さ" valueM={fixture.sillHeight} minM={0} maxM={10} testId="edit-window-sill" onPreview={(sillHeight) => onChange({ ...fixture, sillHeight })} />
      <NumberField label="窓の高さ" valueM={fixture.height} minM={0.001} maxM={10} testId="edit-window-height" onPreview={(height) => onChange({ ...fixture, height })} />
      <NumberField label="壁より奥に出ている量" valueM={fixture.recess} minM={0} maxM={5} testId="edit-window-recess" onPreview={(recess) => onChange({ ...fixture, recess })} />
      <label className="field field-wide">
        <span>種類</span>
        <select data-testid="edit-window-style" value={fixture.style} onChange={(event) => onChange({ ...fixture, style: event.target.value as WindowStyle })}>
          <option value="sliding">引き違い（2枚）</option>
          <option value="other">その他</option>
        </select>
      </label>
    </>
  );
}

function EntranceFields({
  fixture,
  room,
  onChange,
}: {
  fixture: EntranceFixture;
  room: Room;
  onChange: (fixture: RoomFixture) => void;
}) {
  return (
    <>
      <WallSelect testId="edit-entrance-wall" wall={fixture.wall} onChange={(wall) => onChange({ ...fixture, wall })} />
      <NumberField label={wallStartLabel(fixture.wall)} valueM={fixture.offset} minM={0} maxM={20} testId="edit-entrance-offset" onPreview={(offset) => onChange({ ...fixture, offset })} />
      <NumberField label="開口の幅" valueM={fixture.width} minM={0.001} maxM={10} testId="edit-entrance-width" onPreview={(width) => onChange({ ...fixture, width })} />
      <NumberField label="開口の高さ" valueM={fixture.height} minM={0.001} maxM={room.ceilingHeight} testId="edit-entrance-height" onPreview={(height) => onChange({ ...fixture, height })} />
      <NumberField label="入口前の空き" valueM={fixture.clearance} minM={0} maxM={10} testId="edit-entrance-clearance" onPreview={(clearance) => onChange({ ...fixture, clearance })} />
      <label className="field field-wide">
        <span>扉</span>
        <select data-testid="edit-entrance-door" value={fixture.door} onChange={(event) => onChange({ ...fixture, door: event.target.value as EntranceDoor })}>
          <option value="none">なし</option>
          <option value="single">片開き</option>
          <option value="sliding">引き戸</option>
        </select>
      </label>
      {fixture.door === "single" && (
        <div className="choice">
          <button type="button" data-testid="edit-entrance-hinge-left" className={fixture.hinge === "left" ? "active" : ""} onClick={() => onChange({ ...fixture, hinge: "left" })}>
            吊元 左
          </button>
          <button type="button" data-testid="edit-entrance-hinge-right" className={fixture.hinge === "right" ? "active" : ""} onClick={() => onChange({ ...fixture, hinge: "right" })}>
            吊元 右
          </button>
        </div>
      )}
    </>
  );
}

function WallSelect({ wall, onChange, testId }: { wall: PlanWall; onChange: (wall: PlanWall) => void; testId: string }) {
  return (
    <label className="field field-wide">
      <span>壁</span>
      <select data-testid={testId} value={wall} onChange={(event) => onChange(event.target.value as PlanWall)}>
        {(["back", "right", "front", "left"] as PlanWall[]).map((item) => (
          <option key={item} value={item}>
            {wallLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

function draftToFixture(draft: Draft, id: string): RoomFixture | null {
  if (draft.kind === "window" || draft.kind === "entrance") {
    const offset = readCm(draft.offsetCm);
    const width = readCm(draft.widthCm);
    const height = readCm(draft.heightCm);
    if (offset === null || width === null || height === null) return null;
    if (draft.kind === "window") {
      const sill = readCm(draft.sillCm, true);
      const recess = readCm(draft.recessCm, true);
      if (sill === null || recess === null) return null;
      return {
        id,
        type: "window",
        wall: draft.openingWall,
        offset,
        width,
        sillHeight: sill,
        height,
        recess,
        style: draft.windowStyle,
      };
    }
    const clearance = readCm(draft.clearanceCm, true);
    if (clearance === null) return null;
    return {
      id,
      type: "entrance",
      wall: draft.openingWall,
      offset,
      width,
      height,
      door: draft.entranceDoor,
      hinge: draft.hinge,
      clearance,
    };
  }
  if (draft.kind === "beam") {
    const protrusion = readCm(draft.protrusionCm);
    const drop = readCm(draft.dropCm);
    if (protrusion === null || drop === null) return null;
    return { id, type: "beam", walls: draft.beamWalls, protrusion, drop };
  }
  const anchor =
    draft.anchorKind === "corner"
      ? { kind: "corner" as const, corner: draft.corner }
      : { kind: "wall" as const, wall: draft.wall, offset: readCm(draft.offsetCm) ?? Number.NaN };
  if (anchor.kind === "wall" && !Number.isFinite(anchor.offset)) return null;
  if (draft.kind === "pillar") {
    const spanX = readCm(draft.spanXCm);
    const spanZ = readCm(draft.spanZCm);
    if (spanX === null || spanZ === null) return null;
    return { id, type: "pillar", anchor, spanX, spanZ };
  }
  const width = readCm(draft.widthCm);
  const depth = readCm(draft.depthCm);
  const height = readCm(draft.heightCm);
  if (width === null || depth === null || height === null) return null;
  return { id, type: "storage", anchor, width, depth, height, door: draft.door, hinge: draft.hinge };
}

function readCm(raw: string, allowZero = false): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) return null;
  const meters = cmToM(n);
  if (!allowZero && meters <= 0) return null;
  return meters;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `fx-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}
