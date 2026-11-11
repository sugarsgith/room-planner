import { compareLayouts } from "../domain/compare";
import { formatCm } from "../domain/units";
import { useEditor } from "../state/store";

const STATUS_LABEL = {
  moved: "移動",
  rotated: "回転",
  added: "追加",
  removed: "外れた",
  split: "別家具",
  same: "同じ",
} as const;

export function DiffPanel() {
  const project = useEditor((s) => s.project);
  const compareLayoutId = useEditor((s) => s.compareLayoutId);
  const setCompareLayout = useEditor((s) => s.setCompareLayout);
  const rightId = compareLayoutId ?? "";
  const comparison = compareLayouts(project, project.baselineLayoutId, rightId);
  const visible = comparison.entries.filter((entry) => entry.status !== "same");
  const count = (status: "moved" | "rotated" | "added" | "removed" | "split") =>
    comparison.entries.filter((entry) => entry.status === status).length;
  const right = project.layouts.find((layout) => layout.id === rightId);
  const clearance = (value: number | null) => (value === null ? "—" : `${formatCm(value)} cm`);

  return (
    <aside className="panel list-panel" data-testid="diff-list">
      <div className="layout-bar">
        <strong>差分</strong>
        <button type="button" data-testid="compare-close" onClick={() => setCompareLayout(null)}>
          比較を閉じる
        </button>
      </div>
      <div className="panel-head">
        <h2>差分</h2>
        <span>{right?.name ?? ""}</span>
      </div>
      <p className="hint" data-testid="diff-summary">
        移動 {count("moved")}、回転 {count("rotated")}、追加 {count("added")}、外れた {count("removed")}
        {count("split") > 0 ? `、別家具 ${count("split")}` : ""}
      </p>
      <p className="hint" data-testid="issue-compare">
        干渉 {comparison.issues.left}件 → {comparison.issues.right}件
      </p>
      <p className="hint" data-testid="clearance-compare">
        最小すき間 {clearance(comparison.clearance.left)} → {clearance(comparison.clearance.right)}
      </p>
      <ul className="furniture-list">
        {visible.length === 0 && <li className="hint">配置の違いはありません。</li>}
        {visible.map((entry) => (
          <li key={`${entry.status}-${entry.furnitureId}`} data-testid={`diff-${entry.status}-${entry.furnitureId}`}>
            <span className="row-name">
              {entry.name} · {STATUS_LABEL[entry.status]}
              {entry.status === "moved" && entry.distanceM !== undefined ? ` ${formatCm(entry.distanceM)} cm` : ""}
              {entry.status === "rotated" && entry.rotationDelta !== undefined
                ? ` ${Math.round(entry.rotationDelta)}°`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
