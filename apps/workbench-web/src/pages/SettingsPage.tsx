import { CheckCircleFilled, ExclamationCircleFilled, UserSwitchOutlined } from "@ant-design/icons";
import { Button, Form, InputNumber, Radio, Select, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { api } from "../api/client";
import { useAction, useDashboard, useWorkbenchContext, useWrite } from "../api/hooks";
import type { Actor, Dashboard } from "../api/types";
import { ROLE } from "../lib/labels";
import { holdsProjectRole, SOLO_PROJECT_ROLES } from "../lib/roles";

const CONFIG_EXAMPLE = `{
  "base_url": "http://127.0.0.1:3425/v1",
  "model": "codex/gpt-6-luna",
  "max_turns": 30,
  "max_tokens": 200000
}`;

export function SettingsPage() {
  const context = useWorkbenchContext().data!;
  const dashboard = useDashboard().data;
  const runtime = context.runtime;
  const provider = runtime?.provider;
  const actors = dashboard?.governance.actors ?? [];
  const assignments = dashboard?.governance.assignments ?? [];
  const scopeName = (scope: { kind: string; id: string }) => scope.kind === "project" ? "整个项目" : dashboard?.flow.changes.find(change => change.id === scope.id)?.display_key ?? scope.kind;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{dashboard?.project.name}</div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">模型连接与检查在本机文件中配置，这里显示当前生效的值。</p>
        </div>
      </header>

      <section className="settings-block">
        <div className="settings-block__intro">
          <h3>模型连接</h3>
          <p>Agent 通过 OpenAI 兼容接口调用模型。密钥只保存在本机钥匙串，不会进入项目、日志或 Agent 的上下文。</p>
        </div>
        <div className="surface surface--pad">
          <div className={`connection ${provider?.credential_configured ? "is-ready" : "is-off"}`}>
            {provider?.credential_configured ? <CheckCircleFilled /> : <ExclamationCircleFilled />}
            <div>
              <b>{provider ? provider.credential_configured ? "已连接" : "缺少密钥" : "尚未配置"}</b>
              {provider && <div className="mono muted">{provider.model} · {provider.base_url}</div>}
            </div>
          </div>
          {runtime?.limits && (
            <dl className="facts">
              <div><dt>每次运行最多</dt><dd><b>{runtime.limits.max_turns}</b> 轮</dd></div>
              <div><dt>Token 上限</dt><dd><b>{runtime.limits.max_tokens.toLocaleString()}</b></dd></div>
            </dl>
          )}
          {!provider?.credential_configured && (
            <div className="howto">
              <div className="howto__step"><span className="mono">1</span>写入 <code>~/.config/cimiloop/provider.json</code></div>
              <Typography.Paragraph copyable={{ text: CONFIG_EXAMPLE }} className="code-block"><pre>{CONFIG_EXAMPLE}</pre></Typography.Paragraph>
              <div className="howto__step"><span className="mono">2</span>把密钥存进钥匙串（在终端执行，按提示输入）</div>
              <Typography.Paragraph copyable className="code-block"><pre>security add-generic-password -s cimiloop-provider -a cimiloop -w</pre></Typography.Paragraph>
              <div className="howto__step"><span className="mono">3</span>重启工作台</div>
            </div>
          )}
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-block__intro">
          <h3>固定检查</h3>
          <p>每次 Agent 运行结束时依次执行。检查结果作为证据进入验证。</p>
        </div>
        <div className="surface">
          {runtime?.checks?.length ? (
            <ul className="check-list">{runtime.checks.map(check => <li key={check.name}><b>{check.name}</b><code>{check.command}</code></li>)}</ul>
          ) : <div className="surface--pad muted">还没有配置固定检查。</div>}
        </div>
      </section>

      <SoloRoles />
      <FlowRules />

      <section className="settings-block">
        <div className="settings-block__intro">
          <h3>成员与职责</h3>
          <p>每个写操作都以某个职责的身份执行。一个人可以同时承担多个职责。</p>
        </div>
        <div className="surface">
          <Table<Actor> rowKey="id" pagination={false} dataSource={actors} columns={[
            { title: "成员", render: (_, actor) => <span className="member"><span className="avatar avatar--light">{actor.display_name.slice(0, 1)}</span>{actor.display_name}{actor.id === context.actor_id && <Tag bordered={false}>你</Tag>}</span> },
            { title: "类型", width: 90, render: (_, actor) => ({ human: "Human", agent: "Agent", system: "系统" }[actor.actor_type]) },
            { title: "职责", render: (_, actor) => <div className="chips">{assignments.filter(item => item.actor_id === actor.id && !item.ended_at && (!item.expires_at || item.expires_at > new Date().toISOString())).map(item =>
              <Tag key={item.id} bordered={false}>{ROLE[item.role_key] ?? item.role_key}<span className="muted"> · {scopeName(item.scope)}</span></Tag>)}</div> }
          ]} />
        </div>
      </section>
    </div>
  );
}

/** Solo mode: let the local person take every project-wide role a Change needs, one command each. */
function SoloRoles() {
  const context = useWorkbenchContext().data!;
  const dashboard = useDashboard().data;
  const write = useWrite();
  const act = useAction();
  const [working, setWorking] = useState(false);
  const missing = SOLO_PROJECT_ROLES.filter(role => !holdsProjectRole(dashboard, context.actor_id, role));
  const takeAll = async () => {
    setWorking(true);
    for (const role of missing) {
      const fresh = await api<Dashboard>("/api/dashboard");
      const ok = await act(() => write.command("AssignResponsibility", { actor_id: context.actor_id, role_key: role, scope: { kind: "project", id: fresh.project.id } },
        { role: "project_owner", label: `承担${ROLE[role]}`, target: { object_type: "project", id: fresh.project.id }, revision: fresh.project.revision }));
      if (!ok) break;
    }
    setWorking(false);
  };
  return (
    <section className="settings-block">
      <div className="settings-block__intro">
        <h3>单人模式</h3>
        <p>一个人推进需求时，需要同时承担流程协调、技术与质量职责。每项职责仍单独记录。</p>
      </div>
      <div className="surface surface--pad">
        <div className="solo-roles">
          {SOLO_PROJECT_ROLES.map(role => {
            const held = !missing.includes(role);
            return <div key={role} className={`solo-role ${held ? "is-held" : ""}`}>{held ? <CheckCircleFilled /> : <span className="solo-role__dot" />}{ROLE[role]}</div>;
          })}
        </div>
        {missing.length > 0
          ? <Button type="primary" icon={<UserSwitchOutlined />} loading={working} onClick={takeAll} style={{ marginTop: 16 }}>由我承担缺少的 {missing.length} 项职责</Button>
          : <p className="muted" style={{ margin: "14px 0 0" }}>你已承担全部项目职责。需求负责人在录入每条需求时指派。</p>}
      </div>
    </section>
  );
}

/** Project flow rules: who coordinates, who arbitrates priority, and how many Changes may be in progress. Required before starting work. */
function FlowRules() {
  const context = useWorkbenchContext().data!;
  const dashboard = useDashboard().data;
  const write = useWrite();
  const act = useAction();
  const current = dashboard?.flow.settings_version;
  const humans = dashboard?.governance.actors.filter(actor => actor.actor_type === "human") ?? [];
  const canEdit = holdsProjectRole(dashboard, context.actor_id, "flow_owner");
  if (!dashboard) return null;
  return (
    <section className="settings-block" id="flow-rules">
      <div className="settings-block__intro">
        <h3>推进规则</h3>
        <p>开工前必须设定：谁协调推进、谁裁决优先级，以及同时在实施的需求最多几条。</p>
      </div>
      <div className="surface surface--pad">
        {!current && <div className="setup-flag">尚未设定，需求暂时无法开工</div>}
        <Form layout="vertical" requiredMark={false} disabled={!canEdit} key={current?.id ?? "none"}
          initialValues={{ wip_limit: current?.settings.wip_limit ?? 3, flow_owner: current?.settings.flow_owner_actor_id ?? context.actor_id,
            arbiter: current?.settings.priority_arbiter_actor_id ?? context.actor_id, order: current?.settings.priority_order ?? "higher_first" }}
          onFinish={(values: { wip_limit: number; flow_owner: string; arbiter: string; order: "higher_first" | "lower_first" }) => act(async () => {
            const fresh = await api<Dashboard>("/api/dashboard");
            return write.command("UpdateProjectSettings", {
              base_settings_ref: fresh.project.settings_ref ?? null,
              settings: { wip_limit: values.wip_limit, flow_owner_actor_id: values.flow_owner, priority_arbiter_actor_id: values.arbiter,
                priority_order: values.order, check_interval_ms: current?.settings.check_interval_ms ?? 60_000 }
            }, { role: "project_owner", label: "保存推进规则", target: { object_type: "project", id: fresh.project.id }, revision: fresh.project.revision });
          })}>
          <div className="form-row">
            <Form.Item name="flow_owner" label="推进协调人"><Select options={humans.map(actor => ({ value: actor.id, label: actor.display_name }))} /></Form.Item>
            <Form.Item name="arbiter" label="优先级裁决人"><Select options={humans.map(actor => ({ value: actor.id, label: actor.display_name }))} /></Form.Item>
          </div>
          <div className="form-row">
            <Form.Item name="wip_limit" label="在制上限" extra={`当前在实施 ${dashboard.flow.wip.used} 条`}><InputNumber min={1} max={50} style={{ width: "100%" }} /></Form.Item>
            <Form.Item name="order" label="优先级排序"><Radio.Group optionType="button" options={[{ value: "higher_first", label: "数字大优先" }, { value: "lower_first", label: "数字小优先" }]} /></Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={write.busy}>{current ? "保存修改" : "保存推进规则"}</Button>
          {!canEdit && <span className="muted" style={{ marginLeft: 12 }}>需要先承担流程协调人职责</span>}
        </Form>
      </div>
    </section>
  );
}
