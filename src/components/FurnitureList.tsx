import { useMemo } from "react";
import { analyzeLayout, issueIsActive } from "../domain/geometry";
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
      <LayoutBar />
      <div className="panel-head">
        <h2>家具</h2>
        <span>{furniture.length} 件</span>
      </div>
      <ul className="furniture-list">
        {furniture.map((item) => {
          const issue = issues.get(item.id);
          const warn = Boolean(issue && issueIsActive(issue));
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

export function LayoutBar() {
  const project = useEditor((s) => s.project);
  const setActiveLayout = useEditor((s) => s.setActiveLayout);
  const duplicateLayout = useEditor((s) => s.duplicateLayout);
  const setCompareLayout = useEditor((s) => s.setCompareLayout);
  const others = project.layouts.filter((layout) => layout.id !== project.baselineLayoutId);
  return (
    <div className="layout-bar" data-testid="layout-bar">
      <label className="layout-select-label">
        <span>配置</span>
        <select
          data-testid="layout-select"
          value={project.activeLayoutId}
          onChange={(event) => setActiveLayout(event.target.value)}
        >
          {project.layouts.map((layout) => (
            <option key={layout.id} value={layout.id}>
              {layout.id === project.baselineLayoutId ? `基準 · ${layout.name}` : layout.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" data-testid="layout-duplicate" onClick={() => duplicateLayout()}>
        複製
      </button>
      <button
        type="button"
        data-testid="layout-compare"
        disabled={others.length === 0}
        onClick={() => {
          const preferred = others.find((layout) => layout.id === project.activeLayoutId) ?? others[0];
          if (preferred) setCompareLayout(preferred.id);
        }}
      >
        比較
      </button>
    </div>
  );
}
