import { Tag } from "antd";
import type { ContractBody, PlanBody } from "../../api/types";
import { PURPOSE } from "../../lib/labels";

export function ContractView({ body, hideGoal = false }: { body: ContractBody; hideGoal?: boolean }) {
  return (
    <div className="doc">
      {!hideGoal && <p className="doc__goal">{body.goal}</p>}
      <p className="doc__scope">{body.scope}</p>
      {(body.non_goals.length > 0 || body.constraints.length > 0) && (
        <div className="doc__cols">
          {body.non_goals.length > 0 && <div><h5>不做</h5><ul>{body.non_goals.map(item => <li key={item}>{item}</li>)}</ul></div>}
          {body.constraints.length > 0 && <div><h5>约束</h5><ul>{body.constraints.map(item => <li key={item}>{item}</li>)}</ul></div>}
        </div>
      )}
      <h5>验收标准</h5>
      <ol className="criteria">
        {body.acceptance_criteria.map(item => (
          <li key={item.key}>
            <span className="mono criteria__key">{item.key}</span>
            <div className="criteria__body">
              <div><span className="criteria__label">当</span>{item.scenario}</div>
              <div><span className="criteria__label">应</span>{item.expected}</div>
              <div className="chips">{item.evidence_requirements.map(evidence => <Tag key={evidence} bordered={false}>{evidence}</Tag>)}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="doc__risk">
        <Tag color={body.risk.level === "high" ? "red" : "default"} bordered={false}>{body.risk.level === "high" ? "高风险" : "普通风险"}</Tag>
        <span>{body.risk.rationale}</span>
      </div>
      {body.unresolved_questions.length > 0 && <><h5>仍未明确</h5><ul>{body.unresolved_questions.map(item => <li key={item}>{item}</li>)}</ul></>}
    </div>
  );
}

export function PlanView({ body }: { body: PlanBody }) {
  const ids = new Map(body.task_definitions.map((task, index) => [task.task_id, `T${index + 1}`]));
  return (
    <div className="doc">
      <p className="doc__scope">{body.approach}</p>
      <h5>任务</h5>
      <ol className="plan-tasks">
        {body.task_definitions.map((task, index) => (
          <li key={task.task_id} className={`plan-task purpose-${task.purpose}`}>
            <div className="plan-task__head">
              <span className="mono">T{index + 1}</span>
              <Tag bordered={false} color={task.purpose === "verification" ? "cyan" : "geekblue"}>{PURPOSE[task.purpose]}</Tag>
              {task.dependencies.length > 0 && <span className="muted small">依赖 {task.dependencies.map(id => ids.get(id) ?? "?").join("、")}</span>}
            </div>
            <div className="plan-task__goal">{task.goal}</div>
            <div className="plan-task__meta">
              <span>产出：{task.outputs.join("；")}</span>
              {task.allowed_changes.length > 0 && <span>可修改：<span className="mono">{task.allowed_changes.join("  ")}</span></span>}
              <span>验证：{task.verification.method}</span>
            </div>
          </li>
        ))}
      </ol>
      <h5>验证策略</h5>
      <p>{body.verification_strategy.description}</p>
    </div>
  );
}
