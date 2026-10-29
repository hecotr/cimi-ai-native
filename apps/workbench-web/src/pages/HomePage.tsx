import { ArrowRightOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Skeleton } from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useActiveChanges, type ChangeSummary } from "../api/useActiveChanges";
import { CreateChangeDrawer } from "../components/CreateChangeDrawer";
import { HolderBadge, LoopTicks } from "../components/LoopTrack";
import { Empty, PageError } from "../components/States";
import { STATIONS } from "../lib/flow";
import { SetupChecklist } from "../components/SetupChecklist";
import { KIND } from "../lib/labels";

export function HomePage() {
  const { dashboard, summaries, loading } = useActiveChanges();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  if (dashboard.isError) return <PageError message={dashboard.error.message} onRetry={() => dashboard.refetch()} />;

  const open = summaries.filter(item => item.station >= 0 && item.change.lifecycle_state !== "Completed");
  const yours = open.filter(item => item.next?.holder === "human" && item.change.lifecycle_state !== "ReadyForDelivery");
  const agents = open.filter(item => item.next?.holder === "agent");

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">{dashboard.data?.project.name ?? "项目"}</div>
          <h1 className="page-title">总览</h1>
          <p className="page-sub">
            {loading ? "正在读取…" : <>
              <span className="count amber">{yours.length}</span> 件事等你处理
              <span className="dot-sep" />
              <span className="count teal">{agents.length}</span> 个 Agent 正在实施
              <span className="dot-sep" />
              共 {open.length} 条在推进
            </>}
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setCreating(true)}>新需求</Button>
      </header>

      <SetupChecklist />
      {loading ? <Skeleton active paragraph={{ rows: 6 }} /> : open.length === 0 ? (
        <Empty title="还没有在推进的需求" action={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>录入第一条需求</Button>}>
          用一句话写下期望的结果。之后按澄清、约定、计划、实施、验证的顺序推进，每一步都会留下记录。
        </Empty>
      ) : <>
        {(yours.length > 0 || agents.length > 0) && (
          <section className="queue">
            {yours.map(item => <QueueRow key={item.change.id} item={item} />)}
            {agents.map(item => <QueueRow key={item.change.id} item={item} />)}
          </section>
        )}

        <section>
          <div className="section-head"><h2>环路</h2><span className="section-note">每条需求在环路上的位置</span></div>
          <div className="board">
            {STATIONS.map((station, index) => {
              const column = open.filter(item => item.station === index);
              return (
                <div key={station.key} className="board__col">
                  <div className="board__col-head"><span>{station.name}</span><span className="board__count">{column.length}</span></div>
                  <div className="board__cards">
                    {column.map(item => (
                      <button key={item.change.id} className={`board-card holder-${item.next?.holder ?? "none"}`} onClick={() => navigate(`/changes/${item.change.id}`)}>
                        <span className="board-card__key mono">{item.change.display_key}<em>{KIND[item.change.kind]}</em></span>
                        <span className="board-card__title">{item.change.title}</span>
                        {item.next && <span className="board-card__next"><span className="holder-dot" />{item.next.title}</span>}
                      </button>
                    ))}
                    {column.length === 0 && <div className="board__empty" />}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </>}
      <CreateChangeDrawer open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function QueueRow({ item }: { item: ChangeSummary }) {
  const next = item.next!;
  return (
    <Link to={`/changes/${item.change.id}/${next.tab}`} className={`queue-row holder-${next.holder}`}>
      <HolderBadge holder={next.holder} text={next.holder === "agent" ? "Agent" : "你"} />
      <span className="queue-row__main">
        <span className="queue-row__title">{next.title}</span>
        <span className="queue-row__meta"><span className="mono">{item.change.display_key}</span> {item.change.title}</span>
      </span>
      <LoopTicks current={item.station} holder={next.holder} />
      <ArrowRightOutlined className="queue-row__go" />
    </Link>
  );
}
