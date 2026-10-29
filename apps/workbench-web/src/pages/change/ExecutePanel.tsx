import { ArrowRightOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Button, Input, Modal, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useWorkbenchContext } from "../../api/hooks";
import type { ChangeDetail, Run, Task } from "../../api/types";
import { Empty } from "../../components/States";
import { uuid7 } from "../../lib/ids";
import { PURPOSE, RUN_STATUS, TASK_STATUS } from "../../lib/labels";
import { useChangeWrite } from "./useChangeWrite";

export function ExecutePanel({ detail }: { detail: ChangeDetail }) {
  const { intent, execution, runs } = detail, change = intent.change;
  const write = useChangeWrite(change);
  const definitions = new Map(execution.definitions.map(item => [item.id, item.body]));
  const order = intent.plan_versions.find(item => item.id === change.plan_ref?.id)?.body.task_definitions.map(item => item.task_id) ?? [];
  const tasks = [...execution.tasks].sort((a, b) => order.indexOf(definitions.get(a.definition_ref.id)?.task_id ?? "") - order.indexOf(definitions.get(b.definition_ref.id)?.task_id ?? ""));

  if (change.lifecycle_state !== "Executing" && !tasks.length) {
    return <Empty title="还没有开工">约定与计划确认、并在“计划”页开始实施后，任务会出现在这里。</Empty>;
  }
  if (!tasks.length) {
    return (
      <Empty title="任务尚未生成" action={<Button type="primary" loading={write.busy} onClick={() => write.command("InitializePlanTasks", { plan_ref: change.plan_ref }, "technical_owner", "初始化任务")}>按计划生成任务</Button>}>
        按已确认的计划生成任务，每个任务都可以交给 Agent 实施。
      </Empty>
    );
  }
  return (
    <div className="tasks">
      {tasks.map((task, index) => (
        <TaskCard key={task.id} index={index} task={task} detail={detail}
          definition={definitions.get(task.definition_ref.id)} runs={runs.runs.filter(run => run.task_id === task.id)} />
      ))}
    </div>
  );
}

function TaskCard({ task, index, definition, runs, detail }: {
  task: Task; index: number; definition?: ChangeDetail["execution"]["definitions"][number]["body"]; runs: Run[]; detail: ChangeDetail;
}) {
  const change = detail.intent.change;
  const write = useChangeWrite(change);
  const context = useWorkbenchContext().data!;
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const readiness = detail.execution.readiness.find(item => item.task_id === task.id);
  const live = runs.find(run => run.status === "Running" || run.status === "Reserved");
  const provider = context.runtime?.provider;
  const canRun = definition?.purpose === "implementation" && (task.status === "Pending" || task.status === "InProgress") && !live;
  const blocked = !provider ? "先在设置中配置模型连接" : !provider.credential_configured ? "模型凭据尚未配置" : undefined;
  const sortedRuns = [...runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  // The execution grant is created when a run starts, so its absence is not something the user must act on.
  const blockers = (readiness && !readiness.ready ? readiness.reasons : []).filter(reason => reason !== "WORK_ITEM_REQUIRED")
    .map(reason => reason.includes("任务依赖") ? "等前置任务满足后才能开始" : reason);

  const start = async () => {
    const result = await write.send<{ run_id: string }>(`/api/tasks/${task.id}/agent-runs`, { command_id: uuid7(), ...(instruction.trim() ? { instruction: instruction.trim() } : {}) }, "启动 Agent");
    if (result?.run_id) { setStarting(false); navigate(`/runs/${result.run_id}`); }
  };

  return (
    <article className={`task-card purpose-${definition?.purpose ?? "implementation"} status-${task.status}`}>
      <div className="task-card__rail"><span className="mono">T{index + 1}</span></div>
      <div className="task-card__body">
        <div className="task-card__head">
          <Tag bordered={false} color={definition?.purpose === "verification" ? "cyan" : "geekblue"}>{PURPOSE[definition?.purpose ?? ""] ?? "任务"}</Tag>
          <span className={`status-pill status-task-${task.status}`}>{TASK_STATUS[task.status]}</span>
          {live && <span className="live-pill"><span className="live-pill__dot" />Agent 运行中</span>}
        </div>
        <h3 className="task-card__goal">{definition?.goal ?? "任务"}</h3>
        {definition && (
          <div className="task-card__facts">
            <span>产出 · {definition.outputs.join("；")}</span>
            {definition.allowed_changes.length > 0 && <span>可修改 · <span className="mono">{definition.allowed_changes.join("  ")}</span></span>}
          </div>
        )}
        {blockers.length > 0 && task.status === "Pending" && <div className="task-card__blocked">{blockers.join("；")}</div>}
        {sortedRuns.length > 0 && (
          <ul className="run-list">
            {sortedRuns.map(run => (
              <li key={run.id}>
                <Link to={`/runs/${run.id}`} className={`run-row run-${run.status}`}>
                  <span className="run-row__dot" />
                  <span className="run-row__status">{RUN_STATUS[run.status]}</span>
                  <span className="muted">{dayjs(run.created_at).format("MM-DD HH:mm")}</span>
                  <span className="mono muted">#{run.id.slice(-6)}</span>
                  <ArrowRightOutlined className="run-row__go" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="task-card__actions">
        {live && <Button type="primary" className="btn-teal" onClick={() => navigate(`/runs/${live.id}`)}>查看实时进展</Button>}
        {canRun && (
          <Tooltip title={blocked}>
            <Button type={sortedRuns.length ? "default" : "primary"} icon={<ThunderboltOutlined />} disabled={!!blocked || write.blocked} onClick={() => setStarting(true)}>
              {sortedRuns.length ? "再运行一次" : "让 Agent 实施"}
            </Button>
          </Tooltip>
        )}
      </div>
      <Modal open={starting} title="让 Agent 实施这个任务" okText="开始运行" onCancel={() => setStarting(false)} onOk={start} confirmLoading={write.busy}>
        <p className="modal-lead">Agent 在独立分支上按约定与任务修改代码，结束时运行固定检查，你可以随时在控制台停止它。这次运行记在你名下，模型是你使用的工具。</p>
        <div className="modal-facts">
          <span>模型 <b className="mono">{provider?.model}</b></span>
          {context.runtime?.limits && <span>上限 <b>{context.runtime.limits.max_turns}</b> 轮 · <b>{(context.runtime.limits.max_tokens / 1000).toFixed(0)}k</b> tokens</span>}
        </div>
        <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="补充说明（可选）：例如先看哪个文件、需要注意的约定" value={instruction} onChange={event => setInstruction(event.target.value)} maxLength={4000} />
      </Modal>
    </article>
  );
}
