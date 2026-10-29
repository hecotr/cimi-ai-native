import type {
  Change, ExecutionShowResult, FlowStatusResult, GovernanceListResult, IntentShowResult, Project, RunShowResult,
  VerificationShowResult, ActingRole, TypedReference, ContractBody, PlanBody, TaskDefinition
} from "@cimiloop/protocol/v2";

export type { Change, ExecutionShowResult, IntentShowResult, RunShowResult, VerificationShowResult, ActingRole, TypedReference, ContractBody, PlanBody, TaskDefinition };
export type Task = ExecutionShowResult["tasks"][number];
export type WorkItem = ExecutionShowResult["work_items"][number];
export type Run = RunShowResult["runs"][number];
export type DecisionRequestItem = IntentShowResult["decision_requests"][number];
export type Actor = GovernanceListResult["actors"][number];
export type Assignment = GovernanceListResult["assignments"][number];
export type Evaluation = VerificationShowResult extends { evaluations: Array<infer E> } ? E : never;

export interface RuntimeInfo {
  kind: "lite";
  provider: { base_url: string; model: string; credential_configured: boolean } | null;
  limits?: { max_turns: number; max_tokens: number };
  checks?: { name: string; command: string }[];
}

export interface WorkbenchContext {
  ok: true;
  project_id: string;
  actor_id: string;
  csrf: string;
  expires_at: string;
  selected_runtime?: string;
  agent_start_available?: boolean;
  runtime?: RuntimeInfo;
}

export interface Dashboard {
  ok: true;
  project: Project;
  flow: FlowStatusResult;
  governance: GovernanceListResult;
  execution: ExecutionShowResult;
  providers: { descriptors?: unknown[]; bindings?: unknown[] };
}

export interface ClarificationQuestion { id: string; text: string; answer?: string }
export interface ClarificationSession {
  id: string;
  head: number;
  pending?: boolean;
  submitted?: boolean;
  pending_request?: unknown;
  basis: { change: { revision: number }; request: { requirement: string; background: string; constraints: string[]; target?: "plan" } };
  questions: ClarificationQuestion[];
  unanswered: unknown[];
  steps: unknown[];
}

export interface ChangeDetail {
  ok: true;
  intent: IntentShowResult;
  execution: ExecutionShowResult;
  runs: RunShowResult;
  verification: VerificationShowResult;
  clarifications: ClarificationSession[];
  clarification_history: { id: string; requirement: string }[];
  clarification_error?: { code: string; message: string };
}

export interface DecisionsData { ok: true; items: { change: Change; intent: IntentShowResult }[] }

export type RunStatus = "Reserved" | "Running" | "Succeeded" | "Failed" | "Cancelled" | "Unknown" | "NotStarted";

export type RunEvent = { seq: number; at: string } & (
  | { type: "status"; status: RunStatus; reason?: string }
  | { type: "assistant"; turn: number; text: string }
  | { type: "tool_call"; turn: number; call_id: string; tool: string; args: unknown }
  | { type: "tool_result"; call_id: string; ok: boolean; summary: string }
  | { type: "check"; name: string; status: "passed" | "failed"; exit_code: number; duration_ms: number }
  | { type: "usage"; turns: number; prompt_tokens: number; completion_tokens: number; limits: { max_turns: number; max_tokens: number } }
  | { type: "error"; message: string }
  | { type: "done" }
);

export interface RunCheck { name: string; command: string; status: "passed" | "failed"; exit_code: number; duration_ms: number; output_tail: string }
export interface RunResult {
  ok: true;
  run_id: string;
  task_id: string;
  status: RunStatus;
  started_at?: string;
  ended_at?: string;
  branch?: string;
  base_commit?: string;
  head_commit?: string;
  summary?: string;
  files: { path: string; change: "added" | "modified" | "deleted" | "renamed"; additions: number; deletions: number }[];
  patch: string;
  patch_truncated?: boolean;
  checks: RunCheck[];
  usage: { turns: number; prompt_tokens: number; completion_tokens: number };
}

export interface AiReview {
  ok: true;
  verdict: "looks_good" | "concerns";
  summary: string;
  findings: { file?: string; line?: number; severity: "info" | "warn" | "block"; message: string }[];
}

export interface LocalCommand {
  command_id: string;
  requested_at: string;
  acting_role: ActingRole;
  command_type: string;
  target?: TypedReference;
  expected_revision?: number;
  payload: unknown;
}
