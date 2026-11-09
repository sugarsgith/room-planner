import { useState } from "react";
import {
  PLAN_CORNERS,
  PLAN_WALLS,
  cornerLabel,
  fixtureError,
  fixtureLabel,
  wallLabel,
} from "../domain/fixtures";
import type { PlanCorner, PlanWall, RoomFixture, StorageDoor } from "../domain/types";
import { mmToM } from "../domain/units";
import { useEditor } from "../state/store";
import { NumberField } from "./fields";

type DraftKind = "pillar" | "storage" | "beam";

interface Draft {
  kind: DraftKind;
  anchorKind: "corner" | "wall";
  corner: PlanCorner;
  wall: PlanWall;
  offsetMm: string;
  spanXMm: string;
  spanZMm: string;
  widthMm: string;
  depthMm: string;
  heightMm: string;
  door: StorageDoor;
  hinge: "left" | "right";
  beamWalls: PlanWall[];
  protrusionMm: string;
  dropMm: string;
}

function emptyDraft(kind: DraftKind): Draft {
  return {
    kind,
    anchorKind: "corner",
    corner: "back-left",
    wall: "back",
    offsetMm: "",
    spanXMm: "",
    spanZMm: "",
    widthMm: "",
    depthMm: "",
    heightMm: "",
    door: "none",
    hinge: "left",
    beamWalls: [],
    protrusionMm: "",
    dropMm: "",
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
      setDraftError("寸法を mm で入力してください。");
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
      <p className="hint">外形はそのままに、柱・備え付け収納・梁を足します。寸法は mm です。推定値は入っていません。</p>
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
                ceiling={room.ceilingHeight}
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
      </div>
      {draft && (
        <div className="draft">
          <p className="hint">{draft.kind === "pillar" ? "柱" : draft.kind === "storage" ? "備え付け収納" : "天井の梁"}</p>
          {draft.kind !== "beam" && (
            <AnchorFields
              anchorKind={draft.anchorKind}
              corner={draft.corner}
              wall={draft.wall}
              offsetMm={draft.offsetMm}
              onChange={(patch) => setDraft({ ...draft, ...patch })}
            />
          )}
          {draft.kind === "pillar" && (
            <>
              <MmInput label="横の出っ張り" value={draft.spanXMm} testId="fixture-span-x" onChange={(spanXMm) => setDraft({ ...draft, spanXMm })} />
              <MmInput label="縦の出っ張り" value={draft.spanZMm} testId="fixture-span-z" onChange={(spanZMm) => setDraft({ ...draft, spanZMm })} />
            </>
          )}
          {draft.kind === "storage" && (
            <>
              <MmInput label="幅" value={draft.widthMm} testId="fixture-width" onChange={(widthMm) => setDraft({ ...draft, widthMm })} />
              <MmInput label="奥行" value={draft.depthMm} testId="fixture-depth" onChange={(depthMm) => setDraft({ ...draft, depthMm })} />
              <MmInput label="高さ" value={draft.heightMm} testId="fixture-height" onChange={(heightMm) => setDraft({ ...draft, heightMm })} />
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
              <MmInput label="壁からの出っ張り" value={draft.protrusionMm} testId="fixture-beam-out" onChange={(protrusionMm) => setDraft({ ...draft, protrusionMm })} />
              <MmInput label="天井から下がる量" value={draft.dropMm} testId="fixture-beam-drop" onChange={(dropMm) => setDraft({ ...draft, dropMm })} />
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
  offsetMm,
  onChange,
}: {
  anchorKind: "corner" | "wall";
  corner: PlanCorner;
  wall: PlanWall;
  offsetMm: string;
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
          <MmInput label="始点からの距離" value={offsetMm} testId="fixture-offset" onChange={(offsetMm) => onChange({ offsetMm })} />
        </>
      )}
    </>
  );
}

function MmInput({
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
      <input data-testid={testId} inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} />
      <span className="unit">mm</span>
    </label>
  );
}

function FixtureFields({
  fixture,
  ceiling,
  onChange,
}: {
  fixture: RoomFixture;
  ceiling: number;
  onChange: (fixture: RoomFixture) => void;
}) {
  const max = ceiling - 0.001;
  if (fixture.type === "pillar") {
    return (
      <>
        <NumberField label="横" unit="mm" valueM={fixture.spanX} minM={0.001} maxM={10} testId="edit-span-x" onPreview={(spanX) => onChange({ ...fixture, spanX })} />
        <NumberField label="縦" unit="mm" valueM={fixture.spanZ} minM={0.001} maxM={10} testId="edit-span-z" onPreview={(spanZ) => onChange({ ...fixture, spanZ })} />
      </>
    );
  }
  if (fixture.type === "storage") {
    return (
      <>
        <NumberField label="幅" unit="mm" valueM={fixture.width} minM={0.001} maxM={10} onPreview={(width) => onChange({ ...fixture, width })} />
        <NumberField label="奥行" unit="mm" valueM={fixture.depth} minM={0.001} maxM={10} onPreview={(depth) => onChange({ ...fixture, depth })} />
        <NumberField label="高さ" unit="mm" valueM={fixture.height} minM={0.001} maxM={Math.max(0.001, max)} onPreview={(height) => onChange({ ...fixture, height })} />
      </>
    );
  }
  return (
    <>
      <NumberField label="出っ張り" unit="mm" valueM={fixture.protrusion} minM={0.001} maxM={5} onPreview={(protrusion) => onChange({ ...fixture, protrusion })} />
      <NumberField label="下がり" unit="mm" valueM={fixture.drop} minM={0.001} maxM={Math.max(0.001, max)} onPreview={(drop) => onChange({ ...fixture, drop })} />
    </>
  );
}

function draftToFixture(draft: Draft, id: string): RoomFixture | null {
  if (draft.kind === "beam") {
    const protrusion = readMm(draft.protrusionMm);
    const drop = readMm(draft.dropMm);
    if (protrusion === null || drop === null) return null;
    return { id, type: "beam", walls: draft.beamWalls, protrusion, drop };
  }
  const anchor =
    draft.anchorKind === "corner"
      ? { kind: "corner" as const, corner: draft.corner }
      : { kind: "wall" as const, wall: draft.wall, offset: readMm(draft.offsetMm) ?? Number.NaN };
  if (anchor.kind === "wall" && !Number.isFinite(anchor.offset)) return null;
  if (draft.kind === "pillar") {
    const spanX = readMm(draft.spanXMm);
    const spanZ = readMm(draft.spanZMm);
    if (spanX === null || spanZ === null) return null;
    return { id, type: "pillar", anchor, spanX, spanZ };
  }
  const width = readMm(draft.widthMm);
  const depth = readMm(draft.depthMm);
  const height = readMm(draft.heightMm);
  if (width === null || depth === null || height === null) return null;
  return { id, type: "storage", anchor, width, depth, height, door: draft.door, hinge: draft.hinge };
}

function readMm(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return mmToM(n);
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `fx-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}
