import { useEffect, useMemo, useRef, useState } from "react";
import {
  childItems,
  directItems,
  innerSpace,
  isContainer,
  itemPath,
  parentContainer,
} from "../domain/containers";
import { fixtureLabel } from "../domain/fixtures";
import { fitStoredItem, spaceFill, type FitKind } from "../domain/storageFit";
import { LIMITS } from "../domain/schema";
import { cmToM, formatCm } from "../domain/units";
import type { StorageFixture, StorageSpace, StoredItem } from "../domain/types";
import { useEditor } from "../state/store";
import { NameField, NumberField } from "./fields";

type UnitRef = { kind: "furniture"; id: string } | { kind: "builtin"; id: string };
type FocusRef = { kind: "space"; id: string } | { kind: "item"; id: string };

export function StorageWorkspace() {
  const project = useEditor((s) => s.project);
  const setWorkMode = useEditor((s) => s.setWorkMode);
  const selectFurniture = useEditor((s) => s.select);
  const [query, setQuery] = useState("");
  const [unit, setUnit] = useState<UnitRef | null>(null);
  const [focus, setFocus] = useState<FocusRef | null>(null);
  const [pane, setPane] = useState<"list" | "detail">("list");
  const needle = query.trim();

  const furnitureUnits = useMemo(
    () => project.furniture.filter((item) => (item.spaces ?? []).length > 0),
    [project.furniture],
  );
  const builtins = useMemo(
    () => project.room.fixtures.filter((fixture): fixture is StorageFixture => fixture.type === "storage"),
    [project.room.fixtures],
  );
  const hits = useMemo(() => {
    if (!needle) return [];
    const located: { item: StoredItem; space: StorageSpace; owner: (typeof project.furniture)[number] }[] = [];
    for (const owner of project.furniture) {
      for (const space of owner.spaces ?? []) {
        for (const item of project.storedItems) {
          if (item.spaceId !== space.id) continue;
          if (!item.name.includes(needle) && !space.name.includes(needle) && !owner.name.includes(needle)) continue;
          located.push({ item, space, owner });
        }
      }
    }
    return located;
  }, [needle, project.furniture, project.storedItems]);

  function visibleFurniture(name: string, spaces: StorageSpace[]): boolean {
    if (!needle) return true;
    if (name.includes(needle)) return true;
    if (spaces.some((space) => space.name.includes(needle))) return true;
    const ids = new Set(spaces.map((space) => space.id));
    return project.storedItems.some((item) => ids.has(item.spaceId) && item.name.includes(needle));
  }

  function openUnit(next: UnitRef) {
    setUnit(next);
    setFocus(null);
    setPane("detail");
  }

  const selectedFurniture = unit?.kind === "furniture" ? furnitureUnits.find((item) => item.id === unit.id) ?? null : null;
  const selectedBuiltin = unit?.kind === "builtin" ? builtins.find((item) => item.id === unit.id) ?? null : null;

  return (
    <div className="workspace storage-workspace" data-storage-phone={pane} data-testid="storage-workspace">
      <aside className="panel list-panel">
        <div className="panel-head">
          <h2>収納</h2>
          <span>{furnitureUnits.length + builtins.length} 件</span>
        </div>
        <label className="field field-wide">
          <span>検索</span>
          <input
            data-testid="storage-view-search"
            value={query}
            placeholder="名前"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {needle && (
          <ul className="furniture-list" data-testid="storage-search-hits">
            {hits.map((hit) => (
              <li key={hit.item.id}>
                <button
                  type="button"
                  className="row"
                  onClick={() => {
                    setUnit({ kind: "furniture", id: hit.owner.id });
                    setFocus({ kind: "item", id: hit.item.id });
                    setPane("detail");
                  }}
                >
                  <span className="row-text">
                    <span className="row-name">{itemPath(hit.item, project.storedItems, hit.space.name)}</span>
                    <span className="row-size">{hit.owner.name}</span>
                  </span>
                </button>
              </li>
            ))}
            {hits.length === 0 && <li className="hint">名前が一致する収納物はありません。</li>}
          </ul>
        )}
        <ul className="furniture-list">
          {furnitureUnits.filter((item) => visibleFurniture(item.name, item.spaces ?? [])).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={unit?.kind === "furniture" && unit.id === item.id ? "row selected" : "row"}
                data-testid={`storage-unit-${item.id}`}
                onClick={() => openUnit({ kind: "furniture", id: item.id })}
              >
                <span className="swatch" style={{ background: item.color }} />
                <span className="row-text">
                  <span className="row-name">{item.name}</span>
                  <span className="row-size">スペース {(item.spaces ?? []).length} 件</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {furnitureUnits.length === 0 && (
          <p className="hint">収納スペースのある家具がまだありません。配置画面で家具を選び、スペースを追加するとここに出ます。</p>
        )}
        <div className="panel-head">
          <h2>備え付け収納</h2>
        </div>
        <p className="hint">中の段や収納物は、まだ記録できません。</p>
        <ul className="furniture-list">
          {builtins
            .filter((fixture) => !needle || fixtureLabel(fixture).includes(needle))
            .map((fixture) => (
              <li key={fixture.id}>
                <button
                  type="button"
                  className={unit?.kind === "builtin" && unit.id === fixture.id ? "row selected" : "row"}
                  data-testid={`storage-builtin-${fixture.id}`}
                  onClick={() => openUnit({ kind: "builtin", id: fixture.id })}
                >
                  <span className="row-text">
                    <span className="row-name">{fixtureLabel(fixture)}</span>
                    <span className="row-size">
                      {formatCm(fixture.width)} × {formatCm(fixture.depth)} × {formatCm(fixture.height)} cm
                    </span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </aside>
      <main className="storage-main" data-testid="storage-detail">
        {!selectedFurniture && !selectedBuiltin && (
          <p className="hint">左の一覧から、収納のある家具か備え付け収納を選びます。</p>
        )}
        {selectedFurniture && (
          <>
            <div className="panel-head">
              <h2>{selectedFurniture.name}</h2>
              <span className="storage-head-actions">
                <button type="button" className="storage-back" data-testid="storage-back" onClick={() => setPane("list")}>
                  一覧へ
                </button>
                <button
                  type="button"
                  data-testid="storage-show-on-plan"
                  onClick={() => {
                    selectFurniture(selectedFurniture.id);
                    setWorkMode("layout");
                  }}
                >
                  配置で見る
                </button>
              </span>
            </div>
            <p className="hint">
              外形 {formatCm(selectedFurniture.width)} × {formatCm(selectedFurniture.depth)} × {formatCm(selectedFurniture.height)} cm。
              内寸と収納物は、どの配置案でも共通です。
            </p>
            {(selectedFurniture.spaces ?? []).map((space) => {
              const held = directItems(space.id, project.storedItems);
              const selected = focus?.kind === "space" && focus.id === space.id;
              return (
                <article
                  key={space.id}
                  className={selected ? "space-card selected" : "space-card"}
                  data-testid={`storage-view-space-${space.id}`}
                >
                  <button type="button" className="row" onClick={() => setFocus({ kind: "space", id: space.id })}>
                    <span className="row-text">
                      <span className="row-name">{space.name}</span>
                      <span className="row-size">
                        内寸 {formatCm(space.width)} × {formatCm(space.depth)} × {formatCm(space.height)} cm
                      </span>
                    </span>
                  </button>
                  {space.note ? <p className="hint">{space.note}</p> : null}
                  <FillMeter space={space} items={held} testId={`space-fill-${space.id}`} />
                  <ul className="furniture-list">
                    {held.map((item) => (
                      <StoredItemRow key={item.id} item={item} items={project.storedItems} parentSpace={space} focus={focus} onFocus={setFocus} />
                    ))}
                  </ul>
                </article>
              );
            })}
          </>
        )}
        {selectedBuiltin && (
          <>
            <div className="panel-head">
              <h2>{fixtureLabel(selectedBuiltin)}</h2>
              <button type="button" className="storage-back" data-testid="storage-back" onClick={() => setPane("list")}>
                一覧へ
              </button>
            </div>
            <p className="hint">
              外形 {formatCm(selectedBuiltin.width)} × {formatCm(selectedBuiltin.depth)} × {formatCm(selectedBuiltin.height)} cm。
              中の段や収納物は、まだ記録できません。
            </p>
          </>
        )}
      </main>
      <aside className="panel inspector" data-testid="storage-editor">
        <div className="panel-head">
          <h2>修正</h2>
        </div>
        {selectedFurniture && focus?.kind === "space" && (
          <SpaceEditor furnitureId={selectedFurniture.id} spaceId={focus.id} />
        )}
        {selectedFurniture && focus?.kind === "item" && <ItemEditor itemId={focus.id} />}
        {selectedFurniture && !focus && <p className="hint">中央のスペースか収納物を選ぶと、名前や寸法を直せます。</p>}
        {selectedBuiltin && <p className="hint">備え付け収納の中は、まだここでは登録できません。</p>}
        {!selectedFurniture && !selectedBuiltin && <p className="hint">収納を選ぶと、ここに修正欄が出ます。</p>}
      </aside>
    </div>
  );
}

function StoredItemRow({
  item,
  items,
  parentSpace,
  focus,
  onFocus,
  nested = false,
}: {
  item: StoredItem;
  items: StoredItem[];
  parentSpace: StorageSpace;
  focus: FocusRef | null;
  onFocus: (focus: FocusRef) => void;
  nested?: boolean;
}) {
  const container = isContainer(item);
  const cavity = container ? innerSpace(item) : null;
  const fit = fitStoredItem(item, parentSpace, nested ? "入れ物" : "スペース");
  const kids = container ? childItems(item, items) : [];
  const itemSelected = focus?.kind === "item" && focus.id === item.id;
  return (
    <li>
      <button
        type="button"
        className={itemSelected ? "row selected" : "row"}
        data-testid={`storage-view-item-${item.id}`}
        onClick={() => onFocus({ kind: "item", id: item.id })}
      >
        <span className="row-text">
          <span className="row-name">
            {item.name} × {item.quantity}
            {container ? " 入れ物" : ""}
          </span>
          <span className="row-size">{sizeText(item)}</span>
        </span>
        <span data-testid={`item-fit-${item.id}`} className={fitClass(fit.kind)}>
          {fit.label}
        </span>
      </button>
      {fit.countNote ? (
        <p className="hint" data-testid={`item-count-${item.id}`}>
          {fit.countNote}
        </p>
      ) : null}
      {cavity && (
        <div className="nested-items" data-testid={`container-block-${item.id}`}>
          <p className="hint">
            内寸 {formatCm(cavity.width)} × {formatCm(cavity.depth)} × {formatCm(cavity.height)} cm
          </p>
          <FillMeter space={cavity} items={kids} testId={`container-fill-${item.id}`} />
          <ul className="furniture-list">
            {kids.map((child) => (
              <StoredItemRow key={child.id} item={child} items={items} parentSpace={cavity} focus={focus} onFocus={onFocus} nested />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function FillMeter({ space, items, testId }: { space: StorageSpace; items: StoredItem[]; testId: string }) {
  const fill = spaceFill(items, space);
  const width = fill.ratio == null ? 0 : Math.max(0, Math.min(100, fill.ratio * 100));
  return (
    <div className="fill-block">
      <div className="fill-head">
        <span>埋まり具合</span>
        <span data-testid={testId}>{fill.label}</span>
      </div>
      <div className={fill.ratio != null && fill.ratio > 1 ? "fill-meter over" : "fill-meter"}>
        <span style={{ width: `${width}%` }} />
      </div>
      {fill.unsizedCount > 0 && <p className="hint">サイズ未入力の物は目安に入っていません。</p>}
    </div>
  );
}

function SpaceEditor({ furnitureId, spaceId }: { furnitureId: string; spaceId: string }) {
  const project = useEditor((s) => s.project);
  const updateStorageSpace = useEditor((s) => s.updateStorageSpace);
  const space = project.furniture.find((item) => item.id === furnitureId)?.spaces?.find((entry) => entry.id === spaceId);
  if (!space) return <p className="hint">このスペースはもうありません。</p>;
  return (
    <>
      <p className="hint">内寸は cm です。0.1cm 単位。</p>
      <NameField
        label="名称"
        value={space.name}
        testId="space-edit-name"
        onPreview={(name) => updateStorageSpace(furnitureId, { ...space, name }, "preview")}
      />
      <NumberField
        label="幅"
        valueM={space.width}
        minM={LIMITS.furniture.min}
        maxM={LIMITS.furniture.max}
        testId="space-edit-width"
        onPreview={(width) => updateStorageSpace(furnitureId, { ...space, width }, "preview")}
      />
      <NumberField
        label="奥行き"
        valueM={space.depth}
        minM={LIMITS.furniture.min}
        maxM={LIMITS.furniture.max}
        testId="space-edit-depth"
        onPreview={(depth) => updateStorageSpace(furnitureId, { ...space, depth }, "preview")}
      />
      <NumberField
        label="高さ"
        valueM={space.height}
        minM={LIMITS.furniture.min}
        maxM={LIMITS.furniture.max}
        testId="space-edit-height"
        onPreview={(height) => updateStorageSpace(furnitureId, { ...space, height }, "preview")}
      />
      <NoteField
        value={space.note}
        testId="space-edit-note"
        onCommit={(note) => updateStorageSpace(furnitureId, { ...space, note })}
      />
    </>
  );
}

function ItemEditor({ itemId }: { itemId: string }) {
  const project = useEditor((s) => s.project);
  const updateStoredItem = useEditor((s) => s.updateStoredItem);
  const item = project.storedItems.find((entry) => entry.id === itemId);
  const space = project.furniture.flatMap((entry) => entry.spaces ?? []).find((entry) => entry.id === item?.spaceId);
  if (!item || !space) return <p className="hint">この収納物はもうありません。</p>;
  const parent = parentContainer(item, project.storedItems);
  const cavity = parent ? innerSpace(parent) : null;
  const fit = fitStoredItem(item, cavity ?? space, parent ? "入れ物" : "スペース");
  return (
    <>
      <p className={fitClass(fit.kind)} data-testid="item-edit-fit">
        {fit.label}
      </p>
      {fit.countNote ? <p className="hint">{fit.countNote}</p> : null}
      <NameField
        label="名前"
        value={item.name}
        testId="item-edit-name"
        onPreview={(name) => updateStoredItem({ ...item, name }, "preview")}
      />
      <PlaceField item={item} />
      <QuantityField item={item} />
      <ItemSizeFields item={item} />
      <ItemInnerFields item={item} />
      <NoteField value={item.note} testId="item-edit-note" onCommit={(note) => updateStoredItem({ ...item, note })} />
      <RemoveStoredItemButton itemId={item.id} />
    </>
  );
}

function PlaceField({ item }: { item: StoredItem }) {
  const project = useEditor((s) => s.project);
  const updateStoredItem = useEditor((s) => s.updateStoredItem);
  const parent = parentContainer(item, project.storedItems);
  const container = isContainer(item);
  const value = parent ? `box:${parent.id}` : `space:${item.spaceId}`;
  const spaces = project.furniture.flatMap((furniture) =>
    (furniture.spaces ?? []).map((space) => ({ furniture, space })),
  );
  const boxes = project.storedItems.filter((entry) => isContainer(entry) && entry.id !== item.id);
  return (
    <label className="field field-wide">
      <span>場所</span>
      <select
        data-testid="item-edit-place"
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next.startsWith("space:")) {
            const moved: StoredItem = { ...item, spaceId: next.slice("space:".length) };
            delete moved.containerId;
            updateStoredItem(moved);
            return;
          }
          const box = project.storedItems.find((entry) => entry.id === next.slice("box:".length));
          if (!box) return;
          updateStoredItem({ ...item, spaceId: box.spaceId, containerId: box.id });
        }}
      >
        {spaces.map(({ furniture, space }) => (
          <option key={space.id} value={`space:${space.id}`}>
            {furniture.name} · {space.name}
          </option>
        ))}
        {!container &&
          boxes.map((box) => (
            <option key={box.id} value={`box:${box.id}`}>
              {box.name} の中
            </option>
          ))}
      </select>
    </label>
  );
}

export function RemoveStoredItemButton({ itemId }: { itemId: string }) {
  const project = useEditor((s) => s.project);
  const removeStoredItem = useEditor((s) => s.removeStoredItem);
  const [open, setOpen] = useState(false);
  const item = project.storedItems.find((entry) => entry.id === itemId);
  const kids = project.storedItems.filter((entry) => entry.containerId === itemId);
  if (!item) return null;
  if (kids.length === 0) {
    return (
      <button type="button" data-testid="remove-stored-item" onClick={() => removeStoredItem(itemId)}>
        外す
      </button>
    );
  }
  const names = kids.map((entry) => entry.name).join("、");
  return (
    <>
      <button type="button" data-testid="remove-stored-item" onClick={() => setOpen(true)}>
        外す
      </button>
      {open && (
        <div className="warn" role="dialog" data-testid="remove-stored-dialog">
          <p>
            「{item.name}」を外します。中の「{names}」は消さず、このスペースに出せます。中まで消すこともできます。
          </p>
          <div className="list-actions">
            <button
              type="button"
              data-testid="remove-item-release"
              onClick={() => {
                removeStoredItem(itemId, "release");
                setOpen(false);
              }}
            >
              スペースに出す
            </button>
            <button
              type="button"
              data-testid="remove-item-discard"
              onClick={() => {
                removeStoredItem(itemId, "discard");
                setOpen(false);
              }}
            >
              中の物も消す
            </button>
            <button type="button" data-testid="remove-item-cancel" onClick={() => setOpen(false)}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function QuantityField({ item }: { item: StoredItem }) {
  const updateStoredItem = useEditor((s) => s.updateStoredItem);
  const [text, setText] = useState(String(item.quantity));
  const focused = useRef(false);
  const container = isContainer(item);
  useEffect(() => {
    if (!focused.current) setText(String(item.quantity));
  }, [item.id, item.quantity]);
  return (
    <>
      <label className="field">
        <span>数量</span>
        <input
          data-testid="item-edit-qty"
          inputMode="numeric"
          value={container ? "1" : text}
          disabled={container}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => {
            focused.current = false;
            const qty = Number(event.currentTarget.value);
            if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
              setText(String(item.quantity));
              return;
            }
            if (qty !== item.quantity) updateStoredItem({ ...item, quantity: qty });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      {container && <p className="hint">入れ物は1個だけです。同じものが複数あるときは、1つずつ登録してください。</p>}
    </>
  );
}

function ItemInnerFields({ item }: { item: StoredItem }) {
  const updateStoredItem = useEditor((s) => s.updateStoredItem);
  const project = useEditor((s) => s.project);
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [height, setHeight] = useState("");
  const [hint, setHint] = useState("");
  const focused = useRef(false);
  const nested = parentContainer(item, project.storedItems) !== null;

  useEffect(() => {
    if (focused.current) return;
    setWidth(shownCm(item.innerWidth));
    setDepth(shownCm(item.innerDepth));
    setHeight(shownCm(item.innerHeight));
    setHint("");
  }, [item.id, item.innerWidth, item.innerDepth, item.innerHeight]);

  if (item.quantity !== 1) {
    return <p className="hint">数量が1のときだけ、入れ物にできます。同じものが複数あるときは、1つずつ登録してください。</p>;
  }
  if (nested) {
    return <p className="hint">入れ物の中に、さらに入れ物は置けません。</p>;
  }

  function commit(nextWidth: string, nextDepth: string, nextHeight: string) {
    const parsed = [nextWidth, nextDepth, nextHeight].map(parseCm);
    if (parsed.every((value) => value === "empty")) {
      const cleared: StoredItem = { ...item };
      delete cleared.innerWidth;
      delete cleared.innerDepth;
      delete cleared.innerHeight;
      updateStoredItem(cleared);
      setHint(childItems(item, project.storedItems).length > 0 ? "中の物は、このスペースに出します。" : "");
      return;
    }
    if (parsed.every((value) => typeof value === "number")) {
      updateStoredItem({
        ...item,
        quantity: 1,
        innerWidth: parsed[0] as number,
        innerDepth: parsed[1] as number,
        innerHeight: parsed[2] as number,
      });
      setHint("");
      return;
    }
    if (parsed.some((value) => value === "invalid")) {
      setHint("1〜1000cm の数値にしてください。空欄なら入れ物ではありません。");
      return;
    }
    setHint("内寸は、幅・奥行き・高さをそろえて入れます。");
  }

  return (
    <>
      <p className="hint">入れ物の内寸（cm）。中の物はこの内寸で判定します。空欄にすると、中の物はこのスペースに出ます。</p>
      <OptionalCm label="内幅" value={width} testId="item-edit-inner-width" onFocus={() => (focused.current = true)} onChange={setWidth} onBlur={(value) => { focused.current = false; commit(value, depth, height); }} />
      <OptionalCm label="内奥行" value={depth} testId="item-edit-inner-depth" onFocus={() => (focused.current = true)} onChange={setDepth} onBlur={(value) => { focused.current = false; commit(width, value, height); }} />
      <OptionalCm label="内高さ" value={height} testId="item-edit-inner-height" onFocus={() => (focused.current = true)} onChange={setHeight} onBlur={(value) => { focused.current = false; commit(width, depth, value); }} />
      {hint ? <p className="hint">{hint}</p> : null}
    </>
  );
}

function ItemSizeFields({ item }: { item: StoredItem }) {
  const updateStoredItem = useEditor((s) => s.updateStoredItem);
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [height, setHeight] = useState("");
  const [hint, setHint] = useState("");
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setWidth(shownCm(item.width));
    setDepth(shownCm(item.depth));
    setHeight(shownCm(item.height));
    setHint("");
  }, [item.id, item.width, item.depth, item.height]);

  function commit(nextWidth: string, nextDepth: string, nextHeight: string) {
    const parsed = [nextWidth, nextDepth, nextHeight].map(parseCm);
    if (parsed.every((value) => value === "empty")) {
      const cleared: StoredItem = { ...item };
      delete cleared.width;
      delete cleared.depth;
      delete cleared.height;
      updateStoredItem(cleared);
      setHint("");
      return;
    }
    if (parsed.every((value) => typeof value === "number")) {
      updateStoredItem({
        ...item,
        width: parsed[0] as number,
        depth: parsed[1] as number,
        height: parsed[2] as number,
      });
      setHint("");
      return;
    }
    if (parsed.some((value) => value === "invalid")) {
      setHint("1〜1000cm の数値にしてください。空欄ならサイズ未入力です。");
      return;
    }
    setHint("幅・奥行き・高さをそろえて入れると、入るか判定します。");
  }

  return (
    <>
      <p className="hint">だいたいの大きさ（cm）。空欄はサイズ未入力で、判定しません。</p>
      <OptionalCm label="幅" value={width} testId="item-edit-width" onFocus={() => (focused.current = true)} onChange={setWidth} onBlur={(value) => { focused.current = false; commit(value, depth, height); }} />
      <OptionalCm label="奥行き" value={depth} testId="item-edit-depth" onFocus={() => (focused.current = true)} onChange={setDepth} onBlur={(value) => { focused.current = false; commit(width, value, height); }} />
      <OptionalCm label="高さ" value={height} testId="item-edit-height" onFocus={() => (focused.current = true)} onChange={setHeight} onBlur={(value) => { focused.current = false; commit(width, depth, value); }} />
      {hint ? <p className="hint">{hint}</p> : null}
    </>
  );
}

function OptionalCm({
  label,
  value,
  testId,
  onFocus,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  testId: string;
  onFocus: () => void;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        data-testid={testId}
        inputMode="decimal"
        value={value}
        placeholder="未入力"
        onFocus={onFocus}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="unit">cm</span>
    </label>
  );
}

function NoteField({ value, testId, onCommit }: { value: string; testId: string; onCommit: (note: string) => void }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return (
    <label className="field field-wide">
      <span>メモ</span>
      <input
        data-testid={testId}
        value={text}
        maxLength={200}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={(event) => {
          focused.current = false;
          const next = event.currentTarget.value.slice(0, 200);
          setText(next);
          if (next !== value) onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function shownCm(meters: number | undefined): string {
  return meters != null && meters > 0 ? formatCm(meters) : "";
}

function parseCm(raw: string): number | "empty" | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "invalid";
  const meters = cmToM(n);
  if (meters < LIMITS.furniture.min - 1e-9 || meters > LIMITS.furniture.max + 1e-9) return "invalid";
  return meters;
}

function sizeText(item: StoredItem): string {
  if (item.width == null || item.depth == null || item.height == null) return "サイズ未入力";
  if (!(item.width > 0) || !(item.depth > 0) || !(item.height > 0)) return "サイズ未入力";
  return `${formatCm(item.width)} × ${formatCm(item.depth)} × ${formatCm(item.height)} cm`;
}

function fitClass(kind: FitKind): string {
  if (kind === "too-tall" || kind === "no-fit") return "fit-label bad";
  if (kind === "fits-rotated") return "fit-label turn";
  if (kind === "fits") return "fit-label ok";
  return "fit-label";
}
