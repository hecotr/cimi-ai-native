import { CheckCircleFilled, CloseCircleFilled, FileTextOutlined, FlagOutlined } from "@ant-design/icons";
import { Button, Form, Input, Radio, Tag } from "antd";
import { Link } from "react-router";
import { useDashboard, useRunResult } from "../../api/hooks";
import type { ChangeDetail, Run, Task } from "../../api/types";
import { Empty } from "../../components/States";
import { uuid7 } from "../../lib/ids";
import { GATE, PURPOSE, TASK_STATUS } from "../../lib/labels";
import { useChangeWrite } from "./useChangeWrite";

// Helper endpoints from the backend B0 report (API contract §2.5).
export const VERIFY_API = {
  evaluate: (taskId: string) => `/api/tasks/${taskId}/evaluations`,
  satisfy: (taskId: string) => `/api/tasks/${taskId}/satisfy`,
  deliver: (changeId: string) => `/api/changes/${changeId}/ready-for-delivery`
};

type Result = "supports" | "refutes" | "inconclusive";

export function VerifyPanel({ detail }: { detail: ChangeDetail }) {
  const { intent, execution, runs, verification } = detail, change = intent.change;
  const write = useChangeWrite(change);
  const contract = intent.contract_versions.find(item => item.id === change.contract_ref?.id);
  const definitions = new Map(execution.definitions.map(item => [item.id, item.body]));
  const tasks = execution.tasks.filter(task => task.status !== "Cancelled");
  const allSatisfied = tasks.length > 0 && tasks.every(task => task.status === "Satisfied");
  // Every evaluation and the delivery check refer to the implementation result being judged.
  const sourceRun = [...runs.runs].filter(run => run.status === "Succeeded").sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const [deliverForm] = Form.useForm<{ reason: string }>();
  // Solo mode: with a single Human, the Kernel lets the implementer verify; say so instead of implying independence.
  const solo = (useDashboard().data?.governance.actors.filter(actor => actor.actor_type === "human").length ?? 0) === 1;

  if (!tasks.length || !contract) return <Empty title="还没有可以验证的结果">Agent 完成实施后，在这里核对修改、检查结果，并逐条对照验收标准记录评价。</Empty>;

  return (
    <div className="panel-grid">
      <div className="panel-main">
        {change.lifecycle_state === "ReadyForDelivery" ? (
          <section className="launch launch--done">
            <div className="launch__text"><div className="eyebrow">验证完成</div><h3>可以交付</h3><p>全部任务已满足，集成评价已通过。</p></div>
            <CheckCircleFilled className="launch__icon" />
          </section>
        ) : allSatisfied && (
          <section className="launch">
            <div className="launch__text"><div className="eyebrow">全部任务已满足</div><h3>评价集成，标记为可交付</h3><p>对照约定的验收标准做最后一次集成评价。</p></div>
            <Form form={deliverForm} layout="inline" requiredMark={false} className="launch__form" initialValues={{ reason: "全部任务已满足，验收标准均有证据支持" }}
              onFinish={values => write.send(VERIFY_API.deliver(change.id), { command_id: uuid7(), run_id: sourceRun!.id, reason: values.reason.trim() }, "标记可交付")}>
              <Form.Item name="reason" rules={[{ required: true, whitespace: true }]}><Input style={{ width: 280 }} /></Form.Item>
              <Button type="primary" htmlType="submit" icon={<FlagOutlined />} loading={write.busy} disabled={!sourceRun}>标记可交付</Button>
            </Form>
          </section>
        )}
        {tasks.map(task => {
          const definition = definitions.get(task.definition_ref.id);
          const taskRuns = runs.runs.filter(run => run.task_id === task.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
          const evaluations = verification.evaluations.filter(item => "task_id" in item && item.task_id === task.id);
          const waiting = execution.readiness.find(item => item.task_id === task.id)?.reasons.some(reason => reason.includes("任务依赖")) ?? false;
          return (
            <section key={task.id} className="surface surface--pad verify-task">
              <div className="block-head">
                <div>
                  <div className="eyebrow">{PURPOSE[definition?.purpose ?? ""]} · {TASK_STATUS[task.status]}
                    {solo && definition?.purpose === "verification" && <Tag bordered={false} color="orange" style={{ marginLeft: 10 }}>单人模式 · 非独立验证</Tag>}</div>
                  <h3 className="block-title">{definition?.goal}</h3>
                </div>
              </div>
              {taskRuns[0] && <RunOutcome run={taskRuns[0]} />}
              {evaluations.map(item => (
                <div key={item.id} className="evaluation-line">
                  <Tag bordered={false} color={item.outcome === "ALLOW" ? "green" : item.outcome === "DENY" ? "red" : "orange"}>{GATE[item.outcome]}</Tag>
                  <span>{item.purpose === "independent" ? solo ? "验证评价（单人模式 · 非独立）" : "独立评价" : "自检"}</span>
                  {item.reasons.length > 0 && <span className="muted">{item.reasons.join("；")}</span>}
                </div>
              ))}
              {task.status !== "Satisfied" && waiting && <p className="muted">前置任务满足后，再在这里验证。</p>}
              {task.status !== "Satisfied" && sourceRun && !waiting && (
                <EvaluationForm task={task} runId={sourceRun.id} detail={detail}
                  keys={contract.body.acceptance_criteria.filter(item => definition?.verification.acceptance_keys.includes(item.key) ?? true).map(item => ({ key: item.key, text: `${item.scenario} → ${item.expected}` }))}
                  allowed={[...evaluations].reverse().find(item => item.outcome === "ALLOW")?.id} />
              )}
              {task.status !== "Satisfied" && !sourceRun && <p className="muted">实施任务有一次成功的运行后，才能在这里评价。</p>}
            </section>
          );
        })}
      </div>
      <aside className="panel-side">
        <div className="side-note">
          <h4>{solo ? "单人模式的验证" : "独立评价"}</h4>
          <p>评价逐条对照约定的验收标准，结论只有“支持”“反驳”“无法判断”三种。</p>
          {solo ? <p>项目里只有你一个人，验证由你本人完成，记录中如实标注为非独立验证。邀请第二位成员后，验证将恢复为独立评价。</p>
            : <p>实施者的自检不能代替独立评价，验证须由另一位成员完成。</p>}
        </div>
      </aside>
    </div>
  );
}

function RunOutcome({ run }: { run: Run }) {
  const result = useRunResult(run.id, run.status !== "Running" && run.status !== "Reserved");
  const data = result.data;
  const added = data?.files.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const removed = data?.files.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
  return (
    <Link to={`/runs/${run.id}`} className="run-outcome">
      <FileTextOutlined className="run-outcome__icon" />
      <div className="run-outcome__main">
        <div><b>最近一次运行</b><span className="muted"> #{run.id.slice(-6)}</span></div>
        {data ? <div className="run-outcome__facts">
          <span>{data.files.length} 个文件</span><span className="diff-add">+{added}</span><span className="diff-del">−{removed}</span>
          {data.checks.map(check => <span key={check.name} className={`check-chip is-${check.status}`}>{check.status === "passed" ? <CheckCircleFilled /> : <CloseCircleFilled />} {check.name}</span>)}
        </div> : <div className="muted">{result.isError ? "结果暂不可读取" : "读取结果…"}</div>}
      </div>
      <span className="run-outcome__go">查看修改</span>
    </Link>
  );
}

function EvaluationForm({ task, runId, keys, allowed, detail }: { task: Task; runId: string; keys: { key: string; text: string }[]; allowed?: string; detail: ChangeDetail }) {
  const write = useChangeWrite(detail.intent.change);
  const [form] = Form.useForm<{ results: Record<string, Result>; observations: Record<string, string>; overall: Result; summary: string }>();
  return (
    <div className="evaluation">
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ overall: "supports", results: Object.fromEntries(keys.map(item => [item.key, "supports"])) }}
        onFinish={values => write.send(VERIFY_API.evaluate(task.id), {
          command_id: uuid7(), run_id: runId,
          assessment: { result: values.overall, observation: values.summary.trim() },
          acceptance: keys.map(item => ({ key: item.key, result: values.results[item.key], observation: values.observations?.[item.key]?.trim() || "已核对" }))
        }, "记录评价")}>
        <div className="assessment">
          <div className="assessment__head"><span className="mono">总体</span><span>目标、产出、约束与安全集成</span></div>
          <div className="assessment__row">
            <Form.Item name="overall" noStyle>
              <Radio.Group optionType="button" size="small" options={[{ value: "supports", label: "支持" }, { value: "refutes", label: "反驳" }, { value: "inconclusive", label: "无法判断" }]} />
            </Form.Item>
            <Form.Item name="summary" noStyle rules={[{ required: true, whitespace: true, message: "写下总体观察" }]}><Input placeholder="你实际核对了什么（必填）" /></Form.Item>
          </div>
        </div>
        {keys.map(item => (
          <div key={item.key} className="assessment">
            <div className="assessment__head"><span className="mono">{item.key}</span><span>{item.text}</span></div>
            <div className="assessment__row">
              <Form.Item name={["results", item.key]} noStyle>
                <Radio.Group optionType="button" size="small" options={[{ value: "supports", label: "支持" }, { value: "refutes", label: "反驳" }, { value: "inconclusive", label: "无法判断" }]} />
              </Form.Item>
              <Form.Item name={["observations", item.key]} noStyle><Input placeholder="观察到了什么" /></Form.Item>
            </div>
          </div>
        ))}
        <div className="evaluation__actions">
          <Button htmlType="submit" type={allowed ? "default" : "primary"} loading={write.busy}>记录评价</Button>
          {allowed && <Button type="primary" loading={write.busy} onClick={() => write.send(VERIFY_API.satisfy(task.id), { command_id: uuid7(), evaluation_id: allowed }, "标记任务已满足")}>标记任务已满足</Button>}
        </div>
      </Form>
    </div>
  );
}
