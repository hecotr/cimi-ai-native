import { CheckCircleFilled } from "@ant-design/icons";
import { Link } from "react-router";
import { useDashboard, useWorkbenchContext } from "../api/hooks";
import { holdsProjectRole, SOLO_PROJECT_ROLES } from "../lib/roles";

/** What must be in place before a Change can be started; shown only while something is missing. */
export function SetupChecklist() {
  const context = useWorkbenchContext().data!;
  const dashboard = useDashboard().data;
  if (!dashboard) return null;
  const items = [
    { key: "roles", label: "承担项目职责", done: SOLO_PROJECT_ROLES.every(role => holdsProjectRole(dashboard, context.actor_id, role)) },
    { key: "rules", label: "设定推进规则", done: !!dashboard.flow.settings_version },
    { key: "model", label: "连接模型", done: !!context.runtime?.provider?.credential_configured }
  ];
  if (items.every(item => item.done)) return null;
  return (
    <div className="setup">
      <div>
        <div className="setup__title">开工前还差 {items.filter(item => !item.done).length} 步</div>
        <div className="setup__sub">澄清与约定可以先做；开始实施前需要完成这些准备。</div>
      </div>
      <div className="setup__items">
        {items.map(item => item.done
          ? <span key={item.key} className="solo-role is-held"><CheckCircleFilled />{item.label}</span>
          : <Link key={item.key} to="/settings" className="solo-role"><span className="solo-role__dot" />{item.label}</Link>)}
      </div>
    </div>
  );
}
