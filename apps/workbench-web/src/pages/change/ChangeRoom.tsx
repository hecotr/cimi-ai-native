import { ArrowRightOutlined, MoreOutlined, PauseCircleOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Button, Dropdown, Form, Input, Modal, Tabs, Tag } from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useChange, useDashboard, useWorkbenchContext } from "../../api/hooks";
import type { ChangeDetail } from "../../api/types";
import { HolderBadge, LoopTrack } from "../../components/LoopTrack";
import { PageError, PageSkeleton } from "../../components/States";
import { holderLabel, nextStep, stationIndex } from "../../lib/flow";
import { KIND, LIFECYCLE } from "../../lib/labels";
import { projectOwnerAssignment } from "../../lib/roles";
import { ClarifyPanel } from "./ClarifyPanel";
import { ContractPanel } from "./ContractPanel";
import { ExecutePanel } from "./ExecutePanel";
import { HistoryPanel } from "./HistoryPanel";
import { PlanPanel } from "./PlanPanel";
import { useChangeWrite } from "./useChangeWrite";
import { VerifyPanel } from "./VerifyPanel";

const TABS = ["clarify", "contract", "plan", "execute", "verify", "history"] as const;

export function ChangeRoom() {
  const { changeId, tab } = useParams();
  const query = useChange(changeId);
  if (query.isError) return <PageError message={query.error.message} onRetry={() => query.refetch()} />;
  if (!query.data) return <PageSkeleton />;
  return <Room detail={query.data} tab={tab} />;
}

function Room({ detail, tab }: { detail: ChangeDetail; tab?: string }) {
  const navigate = useNavigate();
  const change = detail.intent.change;
  const next = nextStep(detail);
  const station = stationIndex(change, detail);
  const active = TABS.includes(tab as never) ? tab! : next.tab === "overview" ? "clarify" : next.tab;
  const actors = useDashboard().data?.governance.actors ?? [];
  const name = (id?: string) => actors.find(actor => actor.id === id)?.display_name ?? "未指派";
  const go = (key: string) => navigate(`/changes/${change.id}/${key}`, { replace: true });
  const pendingDecisions = detail.intent.decision_requests.filter(item => item.status === "pending" || item.status === "approve").length;

  return (
    <div className="page room">
      <header className="room-head">
        <div className="room-head__main">
          <div className="eyebrow"><span className="mono">{change.display_key}</span><span className="eyebrow__sep" />{KIND[change.kind]}<span className="eyebrow__sep" />{LIFECYCLE[change.lifecycle_state]}
            {change.operating_status === "Paused" && <Tag color="orange" bordered={false} style={{ marginLeft: 8 }}>已暂停</Tag>}
          </div>
          <h1 className="page-title room-title">{change.title}</h1>
          <div className="room-meta">
            <span>推进负责人 <b>{name(change.owner_actor_id)}</b></span>
            <span>需求负责人 <b>{name(change.requirement_owner_actor_id)}</b>{!change.requirement_owner_actor_id && <AssignToMe detail={detail} />}</span>
            <span>更新于 {dayjs(change.updated_at).fromNow()}</span>
          </div>
        </div>
        <ChangeMenu detail={detail} />
      </header>

      <LoopTrack current={station} holder={next.holder} />

      <div className={`next-callout holder-${next.holder}`}>
        <HolderBadge holder={next.holder} text={holderLabel[next.holder]} />
        <div className="next-callout__text"><b>{next.title}</b><span>{next.hint}</span></div>
        {next.tab !== active && next.tab !== "overview" && <Button type="text" onClick={() => go(next.tab)}>前往 <ArrowRightOutlined /></Button>}
      </div>

      <Tabs activeKey={active} onChange={go} className="room-tabs" items={[
        { key: "clarify", label: "澄清", children: <ClarifyPanel detail={detail} /> },
        { key: "contract", label: <TabLabel text="约定" done={!!change.contract_ref} />, children: <ContractPanel detail={detail} /> },
        { key: "plan", label: <TabLabel text="计划" done={!!change.plan_ref} />, children: <PlanPanel detail={detail} /> },
        { key: "execute", label: <TabLabel text="实施" count={detail.execution.tasks.length || undefined} />, children: <ExecutePanel detail={detail} /> },
        { key: "verify", label: "验证", children: <VerifyPanel detail={detail} /> },
        { key: "history", label: <TabLabel text="记录" count={pendingDecisions || undefined} />, children: <HistoryPanel detail={detail} /> }
      ]} />
    </div>
  );
}

const TabLabel = ({ text, done, count }: { text: string; done?: boolean; count?: number }) => (
  <span className="tab-label">{text}{done && <span className="tab-label__done" aria-label="已确认" />}{count !== undefined && <span className="tab-label__count">{count}</span>}</span>
);

function ChangeMenu({ detail }: { detail: ChangeDetail }) {
  const change = detail.intent.change;
  const write = useChangeWrite(change);
  const [pausing, setPausing] = useState(false);
  const [form] = Form.useForm<{ reason: string }>();
  if (change.lifecycle_state === "Completed" || change.lifecycle_state === "Terminated") return null;
  const paused = change.operating_status === "Paused";
  return <>
    <Dropdown trigger={["click"]} menu={{ items: [paused
      ? { key: "resume", icon: <PlayCircleOutlined />, label: "恢复推进", onClick: () => write.command("ResumeChange", {}, "change_owner", "恢复推进") }
      : { key: "pause", icon: <PauseCircleOutlined />, label: "暂停推进", onClick: () => setPausing(true) }] }}>
      <Button icon={<MoreOutlined />} aria-label="更多操作" />
    </Dropdown>
    <Modal open={pausing} title="暂停这条需求" okText="暂停" onCancel={() => setPausing(false)} confirmLoading={write.busy}
      onOk={() => form.validateFields().then(async values => { if (await write.command("PauseChange", { reason: values.reason }, "change_owner", "暂停推进")) setPausing(false); })}>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="reason" label="暂停理由" rules={[{ required: true, whitespace: true, message: "写下暂停的原因" }]}><Input.TextArea autoSize={{ minRows: 2 }} /></Form.Item>
      </Form>
    </Modal>
  </>;
}

/** A Change without a requirement owner cannot have its contract confirmed; let the project owner take it. */
function AssignToMe({ detail }: { detail: ChangeDetail }) {
  const change = detail.intent.change;
  const me = useWorkbenchContext().data!.actor_id;
  const basis = projectOwnerAssignment(useDashboard().data, me);
  const write = useChangeWrite(change);
  if (!basis) return null;
  return <Button type="link" size="small" loading={write.busy} onClick={() => write.command("TransferChangeResponsibility", {
    role_key: "requirement_owner", new_actor_id: me, grant_basis_refs: [{ object_type: "assignment", id: basis.id }], reason: "单人模式：由项目负责人承担需求负责人"
  }, "project_owner", "指派需求负责人")}>指派给我</Button>;
}
