import { useMemo } from "react";
import { analyzeLayout } from "../domain/geometry";
import { activeFurniture } from "../domain/schema";
import { formatCm } from "../domain/units";
import { useEditor } from "../state/store";

export function FurnitureList() {
  const project = useEditor((s) => s.project);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const addFurniture = useEditor((s) => s.addFurniture);
  const furniture = activeFurniture(project);
  const issues = useMemo(
    () => new Map(analyzeLayout(project.room, furniture).map((issue) => [issue.id, issue])),
    [project.room, furniture],
  );

  return (
    <aside className="panel list-panel">
      <div className="panel-head">
        <h2>家具</h2>
        <span>{furniture.length} 件</span>
      </div>
      <ul className="furniture-list">
        {furniture.map((item) => {
          const issue = issues.get(item.id);
          const warn = Boolean(issue && (issue.outOfRoom || issue.exceedsCeiling || issue.overlapIds.length > 0));
          const size =
            item.shape === "cylinder"
              ? `直径 ${formatCm(item.width)} × 高 ${formatCm(item.height)}`
              : `${formatCm(item.width)} × ${formatCm(item.depth)} × ${formatCm(item.height)}`;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={item.id === selectedId ? "row selected" : "row"}
                data-testid={`furniture-${item.id}`}
                onClick={() => select(item.id)}
              >
                <span className="swatch" style={{ background: item.color }} />
                <span className="row-text">
                  <span className="row-name">
                    {item.name}
                    {warn && <em className="badge">注意</em>}
                  </span>
                  <span className="row-size">{size} cm</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="list-actions">
        <button type="button" onClick={() => addFurniture("box")}>
          箱を追加
        </button>
        <button type="button" onClick={() => addFurniture("cylinder")}>
          円柱を追加
        </button>
      </div>
    </aside>
  );
}
