import { Timeline } from "antd";
import dayjs from "dayjs";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { useDashboard } from "../../api/hooks";
import type { ChangeDetail } from "../../api/types";
import { DecisionCard } from "../../components/DecisionCard";
import { DECISION_ACTION, DECISION_STATUS, LIFECYCLE, RUN_STATUS } from "../../lib/labels";

interface Entry { at: string; tone: "ink" | "amber" | "teal" | "green" | "red"; title: ReactNode; body?: ReactNode }

export function HistoryPanel({ detail }: { detail: ChangeDetail }) {
  const { intent, runs, verification } = detail, change = intent.change;
  const actors = useDashboard().data?.governance.actors ?? [];
  const who = (id: string) => actors.find(actor => actor.id === id)?.display_name ?? "系统";
  const open = intent.decision_requests.filter(item => item.status === "pending" || item.status === "approve");

  const entries: Entry[] = [
    { at: change.created_at, tone: "ink" as const, title: <>录入为{change.kind === "bug" ? "缺陷" : "需求"}</> },
    ...intent.contract_proposals.map(item => ({ at: item.created_at, tone: "ink" as const, title: `提交约定候选第 ${item.proposal_revision} 版`, body: item.body.goal })),
    ...intent.plan_proposals.map(item => ({ at: item.created_at, tone: "ink" as const, title: `提交计划候选第 ${item.proposal_revision} 版`, body: `${item.body.task_definitions.length} 个任务` })),
    ...intent.risk_assessments.map(item => ({ at: item.created_at, tone: "ink" as const, title: `${who(item.producer_actor_id)} 判断风险为${item.level === "high" ? "高风险" : "普通"}`, body: item.rationale })),
    ...intent.decision_requests.map(item => ({ at: item.request.created_at, tone: "amber" as const, title: `请求${DECISION_ACTION[item.request.action]}`, body: DECISION_STATUS[item.status] })),
    ...intent.decisions.map(item => ({ at: item.decided_at, tone: item.choice === "approve" ? "green" as const : "red" as const, title: `${who(item.actor_id)} ${DECISION_STATUS[item.choice]}`, body: item.reason })),
    ...intent.lifecycle_transitions.map(item => ({ at: item.created_at, tone: "ink" as const, title: <>进入「{LIFECYCLE[item.to_state]}」</>, body: item.reason })),
    ...runs.runs.map(run => ({ at: run.created_at, tone: "teal" as const, title: <>Agent 运行 <Link to={`/runs/${run.id}`} className="mono">#{run.id.slice(-6)}</Link> · {RUN_STATUS[run.status]}</> })),
    ...verification.evaluations.map(item => ({ at: item.created_at, tone: item.outcome === "ALLOW" ? "green" as const : "amber" as const, title: `${item.purpose === "safe_integration" ? "集成评价" : "任务评价"}：${item.outcome}`, body: item.reasons.join("；") || undefined }))
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="panel-grid">
      <div className="panel-main">
        {open.length > 0 && <div className="stack">{open.map(item => <DecisionCard key={item.request.id} change={change} intent={intent} item={item} />)}</div>}
        <section className="surface surface--pad">
          <h3 className="block-title">记录</h3>
          <Timeline className="history" items={entries.map(entry => ({
            color: { ink: "gray", amber: "orange", teal: "cyan", green: "green", red: "red" }[entry.tone],
            content: <div className="history__item"><div className="history__title">{entry.title}</div>{entry.body && <div className="history__body">{entry.body}</div>}<div className="history__at">{dayjs(entry.at).format("YYYY-MM-DD HH:mm")}</div></div>
          }))} />
        </section>
      </div>
      <aside className="panel-side">
        <div className="side-note"><h4>每一步都有记录</h4><p>谁在什么时候以什么角色做了什么决定，都保存在项目里，CLI 和工作台看到的是同一份事实。</p></div>
      </aside>
    </div>
  );
}
