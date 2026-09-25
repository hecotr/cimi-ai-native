import { Link } from "react-router-dom";
import { useDemo } from "../demo/context";
import { ENVIRONMENTS } from "../demo/scenario";

export function ChangesIndexPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Changes</h1>
        <p className="muted">完整列表在 Workbench。这里只提供创建入口，避免再造一套 Issue Tracker。</p>
      </div>
      <div className="card empty-state">
        <p>本次演示从创建 CHG-0242 订单导出能力开始，一路走到 Delivery Closed。</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="button" to="/">
            回到 Workbench
          </Link>
          <Link className="button-secondary" to="/changes/new">
            创建 Change
          </Link>
        </div>
      </div>
    </div>
  );
}

export function DecisionsPage() {
  const { state } = useDemo();
  return (
    <div className="page">
      <div className="page-header">
        <h1>Decisions</h1>
        <p className="muted">正式决策仍在 Change Room 的 Decision Panel 中完成。</p>
      </div>
      <div className="stack">
        {state.inbox.map((item) => (
          <article key={item.id} className="card">
            <div className="mono">{item.id}</div>
            <strong>{item.title}</strong>
            <p>{item.question}</p>
            <div className="tiny">
              {item.actingRole} · {item.objectVersion}
              {item.environment ? ` · ${item.environment}` : ""}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function EnvironmentsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>Environments</h1>
        <p className="muted">演示只投影 staging-cn 与 prod-cn，不连接真实环境。</p>
      </div>
      <div className="split-grid">
        {ENVIRONMENTS.map((item) => (
          <article key={item.id} className="card">
            <h2 className="mono">{item.id}</h2>
            <p>{item.purpose}</p>
            <p className="muted">{item.occupancy}</p>
            <span className="badge badge-neutral">{item.status}</span>
          </article>
        ))}
      </div>
    </div>
  );
}
