import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Drawer, Form, Input, Space } from "antd";
import type { Change, ContractBody, PlanBody, TaskDefinition } from "../../api/types";
import { lines, uuid7 } from "../../lib/ids";

interface ImplementationTask { goal: string; outputs: string; allowed: string }
interface Values {
  approach: string; tasks: ImplementationTask[];
  verify_goal: string; verify_outputs: string; verify_method: string; verify_evidence: string;
}

export function PlanEditor({ open, onClose, onSubmit, busy, change, contract, initial }: {
  open: boolean; onClose: () => void; busy: boolean; change: Change; contract: ContractBody;
  onSubmit: (body: PlanBody) => Promise<boolean>; initial?: PlanBody;
}) {
  const [form] = Form.useForm<Values>();
  const keys = contract.acceptance_criteria.map(item => item.key);
  const evidence = [...new Set(contract.acceptance_criteria.flatMap(item => item.evidence_requirements))];
  const implementation = initial?.task_definitions.filter(task => task.purpose === "implementation") ?? [];
  const verification = initial?.task_definitions.find(task => task.purpose === "verification");
  const initialValues: Partial<Values> = {
    approach: initial?.approach,
    tasks: implementation.length ? implementation.map(task => ({ goal: task.goal, outputs: task.outputs.join("\n"), allowed: task.allowed_changes.join("\n") })) : [{ goal: "", outputs: "", allowed: "" }],
    verify_goal: verification?.goal ?? "独立核对实施结果满足全部验收标准",
    verify_outputs: verification?.outputs.join("\n") ?? "验收结论",
    verify_method: verification?.verification.method ?? initial?.verification_strategy.description,
    verify_evidence: (verification?.verification.evidence_requirements ?? evidence).join("\n")
  };

  const finish = async (values: Values) => {
    const scope = { kind: "change" as const, id: change.id };
    const base = { version: 1, scope, inputs: [], affected_targets: [], closure_requirement: "before_release" as const, knowledge_keys: [] };
    const tasks: TaskDefinition[] = values.tasks.map(task => ({
      ...base, task_id: uuid7(), purpose: "implementation", goal: task.goal.trim(), outputs: lines(task.outputs), dependencies: [], allowed_changes: lines(task.allowed),
      verification: { method: values.verify_method.trim(), mode: "self_check", acceptance_keys: keys, evidence_requirements: lines(values.verify_evidence) }
    }));
    tasks.push({
      ...base, task_id: uuid7(), purpose: "verification", goal: values.verify_goal.trim(), outputs: lines(values.verify_outputs),
      dependencies: tasks.map(task => task.task_id), allowed_changes: [],
      verification: { method: values.verify_method.trim(), mode: "independent", acceptance_keys: keys, evidence_requirements: lines(values.verify_evidence) }
    });
    const body: PlanBody = { contract_ref: change.contract_ref!, approach: values.approach.trim(), task_definitions: tasks, dependencies: [],
      verification_strategy: { description: values.verify_method.trim(), deferred_checks: [] } };
    if (await onSubmit(body)) form.resetFields();
  };

  return (
    <Drawer open={open} onClose={onClose} size={680} title="实施计划" destroyOnHidden
      extra={<Space><Button onClick={onClose}>取消</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>提交计划候选</Button></Space>}>
      <p className="drawer-lead">把约定拆成 Agent 能独立完成的实施任务，再加一个独立验证任务覆盖全部验收标准（{keys.join("、")}）。</p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initialValues} onFinish={finish}>
        <Form.Item name="approach" label="实施思路" rules={[{ required: true, whitespace: true }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={4000} placeholder="改哪里、为什么这样改" /></Form.Item>

        <div className="form-section">实施任务</div>
        <Form.List name="tasks">
          {(fields, { add, remove }) => <>
            {fields.map((field, index) => (
              <div key={field.key} className="criterion">
                <div className="criterion__head"><span className="mono criterion__key">T{index + 1}</span>
                  {fields.length > 1 && <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label="删除这个任务" />}
                </div>
                <Form.Item name={[field.name, "goal"]} label="任务目标" rules={[{ required: true, whitespace: true }]}><Input placeholder="Agent 要完成的一件具体的事" /></Form.Item>
                <div className="form-row">
                  <Form.Item name={[field.name, "outputs"]} label="产出" extra="每行一项" rules={[{ validator: async (_, value) => { if (!lines(value).length) throw new Error("至少一项产出"); } }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
                  <Form.Item name={[field.name, "allowed"]} label="允许修改" extra="每行一个路径或模式"><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} className="mono-input" placeholder="apps/workbench-web/src/**" /></Form.Item>
                </div>
              </div>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ goal: "", outputs: "", allowed: "" })}>添加实施任务</Button>
          </>}
        </Form.List>

        <div className="form-section">独立验证</div>
        <Form.Item name="verify_goal" label="验证目标" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="verify_method" label="验证方法" rules={[{ required: true, whitespace: true }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="运行哪些检查，人工核对哪些行为" /></Form.Item>
        <div className="form-row">
          <Form.Item name="verify_outputs" label="产出" extra="每行一项" rules={[{ validator: async (_, value) => { if (!lines(value).length) throw new Error("至少一项"); } }]}><Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} /></Form.Item>
          <Form.Item name="verify_evidence" label="需要的证据" extra="每行一项" rules={[{ validator: async (_, value) => { if (!lines(value).length) throw new Error("至少一项"); } }]}><Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} /></Form.Item>
        </div>
      </Form>
    </Drawer>
  );
}
