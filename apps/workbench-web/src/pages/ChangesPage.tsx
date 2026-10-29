import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Input, Segmented, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useActiveChanges, type ChangeSummary } from "../api/useActiveChanges";
import { CreateChangeDrawer } from "../components/CreateChangeDrawer";
import { LoopTicks } from "../components/LoopTrack";
import { Empty, PageError } from "../components/States";
import { KIND, LIFECYCLE } from "../lib/labels";

const FILTERS = [
  { value: "open", label: "推进中" }, { value: "yours", label: "等你处理" },
  { value: "ReadyForDelivery", label: "待交付" }, { value: "closed", label: "已关闭" }, { value: "all", label: "全部" }
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export function ChangesPage() {
  const { dashboard, summaries, loading } = useActiveChanges();
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const actors = dashboard.data?.governance.actors ?? [];

  const rows = useMemo(() => summaries.filter(({ change, next }) => {
    const closed = change.lifecycle_state === "Completed" || change.lifecycle_state === "Terminated";
    const match = filter === "all" || (filter === "open" && !closed) || (filter === "closed" && closed) ||
      (filter === "yours" && next?.holder === "human" && !closed) || change.lifecycle_state === filter;
    const text = search.trim().toLowerCase();
    return match && (!text || change.title.toLowerCase().includes(text) || change.display_key.toLowerCase().includes(text));
  }).sort((a, b) => b.change.updated_at.localeCompare(a.change.updated_at)), [summaries, filter, search]);

  if (dashboard.isError) return <PageError message={dashboard.error.message} onRetry={() => dashboard.refetch()} />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">需求池</div>
          <h1 className="page-title">需求</h1>
          <p className="page-sub">需求与缺陷共用一个台账。每条都沿同一个环路推进。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setCreating(true)}>新需求</Button>
      </header>
      <div className="toolbar">
        <Segmented value={filter} onChange={value => setFilter(value as Filter)} options={FILTERS.map(item => ({ ...item }))} />
        <Input allowClear prefix={<SearchOutlined />} placeholder="按编号或标题查找" value={search} onChange={event => setSearch(event.target.value)} style={{ maxWidth: 280 }} />
      </div>
      <div className="surface">
        <Table<ChangeSummary> rowKey={row => row.change.id} loading={loading} dataSource={rows} pagination={rows.length > 20 ? { pageSize: 20 } : false}
          onRow={row => ({ onClick: () => navigate(`/changes/${row.change.id}`), className: "clickable-row" })}
          locale={{ emptyText: <Empty title={search ? "没有匹配的需求" : "这里还没有需求"}>{search ? "换个关键词试试。" : "点击右上角录入。"}</Empty> }}
          columns={[
            { title: "编号", width: 110, render: (_, row) => <span className="mono strong">{row.change.display_key}</span> },
            { title: "标题", render: (_, row) => <span className="cell-title">{row.change.title}</span> },
            { title: "类型", width: 80, render: (_, row) => <Tag bordered={false} color={row.change.kind === "bug" ? "red" : undefined}>{KIND[row.change.kind]}</Tag> },
            { title: "位置", width: 130, render: (_, row) => <LoopTicks current={row.station} holder={row.next?.holder ?? "none"} /> },
            { title: "下一步", render: (_, row) => row.next ? <span className={`next-cell holder-${row.next.holder}`}><span className="holder-dot" />{row.next.title}</span> : <span className="muted">{LIFECYCLE[row.change.lifecycle_state]}</span> },
            { title: "负责人", width: 120, render: (_, row) => actors.find(actor => actor.id === (row.change.requirement_owner_actor_id ?? row.change.owner_actor_id))?.display_name ?? "—" },
            { title: "更新", width: 110, render: (_, row) => <span className="muted">{dayjs(row.change.updated_at).fromNow()}</span> }
          ]} />
      </div>
      <CreateChangeDrawer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
