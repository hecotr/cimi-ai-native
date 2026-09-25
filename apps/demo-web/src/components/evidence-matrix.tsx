import { ClaimBadge } from "./status-badge";
import type { ClaimRecord, EvidenceRecord } from "../demo/types";

export function EvidenceMatrix({
  claims,
  evidence,
  acceptance
}: {
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  acceptance: { id: string; text: string }[];
}) {
  const ordered = [...claims].sort((left, right) => {
    const weight = (status: ClaimRecord["status"]) =>
      status === "Insufficient" || status === "Conflicted" || status === "Refuted" ? 0 : status === "Pending" ? 1 : 2;
    return weight(left.status) - weight(right.status);
  });

  return (
    <div className="stack" data-testid="evidence-matrix">
      {ordered.map((claim) => {
        const criterion = acceptance.find((item) => item.id === claim.acceptanceCriterionId);
        const related = evidence.filter((item) => item.claimId === claim.id);
        const priority = claim.id === "CLM-02" && claim.status === "Insufficient";
        return (
          <article
            key={claim.id}
            className={`claim-card ${priority ? "priority" : ""}`}
            data-testid={`claim-${claim.id}`}
            data-status={claim.status}
          >
            <div className="row space-between">
              <strong>
                {claim.id} {claim.title}
              </strong>
              <ClaimBadge status={claim.status} />
            </div>
            <div className="muted">
              {criterion?.id} {criterion?.text}
            </div>
            {claim.gap ? (
              <p>
                <strong>缺口：</strong>
                {claim.gap}
              </p>
            ) : null}
            {claim.consequence ? (
              <p>
                <strong>后果：</strong>
                {claim.consequence}
              </p>
            ) : null}
            {priority ? (
              <div data-testid="clm-02-gap">
                普通用户不能导出订单
                <br />
                状态：Insufficient
                <br />
                缺口：没有独立的权限反例测试
                <br />
                后果：Evaluation Gate = NEED_MORE_EVIDENCE
              </div>
            ) : null}
            <ul className="evidence-list">
              {related.length === 0 ? <li className="tiny">尚无适用 Evidence</li> : null}
              {related.map((item) => (
                <li key={item.id}>
                  <span className={`badge ${item.polarity === "Supports" ? "badge-trust" : item.polarity === "Refutes" ? "badge-risk" : "badge-warn"}`}>
                    {item.polarity}
                  </span>{" "}
                  <span className="mono">{item.id}</span> {item.title}
                  <div className="tiny">
                    {item.contractVersion}
                    {item.artifactDigest ? ` · ${item.artifactDigest}` : ""}
                    {item.environment ? ` · ${item.environment}` : ""} · {item.observedAt}
                  </div>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
