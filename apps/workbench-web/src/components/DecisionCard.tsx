import { CheckCircleFilled } from "@ant-design/icons";
import { Button, Checkbox, Collapse, Form, Input, Radio, Tag } from "antd";
import dayjs from "dayjs";
import { Link } from "react-router";
import type { Change, ContractBody, DecisionRequestItem, IntentShowResult, PlanBody } from "../api/types";
import { lines } from "../lib/ids";
import { DECISION_ACTION, DECISION_STATUS, ROLE } from "../lib/labels";
import { ContractView, PlanView } from "../pages/change/ContractView";
import { useChangeWrite } from "../pages/change/useChangeWrite";

interface Values { choice: "approve" | "request_changes" | "reject"; reason: string; conditions?: string; reviewed: boolean }

export function DecisionCard({ change, intent, item, showChange = false }: { change: Change; intent: IntentShowResult; item: DecisionRequestItem; showChange?: boolean }) {
  const request = item.request;
  const write = useChangeWrite(change);
  const [form] = Form.useForm<Values>();
  const contract = request.action === "confirm_contract";
  const ordinary = contract || request.action === "confirm_plan";
  const candidate = [...intent.contract_proposals, ...intent.plan_proposals]
    .find(value => value.id === request.target_ref.id && value.proposal_revision === request.target_ref.domain_version);
  const decision = intent.decisions.find(value => value.id === item.decision_ref?.id);
  const tone = item.status === "pending" || item.status === "approve" ? "open" : item.status === "applied" ? "done" : "closed";

  return (
    <div className={`decision tone-${tone}`}>
      <div className="decision__head">
        <div>
          {showChange && <Link className="decision__change" to={`/changes/${change.id}/${contract ? "contract" : "plan"}`}><span className="mono">{change.display_key}</span> {change.title}</Link>}
          <div className="decision__title">{DECISION_ACTION[request.action] ?? request.action}<span className="muted">候选第 {request.target_ref.domain_version} 版</span></div>
        </div>
        <span className={`status-pill status-${item.status}`}>{DECISION_STATUS[item.status]}</span>
      </div>
      <div className="decision__meta">
        <span>需要 <b>{ROLE[request.required_role]}</b> 决定</span>
        <span>{dayjs(request.expires_at).isAfter(dayjs()) ? `${dayjs(request.expires_at).fromNow(true)}后过期` : "已过期"}</span>
      </div>

      {candidate && (
        <Collapse ghost size="small" className="decision__candidate" defaultActiveKey={item.status === "pending" ? ["c"] : []} items={[{
          key: "c", label: contract ? "查看约定候选" : "查看计划候选",
          children: contract ? <ContractView body={candidate.body as ContractBody} /> : <PlanView body={candidate.body as PlanBody} />
        }]} />
      )}

      {item.status === "pending" && ordinary && (
        <Form form={form} layout="vertical" requiredMark={false} className="decision__form" initialValues={{ choice: "approve", reviewed: false }}
          onFinish={values => write.command("RecordDecision", { request_id: request.id, input_digest: request.input_digest, choice: values.choice, reason: values.reason.trim(), conditions: lines(values.conditions) },
            request.required_role, "记录决定")}>
          <Form.Item name="choice"><Radio.Group optionType="button" buttonStyle="solid" options={[{ value: "approve", label: "批准" }, { value: "request_changes", label: "要求修改" }, { value: "reject", label: "拒绝" }]} /></Form.Item>
          <Form.Item name="reason" label="理由" rules={[{ required: true, whitespace: true, message: "写下决定的理由" }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} /></Form.Item>
          <Form.Item name="conditions" label="附带条件" extra="每行一项，可以留空"><Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} /></Form.Item>
          <Form.Item name="reviewed" valuePropName="checked" rules={[{ validator: async (_, value) => { if (!value) throw new Error("请先核对候选内容"); } }]}>
            <Checkbox>我已核对候选内容和风险依据</Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={write.busy}>记录决定</Button>
        </Form>
      )}
      {item.status === "pending" && !ordinary && <p className="muted">这类专业决定需要附带复核报告，请用命令行导入。</p>}

      {decision && (
        <div className="decision__record">
          <CheckCircleFilled /> <span>{DECISION_STATUS[decision.choice]}：{decision.reason}</span>
          {decision.conditions.length > 0 && <div className="chips">{decision.conditions.map(condition => <Tag key={condition} bordered={false}>{condition}</Tag>)}</div>}
        </div>
      )}
      {item.status === "approve" && ordinary && decision && (
        <Button type="primary" loading={write.busy} onClick={() => write.command(contract ? "ConfirmContract" : "ConfirmPlan", {
          proposal_ref: request.target_ref, decision_request_ref: { object_type: "decision_request", id: request.id },
          decision_ref: { object_type: "decision", id: decision.id }, input_digest: request.input_digest
        }, request.required_role, contract ? "应用约定" : "应用计划")}>{contract ? "应用约定，形成正式版本" : "应用计划，形成正式版本"}</Button>
      )}
    </div>
  );
}
