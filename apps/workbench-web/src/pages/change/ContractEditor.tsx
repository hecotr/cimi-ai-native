import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Checkbox, Drawer, Form, Input, Radio, Space } from "antd";
import type { ContractBody } from "../../api/types";
import { lines } from "../../lib/ids";

interface Criterion { scenario: string; expected: string; evidence: string }
interface Values {
  goal: string; scope: string; non_goals?: string; constraints?: string; criteria: Criterion[];
  risk: "ordinary" | "high"; impact: ContractBody["risk"]["impact_categories"]; rationale: string; questions?: string;
}

const join = (items?: string[]) => (items ?? []).join("\n");

export function ContractEditor({ open, onClose, onSubmit, busy, initial }: {
  open: boolean; onClose: () => void; busy: boolean; onSubmit: (body: ContractBody) => Promise<boolean>; initial?: Partial<ContractBody>;
}) {
  const [form] = Form.useForm<Values>();
  const initialValues: Partial<Values> = {
    goal: initial?.goal, scope: initial?.scope, non_goals: join(initial?.non_goals), constraints: join(initial?.constraints),
    criteria: initial?.acceptance_criteria?.map(item => ({ scenario: item.scenario, expected: item.expected, evidence: join(item.evidence_requirements) })) ?? [{ scenario: "", expected: "", evidence: "" }],
    risk: initial?.risk?.level ?? "ordinary", impact: initial?.risk?.impact_categories ?? ["other"], rationale: initial?.risk?.rationale, questions: join(initial?.unresolved_questions)
  };

  const finish = async (values: Values) => {
    const body: ContractBody = {
      goal: values.goal.trim(), scope: values.scope.trim(), non_goals: lines(values.non_goals), constraints: lines(values.constraints),
      acceptance_criteria: values.criteria.map((item, index) => ({ key: `A${index + 1}`, scenario: item.scenario.trim(), expected: item.expected.trim(), evidence_requirements: lines(item.evidence) })),
      delivery_endpoint: "production_verified", knowledge_impact: [],
      risk: { level: values.risk, impact_categories: values.impact, rationale: values.rationale.trim() }, unresolved_questions: lines(values.questions)
    };
    if (await onSubmit(body)) form.resetFields();
  };

  return (
    <Drawer open={open} onClose={onClose} size={640} title="约定" destroyOnHidden
      extra={<Space><Button onClick={onClose}>取消</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>提交约定候选</Button></Space>}>
      <p className="drawer-lead">约定写清这条需求要达到什么、做到哪里为止，以及怎样验收。提交后成为候选，确认后才生效。</p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={initialValues} onFinish={finish}>
        <div className="form-section">目标与范围</div>
        <Form.Item name="goal" label="目标" rules={[{ required: true, whitespace: true }]}><Input maxLength={4000} placeholder="完成后用户能做到什么" /></Form.Item>
        <Form.Item name="scope" label="范围" rules={[{ required: true, whitespace: true }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} /></Form.Item>
        <div className="form-row">
          <Form.Item name="non_goals" label="不做" extra="每行一项"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></Form.Item>
          <Form.Item name="constraints" label="约束" extra="每行一项"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} /></Form.Item>
        </div>

        <div className="form-section">验收标准</div>
        <Form.List name="criteria" rules={[{ validator: async (_, value) => { if (!value?.length) throw new Error("至少一条验收标准"); } }]}>
          {(fields, { add, remove }) => <>
            {fields.map((field, index) => (
              <div key={field.key} className="criterion">
                <div className="criterion__head"><span className="mono criterion__key">A{index + 1}</span>
                  {fields.length > 1 && <Button type="text" size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label="删除这条验收标准" />}
                </div>
                <Form.Item name={[field.name, "scenario"]} label="场景" rules={[{ required: true, whitespace: true }]}><Input placeholder="在什么情况下" /></Form.Item>
                <Form.Item name={[field.name, "expected"]} label="预期" rules={[{ required: true, whitespace: true }]}><Input placeholder="应当看到什么" /></Form.Item>
                <Form.Item name={[field.name, "evidence"]} label="证据" extra="每行一项：怎样证明它达成了" rules={[{ validator: async (_, value) => { if (!lines(value).length) throw new Error("至少一项证据"); } }]}>
                  <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder="例如：pnpm check 通过" />
                </Form.Item>
              </div>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ scenario: "", expected: "", evidence: "" })}>添加验收标准</Button>
          </>}
        </Form.List>

        <div className="form-section">风险</div>
        <Form.Item name="risk" label="风险等级"><Radio.Group optionType="button" options={[{ value: "ordinary", label: "普通" }, { value: "high", label: "高风险" }]} /></Form.Item>
        <Form.Item name="impact" label="影响面" rules={[{ required: true, type: "array", min: 1, message: "至少选一项" }]}>
          <Checkbox.Group options={[{ value: "permissions", label: "权限" }, { value: "important_data", label: "重要数据" }, { value: "key_compatibility", label: "关键兼容性" }, { value: "other", label: "其他" }]} />
        </Form.Item>
        <Form.Item name="rationale" label="风险说明" rules={[{ required: true, whitespace: true }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
        <Form.Item name="questions" label="仍未明确的问题" extra="每行一项，可以留空"><Input.TextArea autoSize={{ minRows: 1, maxRows: 5 }} /></Form.Item>
      </Form>
    </Drawer>
  );
}
