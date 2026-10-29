import { EditOutlined, RocketOutlined } from "@ant-design/icons";
import { Button, Form, Input, Steps } from "antd";
import { useState } from "react";
import type { ChangeDetail, PlanBody } from "../../api/types";
import { DecisionCard } from "../../components/DecisionCard";
import { Empty } from "../../components/States";
import { PlanView } from "./ContractView";
import { PlanEditor } from "./PlanEditor";
import { useChangeWrite } from "./useChangeWrite";

export function PlanPanel({ detail }: { detail: ChangeDetail }) {
  const { intent } = detail, change = intent.change;
  const write = useChangeWrite(change);
  const [editing, setEditing] = useState(false);
  const contract = intent.contract_versions.find(item => item.id === change.contract_ref?.id && item.version === change.contract_ref?.domain_version);
  const version = intent.plan_versions.find(item => item.id === change.plan_ref?.id && item.version === change.plan_ref?.domain_version);
  const latest = intent.plan_proposals.at(-1);
  const inFlight = latest && !intent.plan_versions.some(item => item.proposal_ref.id === latest.id && item.proposal_ref.domain_version === latest.proposal_revision) ? latest : undefined;
  const openRequest = inFlight && intent.decision_requests.find(item => item.request.action === "confirm_plan" && item.request.target_ref.id === inFlight.id &&
    item.request.target_ref.domain_version === inFlight.proposal_revision && !["stale", "reject", "request_changes"].includes(item.status));
  const editable = change.operating_status === "Active" && ["Draft", "IntentReady"].includes(change.lifecycle_state);

  if (!contract) return <Empty title="先确认约定">计划要对照一份已确认的约定来写。</Empty>;

  const submit = async (body: PlanBody) => {
    const ok = await write.command("SubmitPlanProposal", { base_version_ref: change.plan_ref ?? null, body }, "technical_owner", "提交计划候选");
    if (ok) setEditing(false);
    return !!ok;
  };
  const proposalRef = inFlight && { object_type: "plan_proposal" as const, id: inFlight.id, domain_version: inFlight.proposal_revision };
  const step = !openRequest ? 0 : openRequest.status === "pending" ? 1 : 2;

  return (
    <div className="panel-grid">
      <div className="panel-main">
        {change.lifecycle_state === "IntentReady" && version && (
          <section className="launch">
            <div className="launch__text"><div className="eyebrow">约定与计划都已确认</div><h3>可以开工了</h3><p>开工后需求进入实施，占用一个在制名额。</p></div>
            <Form layout="inline" requiredMark={false} className="launch__form"
              onFinish={(values: { reason: string }) => write.command("StartChange", { plan_ref: change.plan_ref, opening_reason: values.reason.trim() }, "flow_owner", "开始实施")}>
              <Form.Item name="reason" rules={[{ required: true, whitespace: true, message: "写一句开工说明" }]} initialValue="约定与计划已确认，开始实施"><Input style={{ width: 260 }} /></Form.Item>
              <Button type="primary" htmlType="submit" icon={<RocketOutlined />} loading={write.busy}>开始实施</Button>
            </Form>
          </section>
        )}

        {inFlight && (
          <section className="surface surface--pad">
            <div className="block-head">
              <div><div className="eyebrow">计划候选 · 第 {inFlight.proposal_revision} 版</div><h3 className="block-title">走完确认</h3></div>
              {editable && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>修改候选</Button>}
            </div>
            <Steps size="small" current={step} className="confirm-steps" items={[{ title: "请求确认", content: "技术负责人" }, { title: "决定", content: "技术负责人" }, { title: "应用", content: "形成正式版本" }].map((item, index) => ({ ...item, status: index < step ? "finish" as const : index === step ? "process" as const : "wait" as const }))} />
            {!openRequest && (
              <div className="cta-strip cta-strip--flat">
                <div><b>计划候选已提交</b><span>发起确认后，技术负责人记录决定。</span></div>
                <Button type="primary" loading={write.busy} onClick={() => write.command("RequestDecision", { action: "confirm_plan", proposal_ref: proposalRef }, "technical_owner", "请求确认计划")}>请求确认</Button>
              </div>
            )}
            {openRequest ? <DecisionCard change={change} intent={intent} item={openRequest} /> : <div className="candidate-preview"><PlanView body={inFlight.body} /></div>}
          </section>
        )}

        {version ? (
          <section className="surface surface--pad">
            <div className="block-head">
              <div><div className="eyebrow">正式计划 · v{version.version}</div><h3 className="block-title">实施计划</h3></div>
              {editable && !inFlight && change.lifecycle_state !== "Executing" && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>修订计划</Button>}
            </div>
            <PlanView body={version.body} />
          </section>
        ) : !inFlight && (
          <Empty title="还没有计划" action={editable && <Button type="primary" icon={<EditOutlined />} onClick={() => setEditing(true)}>写计划</Button>}>
            把约定拆成实施任务和一个独立验证任务。计划确认后才能开工。
          </Empty>
        )}
      </div>
      <aside className="panel-side">
        <div className="side-note">
          <h4>好任务的样子</h4>
          <ul>
            <li>一次运行能完成，结果可以检查</li>
            <li>写清允许修改的路径，Agent 不会越界</li>
            <li>验证任务由另一个人或会话独立完成</li>
          </ul>
        </div>
      </aside>
      <PlanEditor open={editing} onClose={() => setEditing(false)} onSubmit={submit} busy={write.busy} change={change} contract={contract.body} initial={inFlight?.body ?? version?.body} />
    </div>
  );
}
