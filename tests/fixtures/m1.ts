import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CimiLoopKernel } from "../../packages/kernel/dist/index.js";
import {
  SCHEMA_VERSION,
  type Change,
  type CommandSuccess,
  type DomainError,
  type InternalId
} from "../../packages/protocol/dist/index.js";
import { SqliteProjectStore } from "../../packages/store-sqlite/dist/index.js";

export const M1_NOW = "2026-09-20T00:00:00.000Z";
export const M1_FEATURE_TITLE = "M1 Feature vertical slice";

const temporaryDirectories: string[] = [];
const openStores: SqliteProjectStore[] = [];

export const createDeterministicIdFactory = (start = 1): (() => InternalId) => {
  let sequence = start;
  return (): InternalId => {
    const hex = sequence.toString(16).padStart(12, "0");
    sequence += 1;
    return `00000000-0000-7000-8000-${hex}`;
  };
};

export const cleanupM1Fixtures = (): void => {
  while (openStores.length > 0) {
    openStores.pop()?.close();
  }
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
};

export interface M1CommandDraft {
  command_type: string;
  payload: Record<string, unknown>;
  actor_id?: InternalId;
  project_id?: InternalId;
  target?: { object_type: string; id: InternalId; domain_version?: number };
  expected_revision?: number;
  command_id?: InternalId;
  correlation_id?: InternalId;
}

export interface M1Harness {
  directory: string;
  databasePath: string;
  store: SqliteProjectStore;
  kernel: CimiLoopKernel;
  now: () => string;
  nextId: () => InternalId;
  humanCommand: (draft: M1CommandDraft) => Record<string, unknown>;
  agentCommand: (draft: M1CommandDraft) => Record<string, unknown>;
}

const envelope = (
  origin: "human_cli" | "agent",
  producer: string,
  nextId: () => InternalId,
  draft: M1CommandDraft
): Record<string, unknown> => ({
  schema_version: SCHEMA_VERSION,
  command_id: draft.command_id ?? nextId(),
  correlation_id: draft.correlation_id ?? nextId(),
  command_type: draft.command_type,
  requested_at: M1_NOW,
  source: { origin, producer },
  payload: draft.payload,
  ...(draft.actor_id ? { actor_id: draft.actor_id } : {}),
  ...(draft.project_id ? { project_id: draft.project_id } : {}),
  ...(draft.target ? { target: draft.target } : {}),
  ...(draft.expected_revision !== undefined ? { expected_revision: draft.expected_revision } : {})
});

export const createM1Harness = (): M1Harness => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-m1-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "project.db");
  const store = new SqliteProjectStore(databasePath);
  openStores.push(store);
  const nextId = createDeterministicIdFactory();
  const now = (): string => M1_NOW;
  const kernel = new CimiLoopKernel({ store, now, id: nextId });
  return {
    directory,
    databasePath,
    store,
    kernel,
    now,
    nextId,
    humanCommand: (draft) => envelope("human_cli", "m1-human-fixture", nextId, draft),
    agentCommand: (draft) => envelope("agent", "m1-agent-fixture", nextId, draft)
  };
};

export const isCommandSuccess = (result: CommandSuccess | DomainError): result is CommandSuccess =>
  "ok" in result && result.ok === true;

export const featureContractCandidatePayload = (): Record<string, unknown> => ({
  profile: "feature",
  intent: "为 Draft Change 建立可批准的 Contract 与 Plan，使 Change 可靠进入 Planned。",
  outcomes: ["Change 在人工批准后进入 Planned", "Decision、Gate 与 Event 形成完整审计链"],
  scope: {
    in: ["Contract Candidate", "Plan Candidate", "Human Decision", "Knowledge Impact"],
    out: ["Runtime execution", "Artifact build", "Production release"]
  },
  non_goals: ["不在 M1 执行 Agent Runtime", "不部署测试或生产环境"],
  acceptance: [
    {
      key: "AC-planned",
      statement: "Feature Change 在 Contract 与 Plan 均获批准后进入 Planned。"
    }
  ],
  constraints: ["Agent Actor 不得提交正式 Human Decision", "正式 Contract 与 Plan 批准后不可原地覆盖"],
  risk: {
    data_exposure: "none",
    security: "none",
    reliability: "local-only",
    reversibility: "fully_reversible"
  },
  knowledge_impact: {
    product_business: { conclusion: "NoImpact", rationale: "本次只建立治理闭环，不改变产品对外说明。" },
    technical: {
      conclusion: "Update",
      owner_role: "technical_owner",
      gate: "change_closure",
      summary: "需要更新 M1 实施说明，记录 Contract/Plan 批准路径。"
    },
    operations: { conclusion: "NoImpact", rationale: "无运行手册或告警路径变化。" },
    communication: { conclusion: "NoImpact", rationale: "无对外沟通材料需要更新。" }
  }
});

export const featurePlanCandidatePayload = (contractVersion = 1): Record<string, unknown> => ({
  contract_version: contractVersion,
  summary: "先固化 Contract，再形成覆盖验收、风险与知识义务的 Task DAG。",
  verification_strategy: "通过 Kernel 场景测试证明 Draft → IntentReady → Planned，并覆盖越权与过期 Decision。",
  recovery_considerations: "任何写失败回滚 Change、Decision、Gate、Transition、Event、Outbox 与 Receipt。",
  tasks: [
    {
      key: "define-contract",
      title: "形成并批准 Contract v1",
      kind: "governance",
      dependencies: []
    },
    {
      key: "define-plan",
      title: "形成覆盖验收与验证策略的 Plan",
      kind: "governance",
      dependencies: ["define-contract"]
    },
    {
      key: "update-m1-docs",
      title: "更新 M1 实施说明",
      kind: "knowledge",
      knowledge_source: "technical",
      dependencies: ["define-plan"]
    }
  ]
});

export interface InitializedM1Project {
  projectId: InternalId;
  actorId: InternalId;
  change: Change;
}

const requireSuccess = (result: CommandSuccess | DomainError, step: string): CommandSuccess => {
  if (!isCommandSuccess(result)) {
    throw new Error(`${step} failed: ${result.code}`);
  }
  return result;
};

export const initializeM1Project = (harness: M1Harness): InitializedM1Project => {
  const initialized = requireSuccess(
    harness.kernel.execute(
      harness.humanCommand({
        command_type: "InitializeProject",
        payload: {
          name: "M1 Baseline",
          repository_kind: "directory",
          repository_path: harness.directory,
          owner_name: "M1 Owner",
          owner_email: "m1@example.com"
        }
      })
    ),
    "InitializeProject"
  );
  if (!("project" in initialized.data)) {
    throw new Error("InitializeProject did not return a project");
  }
  const projectId = initialized.data.project.id;
  const actorId = initialized.data.actor.id;
  const created = requireSuccess(
    harness.kernel.execute(
      harness.humanCommand({
        command_type: "CreateChange",
        project_id: projectId,
        actor_id: actorId,
        payload: { title: M1_FEATURE_TITLE }
      })
    ),
    "CreateChange"
  );
  if (!("change" in created.data)) {
    throw new Error("CreateChange did not return a change");
  }
  return { projectId, actorId, change: created.data.change };
};

const executeQuietly = (harness: M1Harness, draft: M1CommandDraft): CommandSuccess | DomainError =>
  harness.kernel.execute(harness.humanCommand(draft));

const currentChange = (harness: M1Harness, changeId: InternalId): Change | undefined => {
  const loaded = harness.kernel.getChange(changeId);
  return "lifecycle_state" in loaded ? loaded : undefined;
};

export const runM1FeatureToPlanned = (harness: M1Harness): Change | undefined => {
  const { projectId, actorId, change } = initializeM1Project(harness);
  const target = { object_type: "change", id: change.id, domain_version: 1 };

  executeQuietly(harness, {
    command_type: "BootstrapSoloGovernance",
    project_id: projectId,
    actor_id: actorId,
    target,
    expected_revision: change.revision,
    payload: {
      change_id: change.id,
      intent_owner_actor_id: actorId,
      technical_owner_actor_id: actorId
    }
  });

  executeQuietly(harness, {
    command_type: "SubmitContractCandidate",
    project_id: projectId,
    actor_id: actorId,
    target,
    expected_revision: currentChange(harness, change.id)?.revision ?? change.revision,
    payload: featureContractCandidatePayload()
  });

  const intentRequest = executeQuietly(harness, {
    command_type: "RequestIntentDecision",
    project_id: projectId,
    actor_id: actorId,
    target,
    expected_revision: currentChange(harness, change.id)?.revision ?? change.revision,
    payload: { change_id: change.id }
  });

  if (isCommandSuccess(intentRequest)) {
    const requestId =
      "request" in intentRequest.data
        ? (intentRequest.data as { request: { id: InternalId } }).request.id
        : change.id;
    executeQuietly(harness, {
      command_type: "SubmitDecision",
      project_id: projectId,
      actor_id: actorId,
      expected_revision: currentChange(harness, change.id)?.revision ?? change.revision,
      payload: {
        request_id: requestId,
        outcome: "approve",
        acting_role_id: actorId,
        reason: "Contract 覆盖范围、验收与知识影响，批准进入规划。"
      }
    });
  }

  executeQuietly(harness, {
    command_type: "SubmitPlanCandidate",
    project_id: projectId,
    actor_id: actorId,
    target,
    expected_revision: currentChange(harness, change.id)?.revision ?? change.revision,
    payload: featurePlanCandidatePayload()
  });

  const planRequest = executeQuietly(harness, {
    command_type: "RequestPlanDecision",
    project_id: projectId,
    actor_id: actorId,
    target,
    expected_revision: currentChange(harness, change.id)?.revision ?? change.revision,
    payload: { change_id: change.id }
  });

  if (isCommandSuccess(planRequest)) {
    const requestId =
      "request" in planRequest.data
        ? (planRequest.data as { request: { id: InternalId } }).request.id
        : change.id;
    executeQuietly(harness, {
      command_type: "SubmitDecision",
      project_id: projectId,
      actor_id: actorId,
      expected_revision: currentChange(harness, change.id)?.revision ?? change.revision,
      payload: {
        request_id: requestId,
        outcome: "approve",
        acting_role_id: actorId,
        reason: "Plan 覆盖验收、验证策略与知识 Task，批准进入 Planned。"
      }
    });
  }

  return currentChange(harness, change.id);
};
