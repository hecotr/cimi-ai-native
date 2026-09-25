import type { AgentRunRecord, WorkItemRecord } from "../demo/types";

export function RunSummary({
  workItem,
  run,
  onOpenDetail,
  running
}: {
  workItem?: WorkItemRecord;
  run?: AgentRunRecord;
  onOpenDetail?: () => void;
  running?: boolean;
}) {
  if (!workItem && !run) {
    return <p className="muted">当前没有 Active Run。</p>;
  }

  return (
    <div className="stack" data-testid="run-summary">
      {workItem ? (
        <div className="card" style={{ padding: 12 }}>
          <div className="tiny">{workItem.kind} Work Item</div>
          <strong>
            {workItem.id} {workItem.title}
          </strong>
          <p>{workItem.goal}</p>
          <div>授权范围：{workItem.authorization}</div>
          <div>
            Context Pack：<span className="mono">{workItem.contextPack}</span>
          </div>
          <div>
            Capability Binding：<span className="mono">{workItem.capabilityBinding}</span>
          </div>
        </div>
      ) : null}
      {run ? (
        <div className="card" style={{ padding: 12 }}>
          <div className="row space-between">
            <strong className="mono">{run.id}</strong>
            <span className={`badge ${run.status === "Succeeded" ? "badge-trust" : run.status === "Running" ? "badge-info" : "badge-neutral"}`}>
              {run.status}
            </span>
          </div>
          <div>耗时 {run.duration} · 预算 {run.budget} · 重试 {run.retries}</div>
          {running ? (
            <div className="progress-bar" aria-hidden="true">
              <span />
            </div>
          ) : null}
          <ul>
            {run.logSummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {onOpenDetail ? (
            <button type="button" className="button-secondary" onClick={onOpenDetail}>
              查看 Run 技术明细
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
