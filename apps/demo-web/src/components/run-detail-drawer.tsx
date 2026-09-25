import { useEffect } from "react";
import { X } from "lucide-react";
import type { AgentRunRecord } from "../demo/types";

export function RunDetailDrawer({
  run,
  open,
  onClose
}: {
  run: AgentRunRecord | null;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !run) {
    return null;
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-detail-title"
        data-testid="run-detail-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row space-between">
          <div>
            <div className="tiny">Technical Run Detail</div>
            <h2 id="run-detail-title" className="mono">
              {run.id}
            </h2>
          </div>
          <button type="button" className="button-ghost" onClick={onClose} aria-label="关闭运行明细">
            <X size={18} />
          </button>
        </div>
        <p>这些明细不属于生命周期主线，只解释一次 Agent 尝试做了什么。</p>
        <div>状态 {run.status} · 耗时 {run.duration} · 重试 {run.retries}</div>
        <div>
          Context Pack：<span className="mono">{run.contextPack}</span>
        </div>
        <h3>命令</h3>
        <ul>
          {run.commands.map((command) => (
            <li key={command} className="mono">
              {command}
            </li>
          ))}
        </ul>
        <h3>Tools</h3>
        <ul>
          {run.tools.map((tool) => (
            <li key={tool} className="mono">
              {tool}
            </li>
          ))}
        </ul>
        <h3>日志摘要</h3>
        <ul>
          {run.logSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {run.error ? <p className="badge badge-risk">{run.error}</p> : null}
      </aside>
    </div>
  );
}
