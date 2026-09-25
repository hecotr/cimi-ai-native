import { useEffect } from "react";
import { X } from "lucide-react";
import type { DecisionRequest } from "../demo/types";

export function DecisionPanel({
  request,
  open,
  onClose,
  onApprove,
  onRequestChanges,
  onReject
}: {
  request: DecisionRequest | null;
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
  onRequestChanges: () => void;
  onReject: () => void;
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

  if (!open || !request) {
    return null;
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-title"
        data-testid="decision-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row space-between">
          <div>
            <div className="tiny">Decision Request · {request.id}</div>
            <h2 id="decision-title" style={{ margin: "4px 0 0" }}>
              {request.title}
            </h2>
          </div>
          <button type="button" className="button-ghost" onClick={onClose} aria-label="关闭决策面板">
            <X size={18} />
          </button>
        </div>

        <section className="stack" style={{ marginTop: 16 }}>
          <p>
            <strong>系统正在询问：</strong>
            {request.question}
          </p>
          <div>
            Acting role：<strong>{request.actingRole}</strong>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div>被决定对象：{request.objectType}</div>
            <div>
              版本：<span className="mono">{request.objectVersion}</span>
            </div>
            {request.artifactId ? (
              <div>
                Artifact：<span className="mono">{request.artifactId}</span>
              </div>
            ) : null}
            {request.artifactDigest ? (
              <div>
                Digest：<span className="mono">{request.artifactDigest}</span>
              </div>
            ) : null}
            {request.environment ? (
              <div>
                Environment：<span className="mono">{request.environment}</span>
              </div>
            ) : null}
            <div className="tiny">过期时间 {request.expiresAt}</div>
          </div>

          <div className="card" style={{ padding: 12, background: "var(--brand-soft)" }}>
            <div className="badge badge-info">{request.recommendationLabel}</div>
            <p style={{ margin: "8px 0 0" }}>{request.recommendation}</p>
          </div>

          <div>
            <h3>支持 Evidence</h3>
            <ul>
              {request.supporting.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>反驳 / 缺口</h3>
            <ul>
              {request.opposing.length === 0 && request.gaps.length === 0 ? <li>无仍适用的反驳证据</li> : null}
              {request.opposing.map((item) => (
                <li key={item}>{item}</li>
              ))}
              {request.gaps.map((item) => (
                <li key={item}>缺口：{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div>风险：{request.risk}</div>
            <div>Policy：{request.policy}</div>
            <div>残余问题：{request.residualIssues.join("；")}</div>
            <div>Recovery Strategy：{request.recoveryStrategy.join("；")}</div>
          </div>
        </section>

        <section className="stack" style={{ marginTop: 20 }}>
          <button type="button" className="button" onClick={onApprove} data-testid="decision-approve">
            批准 · {request.consequences.approve}
          </button>
          <button type="button" className="button-secondary" onClick={onRequestChanges}>
            请求修改 · {request.consequences.requestChanges}
          </button>
          <button type="button" className="button-danger" onClick={onReject}>
            拒绝 · {request.consequences.reject}
          </button>
        </section>
      </aside>
    </div>
  );
}
