import { useMemo, useState } from "react";
import { analyzeLayout } from "../domain/geometry";
import { FixturesSection } from "./FixturesSection";
import { activeFurniture, LIMITS } from "../domain/schema";
import { normalizeDegrees } from "../domain/units";
import { useEditor } from "../state/store";
import { NameField, NumberField } from "./fields";

export function Inspector() {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const updateRoom = useEditor((s) => s.updateRoom);
  const updateFurniture = useEditor((s) => s.updateFurniture);
  const rotateBy = useEditor((s) => s.rotateBy);
  const duplicate = useEditor((s) => s.duplicate);
  const remove = useEditor((s) => s.remove);
  const wallsVisible = useEditor((s) => s.wallsVisible);
  const wallsTransparent = useEditor((s) => s.wallsTransparent);
  const setWallsVisible = useEditor((s) => s.setWallsVisible);
  const setWallsTransparent = useEditor((s) => s.setWallsTransparent);
  const beginGesture = useEditor((s) => s.beginGesture);
  const endGesture = useEditor((s) => s.endGesture);
  const compareLayoutId = useEditor((s) => s.compareLayoutId);
  const deleteFurniture = useEditor((s) => s.deleteFurniture);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const furniture = activeFurniture(project);
  const selected = furniture.find((item) => item.id === selectedId) ?? null;
  const issues = useMemo(() => analyzeLayout(project.room, furniture), [project.room, furniture]);
  const issue = issues.find((entry) => entry.id === selected?.id);
  const overlapNames =
    issue?.overlapIds.map((id) => furniture.find((item) => item.id === id)?.name ?? id) ?? [];

  return (
    <aside className="panel inspector" data-testid="inspector">
      <section className="room-section">
        <div className="panel-head">
          <h2>部屋</h2>
        </div>
        <NameField
          label="名前"
          value={project.room.name}
          testId="room-name"
          onPreview={(name) => updateRoom({ name }, "preview")}
        />
        <NumberField
          label="幅"
          valueM={project.room.width}
          minM={LIMITS.roomWidth.min}
          maxM={LIMITS.roomWidth.max}
          testId="room-width"
          onPreview={(width) => updateRoom({ width }, "preview")}
        />
        <NumberField
          label="奥行き"
          valueM={project.room.depth}
          minM={LIMITS.roomDepth.min}
          maxM={LIMITS.roomDepth.max}
          testId="room-depth"
          onPreview={(depth) => updateRoom({ depth }, "preview")}
        />
        <NumberField
          label="天井高"
          valueM={project.room.ceilingHeight}
          minM={LIMITS.ceiling.min}
          maxM={LIMITS.ceiling.max}
          testId="room-ceiling"
          onPreview={(ceilingHeight) => updateRoom({ ceilingHeight }, "preview")}
        />
        <p className="hint">幅・奥行きを変えると床の外形は原点基準の長方形に置き換わります。</p>
        <label className="check">
          <input
            type="checkbox"
            checked={wallsVisible}
            onChange={(event) => setWallsVisible(event.target.checked)}
          />
          3Dで壁を表示
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={wallsTransparent}
            disabled={!wallsVisible}
            onChange={(event) => setWallsTransparent(event.target.checked)}
          />
          壁を半透明
        </label>
        <FixturesSection />
      </section>

      <section className="item-section">
        <div className="panel-head">
          <h2>選択中の家具</h2>
        </div>
        {compareLayoutId && <p className="hint">比較中は閲覧のみです。図の「この案を編集」で戻れます。</p>}
        {!compareLayoutId && !selected && <p className="hint">一覧から家具を選ぶと、寸法と位置を cm で編集できます。</p>}
        {!compareLayoutId && selected && (
          <>
            <NameField
              label="名前"
              value={selected.name}
              testId="item-name"
              onPreview={(name) => updateFurniture(selected.id, { name }, "preview")}
            />
            {selected.shape === "cylinder" ? (
              <NumberField
                label="直径"
                valueM={selected.width}
                minM={LIMITS.furniture.min}
                maxM={LIMITS.furniture.max}
                testId="dim-width"
                onPreview={(width) => updateFurniture(selected.id, { width }, "preview")}
              />
            ) : (
              <>
                <NumberField
                  label="幅"
                  valueM={selected.width}
                  minM={LIMITS.furniture.min}
                  maxM={LIMITS.furniture.max}
                  testId="dim-width"
                  onPreview={(width) => updateFurniture(selected.id, { width }, "preview")}
                />
                <NumberField
                  label="奥行き"
                  valueM={selected.depth}
                  minM={LIMITS.furniture.min}
                  maxM={LIMITS.furniture.max}
                  testId="dim-depth"
                  onPreview={(depth) => updateFurniture(selected.id, { depth }, "preview")}
                />
              </>
            )}
            <NumberField
              label="高さ"
              valueM={selected.height}
              minM={LIMITS.furniture.min}
              maxM={LIMITS.furniture.max}
              testId="dim-height"
              onPreview={(height) => updateFurniture(selected.id, { height }, "preview")}
            />
            <p className="hint" data-testid="shared-note">
              名前・色・寸法・形状は全部の案に共通
            </p>
            <NumberField
              label="位置 X（中心）"
              valueM={selected.x}
              minM={LIMITS.position.min}
              maxM={LIMITS.position.max}
              testId="pos-x"
              onPreview={(x) => updateFurniture(selected.id, { x }, "preview")}
            />
            <NumberField
              label="位置 Z（中心）"
              valueM={selected.z}
              minM={LIMITS.position.min}
              maxM={LIMITS.position.max}
              testId="pos-z"
              onPreview={(z) => updateFurniture(selected.id, { z }, "preview")}
            />
            <NumberField
              label="底の高さ"
              valueM={selected.elevation ?? 0}
              minM={0}
              maxM={20}
              testId="item-elevation"
              onPreview={(elevation) => updateFurniture(selected.id, { elevation }, "preview")}
            />
            <p className="hint">底の高さと重なりの許可は、この案だけです。</p>
            <div className="rotation-row">
              <span>回転 {normalizeDegrees(selected.rotation).toFixed(0)}°</span>
              <button type="button" onClick={() => rotateBy(selected.id, -90)}>
                左へ 90°
              </button>
              <button type="button" onClick={() => rotateBy(selected.id, 90)}>
                右へ 90°
              </button>
            </div>
            <label className="field field-wide">
              <span>色</span>
              <input
                type="color"
                value={toColorInput(selected.color)}
                data-testid="item-color"
                onFocus={() => beginGesture()}
                onChange={(event) => updateFurniture(selected.id, { color: event.target.value }, "preview")}
                onBlur={() => endGesture()}
              />
            </label>
            <fieldset className="allow-list" data-testid="allow-overlap">
              <legend>重なってもいい家具</legend>
              {furniture.filter((item) => item.id !== selected.id).map((item) => (
                <label key={item.id} className="check">
                  <input
                    type="checkbox"
                    data-testid={`allow-${item.id}`}
                    checked={(selected.allowOverlapIds ?? []).includes(item.id)}
                    onChange={() => {
                      const current = selected.allowOverlapIds ?? [];
                      const allowOverlapIds = current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id];
                      updateFurniture(selected.id, { allowOverlapIds }, "commit");
                    }}
                  />
                  {item.name}
                </label>
              ))}
            </fieldset>
            {issue && issue.overlapIds.length > 0 && (
              <p className="warn" data-testid="overlap-warning">
                他の家具と重なっています（{overlapNames.join("、")}）。
              </p>
            )}
            {issue && issue.recessFixtureIds.length > 0 && (
              <p className="warn" data-testid="recess-warning">
                窓の出幅の中で、下端より低いか上端を超えています。
              </p>
            )}
            {issue && issue.entranceFixtureIds.length > 0 && (
              <p className="warn" data-testid="entrance-warning">
                入口をふさいでいます。
              </p>
            )}
            {issue && issue.windowNoteIds.length > 0 && (
              <p className="info" data-testid="window-note">
                窓にかかっています。
              </p>
            )}
            {issue?.outOfRoom && (
              <p className="warn" data-testid="bounds-warning">
                部屋の外にはみ出しています。
              </p>
            )}
            {issue && issue.fixtureOverlapIds.length > 0 && (
              <p className="warn" data-testid="fixture-overlap-warning">
                部屋の出っ張りと重なっています。
              </p>
            )}
            {issue && issue.swingFixtureIds.length > 0 && (
              <p className="warn" data-testid="swing-warning">
                扉の開閉スペースに家具があります。
              </p>
            )}
            {issue && issue.beamFixtureIds.length > 0 && (
              <p className="warn" data-testid="beam-warning">
                天井の梁に接触しています。
              </p>
            )}
            {issue?.exceedsCeiling && (
              <p className="warn" data-testid="ceiling-warning">
                高さが天井を超えています。
              </p>
            )}
            <div className="list-actions">
              <button type="button" onClick={() => duplicate(selected.id)}>
                複製
              </button>
              <button type="button" data-testid="remove-from-layout" onClick={() => remove(selected.id)}>
                この案から外す
              </button>
            </div>
            <div className="list-actions">
              <button
                type="button"
                className="danger"
                data-testid="delete-furniture"
                onClick={() => setConfirmingDelete(true)}
              >
                家具を消す
              </button>
            </div>
            {confirmingDelete && (
              <div className="warn" role="dialog" data-testid="delete-furniture-dialog">
                <p data-testid="delete-furniture-impact">
                  「{selected.name}」を家具そのものとして消します。次の案からなくなります：
                  {project.layouts
                    .filter((layout) => layout.placements.some((placement) => placement.furnitureId === selected.id))
                    .map((layout) => layout.name)
                    .join("、")}
                  。
                </p>
                <div className="list-actions">
                  <button
                    type="button"
                    data-testid="delete-furniture-confirm"
                    onClick={() => {
                      deleteFurniture(selected.id);
                      setConfirmingDelete(false);
                    }}
                  >
                    消す
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)}>
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </aside>
  );
}

function toColorInput(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#888888";
}
