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
    `<h1>Decision Inbox</h1>${inboxCards || "<p class=\"muted\">当前没有待处理 Decision。</p>"}
     <h1>Changes</h1>${changeCards || "<p class=\"muted\">当前没有 Change。</p>"}`,
    workbenchStyles
  );
};

export const renderChangeRoom = (context: WorkbenchContext, idOrKey: string): string | undefined => {
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
  return page(
    `${change.display_key} ${change.title}`,
    `<article class="card">
      <h1>${escapeHtml(change.display_key)} ${escapeHtml(change.title)}</h1>
      <p>生命周期：${escapeHtml(change.lifecycle_state)} · Revision ${change.revision}</p>
      <p>焦点：${escapeHtml(room.room.focus)}</p>
      <p>下一动作：${escapeHtml(room.room.next_action)}</p>
    </article>
    ${forms}`,
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
