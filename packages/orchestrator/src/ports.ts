import type { KernelResult } from "@cimiloop/kernel";
import type {
  AgentRunRecord,
  Blocker,
  CapabilityBinding,
  Change,
  ContextPackManifest,
  ContractVersion,
  DomainError,
  InternalId,
  PlanVersion,
  PolicySnapshot,
  ProviderDescriptor,
  WorkItem
} from "@cimiloop/protocol";
import type { RuntimeAdapter } from "@cimiloop/runtime";

export interface OrchestratorKernel {
  execute(input: unknown): KernelResult;
  getChange(idOrKey: string): Change | DomainError;
  getWorkItem(id: InternalId): WorkItem | DomainError;
  listWorkItemsByChange(changeId: InternalId): WorkItem[];
  listAgentRuns(workItemId: InternalId): AgentRunRecord[];
  getCapabilityBinding(id: InternalId): CapabilityBinding | DomainError;
  getContextPackManifest(id: InternalId): ContextPackManifest | DomainError;
  listOpenBlockers(changeId: InternalId): Blocker[];
  getCurrentContract(changeId: InternalId): ContractVersion | undefined;
  getCurrentPlan(changeId: InternalId): PlanVersion | undefined;
  getLatestPolicySnapshot(projectId: InternalId): PolicySnapshot | undefined;
}

export interface ProcessRegistry {
  remember(runId: InternalId, processReference: string, running: boolean): void;
  reference(runId: InternalId): string | undefined;
  isRunning(runId: InternalId): boolean;
}

export interface OrchestratorDependencies {
  kernel: OrchestratorKernel;
  runtime: RuntimeAdapter;
  processRegistry: ProcessRegistry;
  projectId: InternalId;
  actorId: InternalId;
  worktreePath: string;
  contextDirectory: string;
  providers: ProviderDescriptor[];
  actorPermissions: string[];
  providerPermissions: string[];
  now?: () => string;
}

export type OrchestratorResult =
  | { kind: "completed"; workItemId: InternalId; run: import("@cimiloop/protocol").AgentRunRecord }
  | { kind: "unknown"; workItemId: InternalId; run: import("@cimiloop/protocol").AgentRunRecord }
  | { kind: "blocked"; workItemId: InternalId; code: string }
  | { kind: "failed"; error: string };

export interface RecoveryResult {
  restarted: boolean;
  heartbeated: number;
  failed: number;
}
