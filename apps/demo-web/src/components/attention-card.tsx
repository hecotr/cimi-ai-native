import { ArrowRight } from "lucide-react";
import type { AttentionItem } from "../demo/types";

const KIND_LABEL = {
  create: "New Change",
  decision: "Decision",
  blocker: "Blocker",
  run: "Active Run",
  other: "Ready"
} as const;

export function AttentionCard({
  item,
  primary,
  actionLabel,
  onAction
}: {
  item: AttentionItem;
  primary?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <article
      className={`attention-card ${primary ? "primary" : ""}`}
      data-testid="attention-item"
      data-kind={item.kind}
      data-change={item.displayKey}
    >
      <div className="row space-between">
        <span className={`badge ${item.kind === "blocker" ? "badge-risk" : item.kind === "decision" ? "badge-warn" : item.kind === "create" ? "badge-info" : "badge-neutral"}`}>
          {KIND_LABEL[item.kind]}
        </span>
        <span className="mono tiny">{item.displayKey}</span>
      </div>
      <strong>{item.title}</strong>
      <p className="muted" style={{ margin: 0 }}>
        {item.reason}
      </p>
      <div className="tiny">责任角色：{item.role}</div>
      <div className="row space-between">
        <span>下一步：{item.nextAction}</span>
        {onAction ? (
          <button type="button" className={primary ? "button" : "button-secondary"} onClick={onAction}>
            {actionLabel ?? item.nextAction}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </article>
  );
}
