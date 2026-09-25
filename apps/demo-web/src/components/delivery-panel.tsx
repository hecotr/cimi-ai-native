import { ARTIFACT_DIGEST, ARTIFACT_ID, PROD_ENV } from "../demo/scenario";
import type { ArtifactRecord, DeploymentRecord, ReleaseRecord } from "../demo/types";

export function DeliveryPanel({
  artifact,
  release,
  deployment
}: {
  artifact: ArtifactRecord | null;
  release: ReleaseRecord;
  deployment: DeploymentRecord | null;
}) {
  return (
    <div className="delivery-grid" data-testid="delivery-panel">
      <section className="card">
        <h3>Artifact</h3>
        {artifact ? (
          <>
            <div>
              来源：<span className="mono">{artifact.source}</span>
            </div>
            <div>
              Artifact：<span className="mono">{artifact.id}</span>
            </div>
            <div>
              Digest：<span className="mono">{artifact.digest}</span>
            </div>
            <div>构建：{artifact.buildStatus}</div>
            <div>评价：{artifact.evaluationStatus}</div>
          </>
        ) : (
          <p className="muted">尚未形成不可变 Artifact Candidate。</p>
        )}
      </section>
      <section className="card" data-testid="release-card">
        <h3>Release</h3>
        <div>
          目标环境：<span className="mono">{release.environment || PROD_ENV}</span>
        </div>
        <div>范围：{release.scope}</div>
        <div>窗口：{release.window}</div>
        <div>批准状态：{release.approvalStatus}</div>
        <div>
          绑定 Artifact：<span className="mono">{release.artifactId || ARTIFACT_ID}</span>
        </div>
        <div>
          绑定 Digest：<span className="mono">{release.artifactDigest || ARTIFACT_DIGEST}</span>
        </div>
        <div>Recovery Strategy：{release.recoveryStrategy.join("；")}</div>
      </section>
      <section className="card" data-testid="deployment-card">
        <h3>Deployment</h3>
        {deployment ? (
          <>
            <div className="mono">{deployment.id}</div>
            <div>外部状态：{deployment.externalStatus}</div>
            <div>Digest matched：{deployment.digestMatched ? "yes" : "pending"}</div>
            <div>Health check passed：{deployment.healthCheckPassed ? "yes" : "pending"}</div>
            <div>Core path passed：{deployment.corePathPassed ? "yes" : "pending"}</div>
          </>
        ) : (
          <p className="muted">尚未对生产发起实际部署尝试。</p>
        )}
      </section>
      <section className="card">
        <h3>Recovery / Reconciliation</h3>
        <p>结果未知时先核对，不直接重试。</p>
        <ul>
          <li>Rollback：回到上一稳定 Digest</li>
          <li>Feature Disable：关闭导出入口</li>
          <li>Roll-forward：仅允许新的已评价 Artifact</li>
        </ul>
      </section>
    </div>
  );
}
