import { useMemo, useState } from "react";
import { cmToM, formatCm } from "../domain/units";
import { useEditor } from "../state/store";

export function StorageSection({ furnitureId }: { furnitureId: string }) {
  const project = useEditor((s) => s.project);
  const addSpace = useEditor((s) => s.addStorageSpace);
  const removeSpace = useEditor((s) => s.removeStorageSpace);
  const addItem = useEditor((s) => s.addStoredItem);
  const removeItem = useEditor((s) => s.removeStoredItem);
  const item = project.furniture.find((entry) => entry.id === furnitureId);
  const spaces = item?.spaces ?? [];
  const [name, setName] = useState("");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [height, setHeight] = useState("");
  const [note, setNote] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [itemNote, setItemNote] = useState("");
  const held = project.storedItems.filter((entry) => spaces.some((space) => space.id === entry.spaceId));

  function addSpaceFromForm() {
    const widthM = cmToM(Number(width));
    const depthM = cmToM(Number(depth));
    const heightM = cmToM(Number(height));
    if (!name.trim() || !(widthM > 0) || !(depthM > 0) || !(heightM > 0)) return;
    const id = createId();
    addSpace(furnitureId, { id, name: name.trim(), width: widthM, depth: depthM, height: heightM, note: note.trim() });
    setName("");
    setWidth("");
    setDepth("");
    setHeight("");
    setNote("");
    setSpaceId(id);
  }

  function addHeldItem() {
    const qty = Number(quantity);
    const target = spaceId || spaces[0]?.id;
    if (!itemName.trim() || !target || !Number.isInteger(qty) || qty < 1) return;
    addItem({ id: createId(), name: itemName.trim(), quantity: qty, spaceId: target, note: itemNote.trim() });
    setItemName("");
    setItemNote("");
    setQuantity("1");
  }

  return (
    <section className="storage-section" data-testid="storage-section">
      <div className="panel-head">
        <h2>収納</h2>
      </div>
      <p className="hint">内寸は cm です。移動しても、この案から外しても残ります。入ったものの修正は上の「収納」です。備え付け収納の中はまだ記録できません。</p>
      {spaces.map((space) => (
        <div key={space.id} className="fixture-row" data-testid={`storage-space-${space.id}`}>
          <span>
            {space.name} {formatCm(space.width)} × {formatCm(space.depth)} × {formatCm(space.height)} cm
            {space.note ? `（${space.note}）` : ""}
          </span>
          <button type="button" onClick={() => removeSpace(furnitureId, space.id)}>
            外す
          </button>
        </div>
      ))}
      <label className="field field-wide">
        <span>名称</span>
        <input data-testid="storage-name" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>幅</span>
        <input data-testid="storage-width" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} />
        <span className="unit">cm</span>
      </label>
      <label className="field">
        <span>奥行き</span>
        <input data-testid="storage-depth" inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} />
        <span className="unit">cm</span>
      </label>
      <label className="field">
        <span>高さ</span>
        <input data-testid="storage-height" inputMode="decimal" value={height} onChange={(event) => setHeight(event.target.value)} />
        <span className="unit">cm</span>
      </label>
      <label className="field field-wide">
        <span>メモ</span>
        <input data-testid="storage-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button type="button" data-testid="storage-add" onClick={addSpaceFromForm}>
        収納スペースを追加
      </button>
      {spaces.length > 0 && (
        <>
          <ul className="furniture-list">
            {held.map((entry) => (
              <li key={entry.id} className="fixture-row">
                <span>
                  {entry.name} × {entry.quantity}
                </span>
                <button type="button" onClick={() => removeItem(entry.id)}>
                  外す
                </button>
              </li>
            ))}
          </ul>
          <label className="field field-wide">
            <span>収納物</span>
            <input data-testid="stored-name" value={itemName} onChange={(event) => setItemName(event.target.value)} />
          </label>
          <label className="field">
            <span>数量</span>
            <input data-testid="stored-qty" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label className="field field-wide">
            <span>場所</span>
            <select data-testid="stored-space" value={spaceId || spaces[0].id} onChange={(event) => setSpaceId(event.target.value)}>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-wide">
            <span>メモ</span>
            <input data-testid="stored-note" value={itemNote} onChange={(event) => setItemNote(event.target.value)} />
          </label>
          <button type="button" data-testid="stored-add" onClick={addHeldItem}>
            収納物を追加
          </button>
        </>
      )}
    </section>
  );
}

export function StorageIndex() {
  const project = useEditor((s) => s.project);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const spaces = new Map(
      project.furniture.flatMap((item) => (item.spaces ?? []).map((space) => [space.id, { space, owner: item.name }] as const)),
    );
    const needle = query.trim();
    return project.storedItems
      .map((item) => ({ item, where: spaces.get(item.spaceId) }))
      .filter((row) => row.where && (needle === "" || row.item.name.includes(needle) || row.where.space.name.includes(needle)));
  }, [project.furniture, project.storedItems, query]);

  return (
    <section data-testid="storage-index">
      <div className="panel-head">
        <h2>収納物</h2>
        <span>{project.storedItems.length} 件</span>
      </div>
      <label className="field field-wide">
        <span>検索</span>
        <input data-testid="storage-search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <ul className="furniture-list">
        {rows.map((row) => (
          <li key={row.item.id} className="row-size">
            {row.item.name} × {row.item.quantity} / {row.where?.owner} · {row.where?.space.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
}
