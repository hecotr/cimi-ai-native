import type {
  Change,
  ChangeRoomResult,
  CommandSuccess,
  DecisionInboxResult,
  DecisionOutcome,
  DomainError,
  GetDecisionRequestResult,
  InternalId,
  Role
} from "@cimiloop/protocol";
import { SCHEMA_VERSION, createInternalId } from "@cimiloop/protocol";

export interface WorkbenchKernel {
  execute(input: unknown): CommandSuccess | DomainError;
  listChanges(): Change[];
  getChange(idOrKey: string): Change | DomainError;
  getChangeRoom(idOrKey: string): ChangeRoomResult | DomainError;
  listDecisionInbox(actorId: InternalId): DecisionInboxResult | DomainError;
  getDecisionRequest(requestId: InternalId): GetDecisionRequestResult | DomainError;
  listRoles(): Role[];
  listWorkItemsByChange(changeId: InternalId): import("@cimiloop/protocol").WorkItem[];
  listTasksByChange(changeId: InternalId): import("@cimiloop/protocol").Task[];
  listOpenBlockers(changeId: InternalId): import("@cimiloop/protocol").Blocker[];
  listAgentRuns(workItemId: InternalId): import("@cimiloop/protocol").AgentRunRecord[];
  listClaimsByChange(changeId: InternalId): import("@cimiloop/protocol").Claim[];
  listEvidenceByChange(changeId: InternalId): import("@cimiloop/protocol").Evidence[];
  listIndependentEvaluationsByChange(changeId: InternalId): import("@cimiloop/protocol").IndependentEvaluation[];
  listRepairWorkItemLinksByChange(changeId: InternalId): import("@cimiloop/protocol").RepairWorkItemLink[];
  listImpactAssessmentsBySubject(subjectId: InternalId): import("@cimiloop/protocol").ImpactAssessment[];
  listEnvironments(projectId: InternalId): import("@cimiloop/protocol").Environment[];
  listReleasesByChange(changeId: InternalId): import("@cimiloop/protocol").Release[];
  listDeploymentsByRelease(releaseId: InternalId): import("@cimiloop/protocol").Deployment[];
  listExternalOperationsByChange(changeId: InternalId): import("@cimiloop/protocol").ExternalOperation[];
  listUnknownExternalOperations(): import("@cimiloop/protocol").ExternalOperation[];
  listRecoveryExecutionsByRelease(releaseId: InternalId): import("@cimiloop/protocol").RecoveryExecution[];
  listOpenAttentionItems(projectId: InternalId): import("@cimiloop/protocol").AttentionItem[];
  rebuildReadModels(projectId: InternalId): import("@cimiloop/protocol").AttentionItem[];
  getCurrentContract(changeId: InternalId): import("@cimiloop/protocol").ContractVersion | undefined;
  getTimeline(changeId: string): import("@cimiloop/protocol").TimelineResult | DomainError;
}
import { escapeHtml, page } from "./html.js";
import { workbenchStyles } from "./styles.js";

export interface WorkbenchContext {
  kernel: WorkbenchKernel;
  actorId: InternalId;
  projectId: InternalId;
  token: string;
  now: () => string;
}

const isDomainError = (value: unknown): value is { code: string; message: string } =>
  typeof value === "object" && value !== null && "code" in value && "category" in value;

export const renderHome = (context: WorkbenchContext): string => {
  const changes = context.kernel.listChanges();
  const inbox = context.kernel.listDecisionInbox(context.actorId);
  const items = isDomainError(inbox) ? [] : inbox.items;
  context.kernel.rebuildReadModels(context.projectId);
  const attention = context.kernel.listOpenAttentionItems(context.projectId);
  const activeRuns = changes.flatMap((change) =>
    context.kernel
      .listWorkItemsByChange(change.id)
      .flatMap((item) => context.kernel.listAgentRuns(item.id))
      .filter((run) => run.status === "queued" || run.status === "starting" || run.status === "running")
  );
  const environments = context.kernel.listEnvironments(context.projectId);
  const releases = changes.flatMap((change) => context.kernel.listReleasesByChange(change.id));
  const changeCards = changes
    .map(
      (change) =>
        `<article class="card"><a href="/changes/${escapeHtml(change.id)}">${escapeHtml(change.display_key)}</a>
        <p>${escapeHtml(change.title)}</p>
        <p class="muted">${escapeHtml(change.lifecycle_state)} · ${escapeHtml(change.operating_status)}</p></article>`
    )
    .join("");
  const inboxCards = items
    .map(
      (item) =>
        `<article class="card"><a href="/changes/${escapeHtml(item.change_id)}">${escapeHtml(item.display_key)}</a>
        <p>${escapeHtml(item.summary)}</p>
        <p class="muted">角色 ${escapeHtml(item.required_role_key)}</p></article>`
    )
    .join("");
  return page(
    "CimiLoop Workbench",
    `<h1>Attention Queue</h1>${
      attention.length === 0
        ? "<p class=\"muted\">当前没有开放 Attention。</p>"
        : `<ul>${attention
            .map((item) => `<li>${escapeHtml(item.kind)} · ${escapeHtml(item.summary)}</li>`)
            .join("")}</ul>`
    }
     <h1>Decision Inbox</h1>${inboxCards || "<p class=\"muted\">当前没有待处理 Decision。</p>"}
     <h1>Changes</h1>${changeCards || "<p class=\"muted\">当前没有 Change。</p>"}
     <h1>Active Runs</h1>${
       activeRuns.length === 0
         ? "<p class=\"muted\">当前没有进行中的 Run。</p>"
         : `<ul>${activeRuns
             .map((run) => `<li>${escapeHtml(run.id)} · ${escapeHtml(run.status)}</li>`)
             .join("")}</ul>`
     }
     <h1>Environments</h1>${
       environments.length === 0
         ? "<p class=\"muted\">尚无 Environment。</p>"
         : `<ul>${environments
             .map((item) => `<li>${escapeHtml(item.environment_key)} · ${escapeHtml(item.kind)}</li>`)
             .join("")}</ul>`
     }
     <h1>Releases</h1>${
       releases.length === 0
         ? "<p class=\"muted\">尚无 Release。</p>"
         : `<ul>${releases
             .map((item) => `<li>${escapeHtml(item.kind)} · ${escapeHtml(item.status)}</li>`)
             .join("")}</ul>`
     }`,
    workbenchStyles
  );
};

export const renderChangeRoom = (
  context: WorkbenchContext,
  idOrKey: string,
  view: "lifecycle" | "run" = "lifecycle"
): string | undefined => {
  const change = context.kernel.getChange(idOrKey);
  if (isDomainError(change)) return undefined;
  const room = context.kernel.getChangeRoom(change.id);
  if (isDomainError(room)) return undefined;
  const roles = context.kernel.listRoles();
  const inbox = context.kernel.listDecisionInbox(context.actorId);
  const open = isDomainError(inbox) ? [] : inbox.items.filter((item) => item.change_id === change.id);
  const forms = open
    .map((item) => {
      const role = roles.find((entry) => entry.role_key === item.required_role_key);
      return `<form class="card" method="post" action="/decisions/${escapeHtml(item.request_id)}">
        <input type="hidden" name="token" value="${escapeHtml(context.token)}">
        <input type="hidden" name="expected_revision" value="${change.revision}">
        <input type="hidden" name="acting_role_id" value="${escapeHtml(role?.id ?? "")}">
        <p>角色 ${escapeHtml(item.required_role_key)}</p>
        <label>结果
          <select name="outcome">
            <option value="approve">approve</option>
            <option value="request_changes">request_changes</option>
            <option value="reject">reject</option>
          </select>
        </label>
        <label>理由<textarea name="reason" required></textarea></label>
        <label>Feedback<textarea name="feedback"></textarea></label>
        <button type="submit">提交 Decision</button>
      </form>`;
    })
    .join("");
  const contract = context.kernel.getCurrentContract(change.id);
  const timeline = context.kernel.getTimeline(change.id);
  const activity = isDomainError(timeline) ? [] : timeline.events;
  return page(
    `${change.display_key} ${change.title}`,
    `<nav aria-label="Change stages">
      <ol>
        <li>Intent</li>
        <li>Plan</li>
        <li>Execute</li>
        <li>Evidence</li>
        <li>Delivery</li>
        <li>Close</li>
      </ol>
    </nav>
    <article class="card">
      <h1>${escapeHtml(change.display_key)} ${escapeHtml(change.title)}</h1>
      <h2>Current Focus</h2>
      <p>生命周期：${escapeHtml(change.lifecycle_state)} · Revision ${change.revision}</p>
      <p>焦点：${escapeHtml(room.room.focus)}</p>
      <p>下一动作：${escapeHtml(room.room.next_action)}</p>
    </article>
    <article class="card">
      <h2>Contract</h2>
      ${
        contract
          ? `<p>${escapeHtml(contract.profile_key)} v${contract.domain_version} · ${escapeHtml(contract.intent)}</p>`
          : "<p class=\"muted\">尚无正式 Contract。</p>"
      }
    </article>
    ${forms}
    <article class="card">
      <h2>Task DAG</h2>
      ${
        context.kernel.listTasksByChange(change.id).length === 0
          ? "<p class=\"muted\">尚无 Task。</p>"
          : `<ul>${context.kernel
              .listTasksByChange(change.id)
              .map((task) => {
                const items = context.kernel.listWorkItemsByChange(change.id).filter((item) => item.task_id === task.id);
                const ready = items.some((item) => item.status === "ready");
                return `<li>${escapeHtml(task.key)} · ${escapeHtml(task.title)} · ${ready ? "ready" : items[0]?.status ?? "pending"}</li>`;
              })
              .join("")}</ul>`
      }
    </article>
    <article class="card">
      <h2>Blockers</h2>
      ${
        context.kernel.listOpenBlockers(change.id).length === 0
          ? "<p class=\"muted\">没有开放 Blocker。</p>"
          : `<ul>${context.kernel
              .listOpenBlockers(change.id)
              .map((blocker) => `<li>${escapeHtml(blocker.code)} · ${escapeHtml(blocker.summary)}</li>`)
              .join("")}</ul>`
      }
    </article>
    <article class="card">
      <h2>Runs</h2>
      ${
        context.kernel
          .listWorkItemsByChange(change.id)
          .flatMap((item) => context.kernel.listAgentRuns(item.id))
          .map(
            (run) =>
              `<p class="muted">Run ${escapeHtml(run.id)} · ${escapeHtml(run.status)} · log ${escapeHtml(run.log_reference)}</p>`
          )
          .join("") || "<p class=\"muted\">尚无 Run。</p>"
      }
    </article>
    <article class="card">
      <h2>Claims</h2>
      ${
        context.kernel.listClaimsByChange(change.id).length === 0
          ? "<p class=\"muted\">尚无 Claim。</p>"
          : `<ul>${context.kernel
              .listClaimsByChange(change.id)
              .map((claim) => {
                const related = context.kernel.listEvidenceByChange(change.id).filter((item) => item.claim_id === claim.id);
                const refutes = related.filter((item) => item.stance === "Refutes");
                const freshness = related
                  .map((item) => context.kernel.listImpactAssessmentsBySubject(item.id).at(-1)?.new_validity ?? "Valid")
                  .join(", ");
                return `<li>${escapeHtml(claim.claim_key)} · ${escapeHtml(claim.obligation)} · coverage ${related.length} · Refutes ${refutes.length} · freshness ${escapeHtml(freshness || "Valid")}</li>`;
              })
              .join("")}</ul>`
      }
    </article>
    <article class="card">
      <h2>Evaluations</h2>
      ${
        context.kernel.listIndependentEvaluationsByChange(change.id).length === 0
          ? "<p class=\"muted\">尚无 Evaluation。</p>"
          : `<ul>${context.kernel
              .listIndependentEvaluationsByChange(change.id)
              .map((evaluation) => `<li>${escapeHtml(evaluation.result)} · ${escapeHtml(evaluation.reason)}</li>`)
              .join("")}</ul>`
      }
    </article>
    <article class="card">
      <h2>Delivery</h2>
      ${(() => {
        const environments = context.kernel.listEnvironments(context.projectId);
        const releases = context.kernel.listReleasesByChange(change.id);
        const operations = context.kernel.listExternalOperationsByChange(change.id);
        const unknown = context.kernel
          .listUnknownExternalOperations()
          .filter((item) => item.change_id === change.id);
        const recoveries = releases.flatMap((item) => context.kernel.listRecoveryExecutionsByRelease(item.id));
        const deployments = releases.flatMap((item) => context.kernel.listDeploymentsByRelease(item.id));
        return `
          <p>下一动作：${escapeHtml(room.room.next_action)}</p>
          <h3>Environments</h3>
          ${
            environments.length === 0
              ? "<p class=\"muted\">尚无 Environment。</p>"
              : `<ul>${environments
                  .map((item) => `<li>${escapeHtml(item.environment_key)} · ${escapeHtml(item.kind)} · ${escapeHtml(item.status)}</li>`)
                  .join("")}</ul>`
          }
          <h3>Releases</h3>
          ${
            releases.length === 0
              ? "<p class=\"muted\">尚无 Release。</p>"
              : `<ul>${releases
                  .map(
                    (item) =>
                      `<li>${escapeHtml(item.kind)} · ${escapeHtml(item.status)} · ${escapeHtml(item.artifact_digest.value)}</li>`
                  )
                  .join("")}</ul>`
          }
          <h3>Deployments</h3>
          ${
            deployments.length === 0
              ? "<p class=\"muted\">尚无 Deployment。</p>"
              : `<ul>${deployments
                  .map((item) => `<li>${escapeHtml(item.id)} · ${escapeHtml(item.status)}</li>`)
                  .join("")}</ul>`
          }
          <h3>Unknown operations</h3>
          ${
            unknown.length === 0
              ? "<p class=\"muted\">没有未知外部操作。</p>"
              : `<ul>${unknown
                  .map((item) => `<li>${escapeHtml(item.operation_key)} · ${escapeHtml(item.operation_kind)}</li>`)
                  .join("")}</ul>`
          }
          <h3>Recovery</h3>
          ${
            recoveries.length === 0
              ? "<p class=\"muted\">没有 Recovery Execution。</p>"
              : `<ul>${recoveries
                  .map((item) => `<li>${escapeHtml(item.id)} · ${escapeHtml(item.status)}</li>`)
                  .join("")}</ul>`
          }
          <p class="muted">操作数 ${operations.length}</p>
        `;
      })()}
    </article>
    <article class="card">
      <h2>Activity</h2>
      <p class="muted">${view === "run" ? "Technical logs" : "lifecycle"}</p>
      ${
        view === "run"
          ? context.kernel
              .listWorkItemsByChange(change.id)
              .flatMap((item) => context.kernel.listAgentRuns(item.id))
              .map((run) => `<p>log ${escapeHtml(run.log_reference)}</p>`)
              .join("") || "<p class=\"muted\">尚无技术日志引用。</p>"
          : activity.length === 0
            ? "<p class=\"muted\">尚无 Activity。</p>"
            : `<ol>${activity
                .map((item) => `<li>${escapeHtml(item.event_type)} · ${escapeHtml(item.summary)}</li>`)
                .join("")}</ol>`
      }
    </article>
    <article class="card">
      <h2>Repair lineage</h2>
      ${
        context.kernel.listRepairWorkItemLinksByChange(change.id).length === 0
          ? "<p class=\"muted\">没有 Repair。</p>"
          : `<ul>${context.kernel
              .listRepairWorkItemLinksByChange(change.id)
              .map(
                (link) =>
                  `<li>failed ${escapeHtml(link.failed_evidence_id)} → repair ${escapeHtml(link.repair_work_item_id)}</li>`
              )
              .join("")}</ul>`
      }
    </article>`,
    workbenchStyles
  );
};

export const renderError = (status: number, message: string): string =>
  page(`错误 ${status}`, `<article class="card"><h1>无法完成该操作</h1><p>${escapeHtml(message)}</p></article>`, workbenchStyles);

export interface DecisionForm {
  token: string;
  expected_revision: string;
  acting_role_id: string;
  outcome: string;
  reason: string;
  feedback: string;
}

export const submitDecisionForm = (
  context: WorkbenchContext,
  requestId: string,
  form: DecisionForm
): { status: number; location?: string; body?: string } => {
  if (form.token !== context.token) {
    return { status: 403, body: renderError(403, "请求未被授权") };
  }
  const request = context.kernel.getDecisionRequest(requestId as InternalId);
  if (isDomainError(request)) {
    return { status: 404, body: renderError(404, "未找到 Decision Request") };
  }
  const expectedRevision = Number(form.expected_revision);
  const outcome = form.outcome as DecisionOutcome;
  const result = context.kernel.execute({
    schema_version: SCHEMA_VERSION,
    command_id: createInternalId(),
    correlation_id: createInternalId(),
    command_type: "SubmitDecision",
    requested_at: context.now(),
    project_id: context.projectId,
    actor_id: context.actorId,
    expected_revision: expectedRevision,
    source: { origin: "human_cli", producer: "cimiloop-workbench" },
    payload: {
      request_id: request.request.id,
      outcome,
      acting_role_id: form.acting_role_id,
      reason: form.reason,
      ...(outcome === "request_changes"
        ? { feedback: [{ category: "other" as const, body: form.feedback || "需要补充。" }] }
        : {})
    }
  });
  if (isDomainError(result)) {
    if (result.code === "REVISION_CONFLICT") {
      return { status: 409, body: renderError(409, "目标已被其他命令修改，请刷新后重试") };
    }
    return { status: 400, body: renderError(400, result.message) };
  }
  return { status: 303, location: `/changes/${request.request.change_id}` };
};
