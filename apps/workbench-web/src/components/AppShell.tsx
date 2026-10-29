import { CheckSquareOutlined, InboxOutlined, ReloadOutlined, SettingOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Layout, Menu, Tooltip } from "antd";
import { Link, Outlet, useLocation } from "react-router";
import { useDashboard, useDecisions, useWorkbenchContext } from "../api/hooks";
import { PendingWriteBar } from "./PendingWriteBar";

const { Sider, Content } = Layout;

export function AppShell() {
  const location = useLocation();
  const context = useWorkbenchContext().data!;
  const dashboard = useDashboard().data;
  const decisions = useDecisions().data;
  const client = useQueryClient();
  const fetching = useIsFetching() > 0;
  const waiting = decisions?.items.reduce((sum, item) => sum + item.intent.decision_requests.filter(request => request.status === "pending" || request.status === "approve").length, 0) ?? 0;
  const operator = dashboard?.governance.actors.find(actor => actor.id === context.actor_id)?.display_name ?? "本地操作者";
  const section = location.pathname === "/" ? "home" : location.pathname.split("/")[1]!;
  const selected = section === "runs" ? "changes" : section;

  return (
    <Layout className="shell">
      <Sider width={232} className="shell__sider" breakpoint="lg" collapsedWidth={72}>
        <Link to="/" className="brand" aria-label="CimiLoop 首页">
          <LoopMark />
          <span className="brand__text">CimiLoop<small>{dashboard?.project.name ?? "本地项目"}</small></span>
        </Link>
        <Menu theme="dark" mode="inline" selectedKeys={[selected]} className="shell__menu" items={[
          { key: "home", icon: <InboxOutlined />, label: <Link to="/">总览</Link> },
          { key: "changes", icon: <UnorderedListOutlined />, label: <Link to="/changes">需求</Link> },
          { key: "decisions", icon: <CheckSquareOutlined />, label: <Link to="/decisions" className="menu-with-count">决定{waiting > 0 && <Badge count={waiting} color="var(--amber)" size="small" />}</Link> },
          { key: "settings", icon: <SettingOutlined />, label: <Link to="/settings">设置</Link> }
        ]} />
        <div className="shell__operator">
          <span className="avatar">{operator.slice(0, 1)}</span>
          <span className="shell__operator-text">{operator}<small>本地 Human</small></span>
        </div>
      </Sider>
      <Layout>
        <header className="topbar">
          <RuntimePill />
          <Tooltip title="重新读取项目事实">
            <Button type="text" icon={<ReloadOutlined spin={fetching} />} onClick={() => client.invalidateQueries()} aria-label="刷新" />
          </Tooltip>
        </header>
        <PendingWriteBar />
        <Content className="shell__content"><Outlet /></Content>
      </Layout>
    </Layout>
  );
}

function RuntimePill() {
  const runtime = useWorkbenchContext().data?.runtime;
  const provider = runtime?.provider;
  const ready = !!provider?.credential_configured;
  return (
    <Link to="/settings" className={`runtime-pill ${ready ? "is-ready" : "is-off"}`}>
      <span className="runtime-pill__dot" />
      {provider ? <><span className="mono">{provider.model}</span><span className="runtime-pill__sep">·</span>{ready ? "模型已连接" : "缺少凭据"}</> : "模型尚未配置"}
    </Link>
  );
}

/** The mark: an open loop whose end returns to the start, the dot is the Agent travelling it. */
export function LoopMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="loop-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="rgba(255,255,255,0.06)" />
      <path d="M10 16a6 6 0 1 1 6 6" fill="none" stroke="var(--amber)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="22" r="2.6" fill="var(--teal-bright)" />
    </svg>
  );
}
