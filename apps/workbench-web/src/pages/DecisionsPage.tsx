import { Segmented, Skeleton } from "antd";
import { useState } from "react";
import { useDecisions } from "../api/hooks";
import { DecisionCard } from "../components/DecisionCard";
import { Empty, PageError } from "../components/States";

export function DecisionsPage() {
  const query = useDecisions();
  const [view, setView] = useState<"open" | "done">("open");
  if (query.isError) return <PageError message={query.error.message} onRetry={() => query.refetch()} />;
  const items = (query.data?.items ?? []).flatMap(({ change, intent }) => intent.decision_requests.map(item => ({ change, intent, item })));
  const open = items.filter(({ item }) => item.status === "pending" || item.status === "approve");
  const done = items.filter(({ item }) => !(item.status === "pending" || item.status === "approve")).sort((a, b) => b.item.request.created_at.localeCompare(a.item.request.created_at));
  const shown = view === "open" ? open : done;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">决定</div>
          <h1 className="page-title">等你决定的事</h1>
          <p className="page-sub">核对候选内容后记录决定。批准和应用分两步：应用后才形成正式版本。</p>
        </div>
      </header>
      <div className="toolbar">
        <Segmented value={view} onChange={value => setView(value as "open" | "done")} options={[{ value: "open", label: `待处理 ${open.length}` }, { value: "done", label: "已处理" }]} />
      </div>
      {query.isLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : shown.length === 0 ? (
        <Empty title={view === "open" ? "没有等你决定的事" : "还没有处理过的决定"}>
          {view === "open" ? "约定或计划请求确认后，会出现在这里。" : "记录过的决定会保留在这里和需求的“记录”页。"}
        </Empty>
      ) : (
        <div className="stack">{shown.map(({ change, intent, item }) => <DecisionCard key={item.request.id} change={change} intent={intent} item={item} showChange />)}</div>
      )}
    </div>
  );
}
