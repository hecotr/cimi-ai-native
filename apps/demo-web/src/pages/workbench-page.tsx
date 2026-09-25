import { useNavigate } from "react-router-dom";
import { AttentionCard } from "../components/attention-card";
import { RiskBadge, StatusBadge } from "../components/status-badge";
import { useDemo } from "../demo/context";
import { startCreate } from "../demo/commands";
import { ENVIRONMENTS, isMainChangeCreated, MAIN_CHANGE_ID, SCENE_META } from "../demo/scenario";

export function WorkbenchPage() {
  const { state, dispatch } = useDemo();
  const navigate = useNavigate();
  const created = isMainChangeCreated(state.scene);
  const activeChanges = state.changes.filter((change) => change.lifecycleState !== "DeliveryClosed").length;
  const awaiting = state.changes.filter((change) => change.flowCondition === "AwaitingDecision").length;
  const blocked = state.changes.filter((change) => change.flowCondition === "Blocked").length;
  const activeRuns = state.changes.filter((change) => change.flowCondition === "Active" && change.lifecycleState === "Executing").length;

  const openMain = () => {
    if (!created) {
      if (state.scene === "workbench") {
        dispatch(startCreate());
      }
      navigate("/changes/new");
      return;
    }
    navigate(SCENE_META[state.scene].path);
  };

  return (
    <div className="page" data-testid="workbench-page">
      <div className="page-header row space-between">
        <div>
          <div className="tiny">Project Workbench</div>
          <h1>从一次尚未成立的 Change 开始</h1>
          <p className="muted">这不是任务看板。先把订单导出诉求变成可追踪的 Change，再处理 Decision、Blocker 和 Active Run。</p>
        </div>
        <button type="button" className="button" onClick={openMain}>
          {created ? "打开主 Change" : "创建 Change"}
        </button>
      </div>

      <section className="summary-grid" aria-label="项目摘要">
        <article className="card">
          <div className="tiny">Active Changes</div>
          <div className="stat-value">{activeChanges}</div>
        </article>
        <article className="card">
          <div className="tiny">Awaiting Decisions</div>
          <div className="stat-value">{awaiting}</div>
        </article>
        <article className="card">
          <div className="tiny">Blocked</div>
          <div className="stat-value">{blocked}</div>
        </article>
        <article className="card">
          <div className="tiny">Active Runs</div>
          <div className="stat-value">{activeRuns}</div>
        </article>
      </section>

      <section className="card-grid">
        <div className="card">
          <h2>Attention Queue</h2>
          <div className="stack" data-testid="attention-queue">
            {state.attention.map((item, index) => (
              <AttentionCard
                key={item.id}
                item={item}
                primary={index === 0}
                actionLabel={item.changeId === MAIN_CHANGE_ID ? state.currentFocus.primaryAction : "查看"}
                onAction={() => {
                  if (item.changeId === MAIN_CHANGE_ID) {
                    openMain();
                    return;
                  }
                  navigate(`/changes/${item.changeId}`);
                }}
              />
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Decision Inbox</h2>
          <div className="stack" data-testid="decision-inbox">
            {state.inbox.map((item) => (
              <article key={item.id} className="decision-item">
                <div className="row space-between">
                  <span className="mono">{item.id}</span>
                  <span className="badge badge-warn">{item.expired ? "Expired" : "Pending"}</span>
                </div>
                <strong>{item.title}</strong>
                <div className="muted">{item.question}</div>
                <div className="tiny">
                  {item.objectType} <span className="mono">{item.objectVersion}</span>
                  {item.artifactDigest ? (
                    <>
                      {" "}
                      · <span className="mono">{item.artifactDigest}</span>
                    </>
                  ) : null}
                  {item.environment ? (
                    <>
                      {" "}
                      · <span className="mono">{item.environment}</span>
                    </>
                  ) : null}
                </div>
                <div className="tiny">
                  Acting role {item.actingRole} · 过期 {item.expiresAt}
                </div>
                {item.changeId === MAIN_CHANGE_ID ? (
                  <button type="button" className="button" onClick={openMain}>
                    处理 {item.id}
                  </button>
                ) : (
                  <div className="tiny">本次演示不展开该 Decision。</div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Changes</h2>
        <div className="stack" data-testid="change-list">
          {state.changes.map((change) => (
            <article key={change.id} className="change-card">
              <div className="row space-between">
                <div>
                  <span className="mono">{change.displayKey}</span> {change.title}
                </div>
                <RiskBadge risk={change.risk} />
              </div>
              <div className="row">
                <StatusBadge lifecycle={change.lifecycleState} />
                <StatusBadge flow={change.flowCondition} />
                <span className="tiny">Owner {change.owner}</span>
                <span className="tiny">{change.profile}</span>
              </div>
              <div className="row space-between">
                <span>Next action：{change.nextAction}</span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    if (change.id === MAIN_CHANGE_ID) {
                      openMain();
                      return;
                    }
                    navigate(`/changes/${change.id}`);
                  }}
                >
                  打开
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="split-grid">
        <article className="card">
          <h2>Active Runs</h2>
          {state.runs.length === 0 && state.mainChange.lifecycleState !== "Executing" ? (
            <p className="muted">主 Change 尚未进入执行。CHG-0238 仍有一条实验 Run。</p>
          ) : null}
          <div className="run-item">
            <div className="row space-between">
              <strong>CHG-0238 · 促销规则灰度实验</strong>
              <span className="badge badge-info">Running</span>
            </div>
            <div className="tiny">Executor · Context Pack CP-promo-exp-v1</div>
          </div>
          {state.runs[0] ? (
            <div className="run-item" style={{ marginTop: 10 }}>
              <div className="row space-between">
                <strong>
                  {MAIN_CHANGE_ID} · {state.runs[0].id}
                </strong>
                <span className="badge badge-info">{state.runs[0].status}</span>
              </div>
              <div className="tiny">{state.workItems[0]?.title}</div>
            </div>
          ) : null}
        </article>
        <article className="card">
          <h2>Environments</h2>
          <div className="stack">
            {ENVIRONMENTS.map((item) => (
              <div key={item.id} className="env-item">
                <div className="mono">{item.id}</div>
                <div>{item.purpose}</div>
                <div className="tiny">{item.occupancy}</div>
                <span className="badge badge-neutral">{item.status}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
