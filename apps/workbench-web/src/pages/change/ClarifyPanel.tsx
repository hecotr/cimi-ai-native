import { BulbOutlined, PlusOutlined, SendOutlined } from "@ant-design/icons";
import { Alert, Button, Collapse, Form, Input, Space, Tag } from "antd";
import { useState } from "react";
import { api } from "../../api/client";
import { useAction, useWorkbenchContext } from "../../api/hooks";
import type { ChangeDetail, ClarificationSession, ContractBody } from "../../api/types";
import { Empty } from "../../components/States";
import { lines, uuid7 } from "../../lib/ids";
import { ContractEditor } from "./ContractEditor";
import { useChangeWrite } from "./useChangeWrite";

export function ClarifyPanel({ detail }: { detail: ChangeDetail }) {
  const change = detail.intent.change;
  const context = useWorkbenchContext().data!;
  const owner = [change.owner_actor_id, change.requirement_owner_actor_id].includes(context.actor_id);
  const beforePlan = change.operating_status === "Active" && ["Draft", "IntentReady"].includes(change.lifecycle_state) && !change.plan_ref && !detail.intent.plan_proposals.length;
  const session = detail.clarifications[0];
  const contractSession = session && session.basis.request.target !== "plan" ? session : undefined;

  if (detail.clarification_error) return <Alert type="warning" showIcon title="澄清记录暂时无法读取" description={detail.clarification_error.message} />;
  if (!owner) return <Empty title="只有需求的负责人可以澄清">推进负责人或需求负责人可以在这里记录问题与回答。</Empty>;

  return (
    <div className="panel-grid">
      <div className="panel-main">
        {contractSession ? <SessionThread detail={detail} session={contractSession} editable={beforePlan} />
          : beforePlan ? <StartClarification detail={detail} />
          : <Empty title="这条需求已经过了澄清阶段">计划确认后不再补记前置澄清，历史记录保留在下方。</Empty>}
        {detail.clarification_history.length > 1 && (
          <Collapse ghost className="history-collapse" items={[{ key: "h", label: `更早的澄清（${detail.clarification_history.length - 1}）`,
            children: detail.clarification_history.slice(0, -1).map(item => <div key={item.id} className="history-line">{item.requirement}</div>) }]} />
        )}
      </div>
      <aside className="panel-side">
        <div className="side-note">
          <h4>澄清要回答的三件事</h4>
          <ol>
            <li>要解决的问题，和为什么现在解决</li>
            <li>做到什么程度算完成</li>
            <li>明确不做什么</li>
          </ol>
          <p>问答结束后，从澄清直接生成约定候选。约定仍需需求负责人确认。</p>
        </div>
      </aside>
    </div>
  );
}

function StartClarification({ detail }: { detail: ChangeDetail }) {
  const change = detail.intent.change;
  const write = useChangeWrite(change);
  const [form] = Form.useForm<{ requirement: string; background: string; constraints?: string }>();
  return (
    <div className="surface surface--pad">
      <h3 className="block-title">开始澄清</h3>
      <p className="block-lead">把需求说清楚：要解决的问题、它所处的业务背景，以及必须遵守的约束。</p>
      <Form form={form} layout="vertical" requiredMark={false} initialValues={{ requirement: change.title }}
        onFinish={values => write.send(`/api/changes/${change.id}/clarifications`, {
          request_id: uuid7(), requirement: values.requirement.trim(), background: values.background.trim(), constraints: lines(values.constraints)
        }, "开始澄清")}>
        <Form.Item name="requirement" label="要解决的问题" rules={[{ required: true, whitespace: true }]}><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={4000} /></Form.Item>
        <Form.Item name="background" label="业务背景" rules={[{ required: true, whitespace: true, message: "写下这个问题出现的场景" }]}><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={4000} placeholder="谁在什么场景下遇到这个问题，现在怎么绕过" /></Form.Item>
        <Form.Item name="constraints" label="约束" extra="每行一项，可以留空"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="例如：不改数据库格式" /></Form.Item>
        <Button type="primary" htmlType="submit" loading={write.busy}>开始澄清</Button>
      </Form>
    </div>
  );
}

function SessionThread({ detail, session, editable }: { detail: ChangeDetail; session: ClarificationSession; editable: boolean }) {
  const change = detail.intent.change;
  const write = useChangeWrite(change);
  const act = useAction();
  const context = useWorkbenchContext().data!;
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<{ question: string; why: string }[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [editing, setEditing] = useState(false);
  const current = editable && session.head < 64 && !session.pending && !session.submitted && session.basis.change.revision === change.revision;
  const path = `/api/changes/${change.id}/clarifications/${session.id}`;
  const advance = (body: Record<string, unknown>, label: string) => write.send(path, { request_id: uuid7(), expected_head: session.head, ...body }, label);
  const allAnswered = session.questions.length > 0 && session.unanswered.length === 0;
  const request = session.basis.request;

  const suggest = async () => {
    setSuggesting(true);
    const result = await act(() => api<{ questions: { question: string; why: string }[] }>(`/api/changes/${change.id}/ai/clarify`, {}));
    setSuggesting(false);
    if (result) setSuggestions(result.questions);
  };
  const submitContract = async (body: ContractBody) => {
    const ok = await advance({ kind: "candidate", requested_at: new Date().toISOString(), body }, "提交约定候选");
    if (ok) setEditing(false);
    return !!ok;
  };

  return (
    <div className="thread">
      <div className="thread-brief surface surface--pad">
        <div className="eyebrow">澄清的问题</div>
        <p className="thread-brief__req">{request.requirement}</p>
        <p className="thread-brief__bg">{request.background}</p>
        {request.constraints.length > 0 && <div className="chips">{request.constraints.map(item => <Tag key={item} bordered={false}>{item}</Tag>)}</div>}
      </div>

      {session.pending && (
        <Alert type="warning" showIcon title="上一次澄清操作的结果还没有确认" description="用同一个请求重新确认，不会重复记录。"
          action={session.pending_request ? <Button onClick={() => write.send(path, session.pending_request, "核对澄清请求")}>重新确认</Button> : undefined} />
      )}

      <ol className="qa-list">
        {session.questions.map((item, index) => (
          <li key={item.id} className="qa">
            <div className="qa__q"><span className="qa__n mono">Q{index + 1}</span>{item.text}</div>
            {item.answer !== undefined ? <div className="qa__a">{item.answer}</div>
              : current ? (
                <div className="qa__answer">
                  <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} placeholder="写下回答" value={answers[item.id] ?? ""} onChange={event => setAnswers({ ...answers, [item.id]: event.target.value })} />
                  <Button type="primary" icon={<SendOutlined />} disabled={!answers[item.id]?.trim()} loading={write.busy}
                    onClick={() => advance({ kind: "answer", question_id: item.id, text: answers[item.id]!.trim() }, "记录回答")}>回答</Button>
                </div>
              ) : <div className="qa__a is-empty">尚未回答</div>}
          </li>
        ))}
        {session.questions.length === 0 && <li className="qa qa--empty">还没有问题。先写下你最不确定的地方，或请 AI 提出几个问题。</li>}
      </ol>

      {current && (
        <div className="composer">
          <Input.TextArea autoSize={{ minRows: 1, maxRows: 5 }} placeholder="还有哪里不清楚？写成一个问题" value={question} onChange={event => setQuestion(event.target.value)} maxLength={4000} />
          <Space>
            <Button icon={<BulbOutlined />} loading={suggesting} disabled={!context.runtime?.provider} onClick={suggest}>AI 建议问题</Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={!question.trim()} loading={write.busy}
              onClick={async () => { if (await advance({ kind: "question", text: question.trim() }, "记录问题")) setQuestion(""); }}>记录问题</Button>
          </Space>
        </div>
      )}

      {suggestions && current && (
        <div className="suggestions">
          <div className="suggestions__head"><BulbOutlined /> AI 建议的问题 <span className="muted">仅作参考，选你认为有用的加入</span></div>
          {suggestions.length === 0 && <div className="muted">没有新的建议。</div>}
          {suggestions.map(item => (
            <div key={item.question} className="suggestion">
              <div><div>{item.question}</div><div className="muted small">{item.why}</div></div>
              <Button size="small" onClick={async () => { if (await advance({ kind: "question", text: item.question }, "记录问题")) setSuggestions(list => list?.filter(value => value !== item) ?? null); }}>加入</Button>
            </div>
          ))}
        </div>
      )}

      {current && allAnswered && !change.contract_ref && (
        <div className="cta-strip">
          <div><b>问题都已回答</b><span>根据这次澄清写出约定：目标、范围和验收标准。</span></div>
          <Button type="primary" onClick={() => setEditing(true)}>写约定</Button>
        </div>
      )}
      {session.submitted && <Alert type="success" showIcon title="已从这次澄清提交约定候选" description="到“约定”页继续：记录风险判断并请求确认。" />}

      <ContractEditor open={editing} onClose={() => setEditing(false)} onSubmit={submitContract} busy={write.busy}
        initial={{ goal: change.title, scope: request.requirement, constraints: request.constraints,
          unresolved_questions: [] }} />
    </div>
  );
}
