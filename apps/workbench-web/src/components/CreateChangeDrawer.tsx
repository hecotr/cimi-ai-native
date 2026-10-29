import { Button, Drawer, Form, Input, Segmented, Select, Space } from "antd";
import { useNavigate } from "react-router";
import { useAction, useDashboard, useWorkbenchContext, useWrite } from "../api/hooks";

interface Values { title: string; kind: "requirement" | "bug"; owner?: string; version?: string }

export function CreateChangeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const dashboard = useDashboard().data;
  const me = useWorkbenchContext().data!.actor_id;
  const write = useWrite();
  const act = useAction();
  const navigate = useNavigate();
  const humans = dashboard?.governance.actors.filter(actor => actor.actor_type === "human") ?? [];
  const versions = dashboard?.flow.target_versions.filter(version => version.status === "open") ?? [];

  const submit = async (values: Values) => {
    const result = await act(() => write.command("CreateChange", {
      title: values.title.trim(), kind: values.kind,
      ...(values.owner ? { requirement_owner_actor_id: values.owner } : {}),
      ...(values.version ? { target_version_id: values.version } : {})
    }, { role: "project_owner", label: "录入需求" }));
    if (result?.aggregate?.id) { form.resetFields(); onClose(); navigate(`/changes/${result.aggregate.id}/clarify`); }
  };

  return (
    <Drawer open={open} onClose={onClose} size={480} title="新需求" destroyOnHidden
      extra={<Space><Button onClick={onClose}>取消</Button><Button type="primary" loading={write.busy} onClick={() => form.submit()}>录入并开始澄清</Button></Space>}>
      <p className="drawer-lead">先用一句话写下期望的结果。目标、范围和验收标准在下一步澄清中补全。</p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ kind: "requirement", owner: me }} onFinish={submit}>
        <Form.Item name="kind" label="类型">
          <Segmented block options={[{ label: "需求", value: "requirement" }, { label: "缺陷", value: "bug" }]} />
        </Form.Item>
        <Form.Item name="title" label="期望的结果" rules={[{ required: true, whitespace: true, message: "写下这条需求要达成什么" }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={300} showCount placeholder="例如：工作台的运行列表可以按状态筛选" />
        </Form.Item>
        <Form.Item name="owner" label="需求负责人" extra="负责确认约定。单人使用时就是你自己。">
          <Select allowClear placeholder="稍后指派" options={humans.map(actor => ({ value: actor.id, label: actor.display_name }))} />
        </Form.Item>
        {versions.length > 0 && (
          <Form.Item name="version" label="目标版本">
            <Select allowClear placeholder="未规划" options={versions.map(version => ({ value: version.id, label: version.name }))} />
          </Form.Item>
        )}
      </Form>
    </Drawer>
  );
}
