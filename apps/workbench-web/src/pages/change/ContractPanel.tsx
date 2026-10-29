import { EditOutlined } from "@ant-design/icons";
import { Button, Form, Input, Radio, Steps } from "antd";
import { useState } from "react";
import type { ChangeDetail, ContractBody } from "../../api/types";
import { DecisionCard } from "../../components/DecisionCard";
import { Empty } from "../../components/States";
import { ContractEditor } from "./ContractEditor";
import { ContractView } from "./ContractView";
import { useChangeWrite } from "./useChangeWrite";

export function ContractPanel({ detail }: { detail: ChangeDetail }) {
  const { intent } = detail, change = intent.change;
  const write = useChangeWrite(change);
  const [editing, setEditing] = useState(false);
  const version = intent.contract_versions.find(item => item.id === change.contract_ref?.id && item.version === change.contract_ref?.domain_version);
  const latest = intent.contract_proposals.at(-1);
  const inFlight = latest && !intent.contract_versions.some(item => item.proposal_ref.id === latest.id && item.proposal_ref.domain_version === latest.proposal_revision) ? latest : undefined;
  const requests = intent.decision_requests.filter(item => item.request.action === "confirm_contract" && inFlight && item.request.target_ref.id === inFlight.id && item.request.target_ref.domain_version === inFlight.proposal_revision);
  const openRequest = requests.find(item => item.status !== "stale" && item.status !== "reject" && item.status !== "request_changes");
  const risk = inFlight && intent.risk_assessments.find(item => item.subject_refs.some(ref => ref.id === inFlight.id && ref.domain_version === inFlight.proposal_revision));
  const editable = change.operating_status === "Active" && ["Draft", "IntentReady"].includes(change.lifecycle_state) && !change.plan_ref;

  const submit = async (body: ContractBody) => {
    const ok = await write.command("SubmitContractProposal", { base_version_ref: change.contract_ref ?? null, body }, "change_owner", "提交约定候选");
    if (ok) setEditing(false);
    return !!ok;
  };
  const proposalRef = inFlight && { object_type: "contract_proposal" as const, id: inFlight.id, domain_version: inFlight.proposal_revision };
  const step = !inFlight ? 0 : !risk ? 0 : !openRequest ? 1 : openRequest.status === "pending" ? 2 : 3;

  return (
    <div className="panel-grid">
      <div className="panel-main">
        {inFlight && (
          <section className="surface surface--pad">
            <div className="block-head">
              <div><div className="eyebrow">约定候选 · 第 {inFlight.proposal_revision} 版</div><h3 className="block-title">走完确认</h3></div>
              {editable && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>修改候选</Button>}
            </div>
            <Steps size="small" current={step} className="confirm-steps" items={[{ title: "风险判断", content: "技术负责人" }, { title: "请求确认", content: "推进负责人" }, { title: "决定", content: "需求负责人" }, { title: "应用", content: "形成正式版本" }].map((item, index) => ({ ...item, status: index < step ? "finish" as const : index === step ? "process" as const : "wait" as const }))} />
            {!risk && (
              <Form layout="vertical" requiredMark={false} initialValues={{ level: inFlight.body.risk.level }} className="inline-form"
                onFinish={(values: { level: "ordinary" | "high"; rationale: string }) => write.command("RecordRiskAssessment", { proposal_ref: proposalRef, level: values.level, rationale: values.rationale.trim() }, "technical_owner", "记录风险判断")}>
                <Form.Item name="level" label="风险判断"><Radio.Group optionType="button" options={[{ value: "ordinary", label: "普通" }, { value: "high", label: "高风险" }]} /></Form.Item>
                <Form.Item name="rationale" label="判断依据" rules={[{ required: true, whitespace: true, message: "写下你检查了什么" }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="看过哪些代码与数据，影响面在哪里" /></Form.Item>
                <Button type="primary" htmlType="submit" loading={write.busy}>记录风险判断</Button>
              </Form>
            )}
            {risk && !openRequest && (
              <div className="cta-strip cta-strip--flat">
                <div><b>风险已判断为{risk.level === "high" ? "高风险" : "普通"}</b><span>{risk.rationale}</span></div>
                <Button type="primary" loading={write.busy} onClick={() => write.command("RequestDecision", { action: "confirm_contract", proposal_ref: proposalRef, risk_ref: { object_type: "risk_assessment", id: risk.id } }, "change_owner", "请求确认约定")}>请求确认</Button>
              </div>
            )}
            {openRequest && <DecisionCard change={change} intent={intent} item={openRequest} />}
            {!openRequest && <div className="candidate-preview"><ContractView body={inFlight.body} /></div>}
          </section>
        )}

        {version ? (
          <section className="surface surface--pad">
            <div className="block-head">
              <div><div className="eyebrow">正式约定 · v{version.version}</div><h3 className="block-title">{version.body.goal}</h3></div>
              {editable && !inFlight && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>修订约定</Button>}
            </div>
            <ContractView body={version.body} hideGoal />
          </section>
        ) : !inFlight && (
          <Empty title="还没有约定" action={editable && <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>写约定</Button>}>
            约定写清目标、范围和验收标准。也可以先在“澄清”中问答，再从澄清生成。
          </Empty>
        )}
      </div>
      <aside className="panel-side">
        <div className="side-note">
          <h4>约定为什么要确认</h4>
          <p>Agent 只按已确认的约定实施，验证也只对照这里的验收标准。确认前的候选可以反复修改。</p>
        </div>
      </aside>
      <ContractEditor open={editing} onClose={() => setEditing(false)} onSubmit={submit} busy={write.busy} initial={inFlight?.body ?? version?.body} />
    </div>
  );
}
