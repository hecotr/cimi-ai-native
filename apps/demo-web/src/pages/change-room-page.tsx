import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DecisionPanel } from "../components/decision-panel";
import { DeliveryPanel } from "../components/delivery-panel";
import { EvidenceMatrix } from "../components/evidence-matrix";
import { LifecycleStrip } from "../components/lifecycle-strip";
import { LifecycleTimeline } from "../components/lifecycle-timeline";
import { RunDetailDrawer } from "../components/run-detail-drawer";
import { RunSummary } from "../components/run-summary";
import { RiskBadge, StatusBadge } from "../components/status-badge";
import { useDemo } from "../demo/context";
import {
  approveContract,
  approveRelease,
  completeAgentRun,
  completeDeployment,
  completeRepair,
  startClarification,
  startRepair,
  submitRelease
} from "../demo/commands";
import { ARTIFACT_DIGEST, ARTIFACT_ID, findChange, isMainChangeCreated, MAIN_CHANGE_ID, PROD_ENV } from "../demo/scenario";
import type { AgentRunRecord, ChangeRoomTab, DemoCommand } from "../demo/types";

const TABS: { id: ChangeRoomTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contract", label: "Contract" },
  { id: "plan", label: "Plan & Work" },
  { id: "evidence", label: "Evidence" },
  { id: "delivery", label: "Delivery" },
  { id: "activity", label: "Activity" }
];

const RUN_DELAY_MS = 1200;

export function ChangeRoomPage() {
  const { changeId = "" } = useParams();
  const { state, dispatch } = useDemo();

  if (changeId !== MAIN_CHANGE_ID) {
    return <SatelliteChangeRoom changeId={changeId} />;
  }
  if (!isMainChangeCreated(state.scene)) {
    return <PendingCreateRoom />;
  }
  return <MainChangeRoom dispatch={dispatch} />;
}

function MainChangeRoom({ dispatch }: { dispatch: (command: DemoCommand) => { rejection: string | null } }) {
  const { state } = useDemo();
  const [tab, setTab] = useState<ChangeRoomTab>(state.preferredTab);
  const [decisionOpen, setDecisionOpen] = useState(state.openDecision);
  const [runOpen, setRunOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<AgentRunRecord | null>(null);
  const [simulating, setSimulating] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setTab(state.preferredTab);
    setDecisionOpen(state.openDecision);
    setSimulating(false);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [state.scene, state.revision, state.preferredTab, state.openDecision]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const latestRun = state.runs[state.runs.length - 1];
  const latestWork = state.workItems[state.workItems.length - 1];

  const runLater = (command: DemoCommand) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    setSimulating(true);
    timerRef.current = window.setTimeout(() => {
      dispatch(command);
      setSimulating(false);
      timerRef.current = null;
    }, RUN_DELAY_MS);
  };

  const runPrimary = () => {
    const command = state.currentFocus.primaryCommand;
    if (command === "START_CLARIFICATION") {
      dispatch(startClarification());
      return;
    }
    if (command === "APPROVE_CONTRACT" || command === "APPROVE_RELEASE") {
      setDecisionOpen(true);
      return;
    }
    if (command === "COMPLETE_AGENT_RUN") {
      runLater(completeAgentRun());
      return;
    }
    if (command === "START_REPAIR") {
      dispatch(startRepair());
      return;
    }
    if (command === "COMPLETE_REPAIR") {
      runLater(completeRepair());
      return;
    }
    if (command === "SUBMIT_RELEASE") {
      dispatch(submitRelease());
      setTab("delivery");
      return;
    }
    if (command === "COMPLETE_DEPLOYMENT") {
      runLater(completeDeployment());
      return;
    }
    if (command === "VIEW_TIMELINE") {
      setTab("activity");
    }
  };

  const openRun = (runId: string) => {
    setSelectedRun(state.runs.find((run) => run.id === runId) ?? latestRun ?? null);
    setRunOpen(true);
  };

  return (
    <div className="page" data-testid="change-room">
      <section className="card identity-head">
        <div className="tiny">Change Room</div>
        <h1>
          {state.mainChange.displayKey} {state.mainChange.title}
        </h1>
        <div className="row">
          <span className="badge badge-neutral">{state.mainChange.profile}</span>
          <span className="tiny">Change Owner {state.roles.changeOwner}</span>
          <span className="tiny">Intent Owner {state.roles.intentOwner}</span>
          <span className="tiny">Technical Owner {state.roles.technicalOwner}</span>
          <span className="tiny">Release Owner {state.roles.releaseOwner}</span>
        </div>
        <div className="row">
          <StatusBadge lifecycle={state.mainChange.lifecycleState} />
          <StatusBadge flow={state.mainChange.flowCondition} />
          <span className="badge badge-neutral">delivery {deliveryLabel(state)}</span>
          <span className="badge badge-neutral">outcome {outcomeLabel(state)}</span>
          <RiskBadge risk={`${state.mainChange.risk}，${state.mainChange.riskDetail}`} />
        </div>
        <div className="tiny">
          Contract <span className="mono">{state.contract.version}</span> · Plan <span className="mono">{state.plan.version}</span>
          {state.artifact ? (
            <>
              {" "}
              · Artifact <span className="mono">{state.artifact.digest}</span>
            </>
          ) : (
            " · Artifact 尚未固定"
          )}
          {" · "}
          最后更新 {state.lastUpdatedAt}
        </div>
        <LifecycleStrip currentStage={state.lifecycleStage} />
      </section>

      <section className="focus-card" data-testid="current-focus">
        <div className="focus-grid">
          <div>
            <h2>Current Focus</h2>
            <p>
              <strong>现在发生什么：</strong>
              {state.currentFocus.happening}
            </p>
            <p>
              <strong>为什么停在这里：</strong>
              {state.currentFocus.whyHere}
            </p>
            <p>
              <strong>已满足：</strong>
              {state.currentFocus.satisfiedGates.join("；")}
            </p>
            <p>
              <strong>还缺少：</strong>
              {state.currentFocus.missing.length ? state.currentFocus.missing.join("；") : "无"}
            </p>
            <p>
              <strong>下一状态：</strong>
              {state.currentFocus.nextState}
            </p>
          </div>
          <div className="stack">
            <div className="tiny">Gate {state.gateVerdict}</div>
            <button type="button" className="button" onClick={runPrimary} disabled={simulating} data-testid="primary-action">
              {simulating ? "模拟执行中…" : state.currentFocus.primaryAction}
            </button>
            {state.decisionRequest ? (
              <button type="button" className="button-secondary" onClick={() => setDecisionOpen(true)}>
                打开 Decision {state.decisionRequest.id}
              </button>
            ) : null}
            <div className="tiny">当前用户可执行的唯一主动作。危险操作不会使用模糊的“确定”。</div>
          </div>
        </div>
      </section>

      <div className="tabs" role="tablist" aria-label="Change Room 详情">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <section className="split-grid">
          <article className="card">
            <h3>责任与风险</h3>
            <p>Change Owner {state.roles.changeOwner} 对闭环负责。周航当前以 {state.actingRole} 行动。</p>
            <p>风险：{state.mainChange.riskDetail}。Policy 要求权限与敏感字段必须有独立证据。</p>
          </article>
          <article className="card">
            <h3>下一步</h3>
            <p>{state.mainChange.nextAction}</p>
            <p className="muted">宏观 Change 状态与局部 Run 状态分开，避免一次测试失败看起来像整个 Change 在跳动。</p>
          </article>
        </section>
      ) : null}

      {tab === "contract" ? (
        <section className="card">
          {state.contract.status === "None" ? (
            <>
              <h3>Contract 尚未形成</h3>
              <p>Draft Change 只记录了原始诉求。澄清后才会出现可审阅的 Contract Candidate。</p>
              <p className="muted">{state.draftChange?.request ?? "管理员需要异步导出十万条订单。"}</p>
            </>
          ) : (
            <>
              <h3>
                Contract <span className="mono">{state.contract.version}</span> · {state.contract.status}
              </h3>
              <p>
                <strong>目标：</strong>
                {state.contract.goal}
              </p>
              <p>
                <strong>范围：</strong>
                {state.contract.scope.join("、")}
              </p>
              <p>
                <strong>Non-goals：</strong>
                {state.contract.nonGoals.join("、")}
              </p>
              <h4>验收条件</h4>
              <ul>
                {state.contract.acceptanceCriteria.map((item) => (
                  <li key={item.id}>
                    <span className="mono">{item.id}</span> {item.text}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

      {tab === "plan" ? (
        <section className="stack">
          <article className="card">
            <h3>
              Plan <span className="mono">{state.plan.version}</span> · {state.plan.status}
            </h3>
            <div className="dag">
              {state.plan.tasks.map((task) => (
                <div key={task.id} className="dag-node">
                  <div className="mono">{task.id}</div>
                  <div>{task.title}</div>
                  <div className="tiny">{task.status}</div>
                </div>
              ))}
            </div>
          </article>
          <RunSummary workItem={latestWork} run={latestRun} running={simulating} onOpenDetail={() => latestRun && openRun(latestRun.id)} />
        </section>
      ) : null}

      {tab === "evidence" ? (
        <section className="card">
          <h3>Evidence 按 Claim 组织</h3>
          <p className="muted">Gate 还缺什么，必须比通过项更显眼。实现完成不等于契约已被证明。</p>
          <EvidenceMatrix claims={state.claims} evidence={state.evidence} acceptance={state.contract.acceptanceCriteria} />
        </section>
      ) : null}

      {tab === "delivery" ? (
        <DeliveryPanel artifact={state.artifact} release={state.release} deployment={state.deployment} />
      ) : null}

      {tab === "activity" ? (
        <section className="card">
          <h3>生命周期时间线</h3>
          <p className="muted">默认只看对业务闭环有意义的事件。点击 Run 才进入技术明细。</p>
          <LifecycleTimeline events={state.timeline} onOpenRun={openRun} />
        </section>
      ) : null}

      <DecisionPanel
        request={state.decisionRequest}
        open={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        onApprove={() => {
          if (state.decisionRequest?.objectType === "Contract") {
            dispatch(approveContract());
          } else {
            dispatch(
              approveRelease({
                artifactDigest: ARTIFACT_DIGEST,
                artifactId: ARTIFACT_ID,
                environment: PROD_ENV
              })
            );
          }
          setDecisionOpen(false);
        }}
        onRequestChanges={() => {
          dispatch(state.decisionRequest?.objectType === "Contract" ? { type: "REQUEST_CONTRACT_CHANGES" } : { type: "REQUEST_RELEASE_CHANGES" });
          setDecisionOpen(false);
        }}
        onReject={() => {
          dispatch(state.decisionRequest?.objectType === "Contract" ? { type: "REJECT_CONTRACT" } : { type: "REJECT_RELEASE" });
          setDecisionOpen(false);
        }}
      />
      <RunDetailDrawer run={selectedRun} open={runOpen} onClose={() => setRunOpen(false)} />
    </div>
  );
}

function deliveryLabel(state: { scene: string }): string {
  if (state.scene === "delivery_closed") {
    return "Closed";
  }
  if (state.scene === "release_decision") {
    return "TestVerified";
  }
  if (state.scene === "repair_verified") {
    return "TestVerified";
  }
  if (state.scene === "evaluation_failed" || state.scene === "agent_running") {
    return "Implemented";
  }
  return "NotStarted";
}

function outcomeLabel(state: { scene: string }): string {
  return state.scene === "delivery_closed" ? "Observed" : "Unknown";
}

function PendingCreateRoom() {
  return (
    <div className="page">
      <div className="card empty-state">
        <p>CHG-0242 还没有创建。主路径从创建 Draft Change 开始。</p>
        <Link className="button" to="/changes/new">
          去创建
        </Link>
      </div>
    </div>
  );
}

function SatelliteChangeRoom({ changeId }: { changeId: string }) {
  const { state } = useDemo();
  const change = useMemo(() => findChange(state, changeId), [state, changeId]);
  if (!change) {
    return (
      <div className="page">
        <div className="card empty-state">找不到该 Change。</div>
      </div>
    );
  }
  return (
    <div className="page">
      <section className="card">
        <h1>
          {change.displayKey} {change.title}
        </h1>
        <div className="row">
          <StatusBadge lifecycle={change.lifecycleState} />
          <StatusBadge flow={change.flowCondition} />
          <RiskBadge risk={change.risk} />
        </div>
        <p>Owner {change.owner}。这是演示中的背景 Change，不进入订单导出主路径。</p>
        <p>Next action：{change.nextAction}</p>
        <Link className="button-secondary" to="/">
          返回 Workbench
        </Link>
      </section>
    </div>
  );
}
