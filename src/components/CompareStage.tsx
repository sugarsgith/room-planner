import { PlanView } from "./PlanView";
import { resolveLayout } from "../domain/schema";
import { useEditor } from "../state/store";

export function CompareStage() {
  const project = useEditor((s) => s.project);
  const compareLayoutId = useEditor((s) => s.compareLayoutId);
  const setActiveLayout = useEditor((s) => s.setActiveLayout);
  const setCompareLayout = useEditor((s) => s.setCompareLayout);
  const baseline = project.layouts.find((layout) => layout.id === project.baselineLayoutId);
  const others = project.layouts.filter((layout) => layout.id !== project.baselineLayoutId);
  const other = others.find((layout) => layout.id === compareLayoutId) ?? others[0];
  if (!baseline || !other) return null;
  const leftItems = resolveLayout(project, baseline.id);
  const rightItems = resolveLayout(project, other.id);

  function edit(id: string) {
    setActiveLayout(id);
    setCompareLayout(null);
  }

  return (
    <>
      <section className="compare-pane" data-testid="compare-left">
        <div className="compare-caption">
          <span>基準 · {baseline.name}</span>
          <button type="button" data-testid="edit-baseline" onClick={() => edit(baseline.id)}>
            この案を編集
          </button>
        </div>
        <div className="compare-view">
          <PlanView layoutId={baseline.id} readOnly ghostFurniture={rightItems} />
        </div>
      </section>
      <section className="compare-pane" data-testid="compare-right">
        <div className="compare-caption">
          {others.length > 1 ? (
            <select
              data-testid="compare-target"
              value={other.id}
              onChange={(event) => setCompareLayout(event.target.value)}
            >
              {others.map((layout) => (
                <option key={layout.id} value={layout.id}>
                  {layout.name}
                </option>
              ))}
            </select>
          ) : (
            <span>{other.name}</span>
          )}
          <button type="button" data-testid="edit-variant" onClick={() => edit(other.id)}>
            この案を編集
          </button>
        </div>
        <div className="compare-view">
          <PlanView layoutId={other.id} readOnly ghostFurniture={leftItems} />
        </div>
      </section>
    </>
  );
}
