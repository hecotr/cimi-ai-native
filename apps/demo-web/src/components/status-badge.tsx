import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, PauseCircle, ShieldAlert, XCircle } from "lucide-react";
import type { FlowCondition, LifecycleState } from "../demo/types";

const LIFECYCLE_LABEL: Record<LifecycleState, string> = {
  Draft: "Draft",
  IntentReady: "IntentReady",
  Planned: "Planned",
  Executing: "Executing",
  Evaluating: "Evaluating",
  TestDeploying: "TestDeploying",
  TestValidating: "TestValidating",
  ReleaseReady: "ReleaseReady",
  ProductionDeploying: "ProductionDeploying",
  ReleaseVerified: "ReleaseVerified",
  DeliveryClosed: "DeliveryClosed"
};

const FLOW_META: Record<FlowCondition, { label: string; className: string; icon: typeof Clock3 }> = {
  Active: { label: "Active", className: "badge-info", icon: LoaderCircle },
  AwaitingDecision: { label: "AwaitingDecision", className: "badge-warn", icon: Clock3 },
  Paused: { label: "Paused", className: "badge-neutral", icon: PauseCircle },
  Blocked: { label: "Blocked", className: "badge-risk", icon: AlertTriangle },
  Failed: { label: "Failed", className: "badge-risk", icon: XCircle },
  Completed: { label: "Completed", className: "badge-trust", icon: CheckCircle2 }
};

export function StatusBadge({
  lifecycle,
  flow
}: {
  lifecycle?: LifecycleState;
  flow?: FlowCondition;
}) {
  if (lifecycle) {
    return (
      <span className="badge badge-neutral" title={`lifecycle state: ${lifecycle}`}>
        <ShieldAlert size={13} aria-hidden="true" />
        <span>{LIFECYCLE_LABEL[lifecycle]}</span>
      </span>
    );
  }
  if (flow) {
    const meta = FLOW_META[flow];
    const Icon = meta.icon;
    return (
      <span className={`badge ${meta.className}`} title={`flow condition: ${flow}`}>
        <Icon size={13} aria-hidden="true" />
        <span>{meta.label}</span>
      </span>
    );
  }
  return null;
}

export function RiskBadge({ risk }: { risk: string }) {
  const tone = risk.toLowerCase().startsWith("high")
    ? "badge-risk"
    : risk.toLowerCase().startsWith("medium")
      ? "badge-warn"
      : "badge-neutral";
  return (
    <span className={`badge ${tone}`}>
      <AlertTriangle size={13} aria-hidden="true" />
      {risk}
    </span>
  );
}

export function ClaimBadge({ status }: { status: string }) {
  const tone =
    status === "Satisfied" ? "badge-trust" : status === "Insufficient" || status === "Conflicted" || status === "Refuted" ? "badge-risk" : "badge-neutral";
  return <span className={`badge ${tone}`}>{status}</span>;
}
