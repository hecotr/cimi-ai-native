import type {
  Change,
  ChangeRoomView,
  DecisionInboxItem,
  DecisionInboxResult,
  DecisionRequest,
  EventEnvelope,
  TimelineEventSummary,
  TimelineResult
} from "@cimiloop/protocol";

export interface InboxAssignment {
  actor_id: string;
  role_key: string;
}

export interface InboxRequest {
  id: string;
  change_id: string;
  request_type: DecisionRequest["request_type"];
  required_role_key: DecisionRequest["required_role_key"];
  status: DecisionRequest["status"];
  created_at: string;
}

export interface InboxChange {
  id: string;
  display_key: string;
  title: string;
}

export interface InboxFacts {
  actorId: string;
  assignments: InboxAssignment[];
  requests: InboxRequest[];
  changes: InboxChange[];
}

export interface RoomFacts {
  change: Change;
  contract?: { domain_version: number; intent: string };
  plan?: { domain_version: number; summary: string };
  openRequests: Array<{ id: string; request_type: DecisionRequest["request_type"] }>;
  decisionIds: string[];
  feedbackIds: string[];
  timelineEventIds: string[];
}

const inboxSummary = (requestType: DecisionRequest["request_type"]): string =>
  requestType === "intent" ? "待批准 Feature Contract" : "待批准 Feature Plan";

const eventSummary = (eventType: string): string => {
  switch (eventType) {
    case "ChangeCreated":
      return "创建 Draft Change";
    case "SoloGovernanceBootstrapped":
      return "完成 Solo 治理初始化";
    case "ContractCandidateSubmitted":
      return "提交 Contract Candidate";
    case "IntentDecisionRequested":
      return "请求 Intent Decision";
    case "DecisionSubmitted":
      return "提交 Decision";
    case "PlanCandidateSubmitted":
      return "提交 Plan Candidate";
    case "PlanDecisionRequested":
      return "请求 Plan Decision";
    case "ContractAmendmentSubmitted":
      return "提交 Contract Amendment";
    case "PlanAmendmentSubmitted":
      return "提交 Plan Amendment";
    default:
      return eventType;
  }
};

export const changeFocus = (
  change: Change,
  openRequests: Array<{ request_type: DecisionRequest["request_type"] }>,
  hasPlan: boolean
): { focus: string; next_action: string } => {
  const openIntent = openRequests.some((request) => request.request_type === "intent");
  const openPlan = openRequests.some((request) => request.request_type === "plan");
  if (openPlan) return { focus: "Plan Decision", next_action: "Technical Owner 批准 Plan" };
  if (openIntent) return { focus: "Intent Decision", next_action: "Intent Owner 批准 Contract" };
  if (change.lifecycle_state === "Planned") {
    return { focus: "Execution Plan", next_action: "等待后续执行授权" };
  }
  if (change.lifecycle_state === "IntentReady") {
    return hasPlan
      ? { focus: "Plan Decision", next_action: "请求 Plan Decision" }
      : { focus: "Plan Candidate", next_action: "提交 Plan Candidate" };
  }
  return { focus: "Intent Decision", next_action: "请求 Intent Decision" };
};

export class ReadModelBuilder {
  buildInbox(facts: InboxFacts): DecisionInboxResult {
    const roleKeys = new Set(
      facts.assignments.filter((assignment) => assignment.actor_id === facts.actorId).map((item) => item.role_key)
    );
    const items: DecisionInboxItem[] = facts.requests
      .filter((request) => request.status === "open" && roleKeys.has(request.required_role_key))
      .map((request) => {
        const change = facts.changes.find((item) => item.id === request.change_id);
        return {
          request_id: request.id,
          change_id: request.change_id,
          display_key: change?.display_key ?? "CHG-0000",
          request_type: request.request_type,
          required_role_key: request.required_role_key,
          status: "open" as const,
          created_at: request.created_at,
          summary: inboxSummary(request.request_type)
        };
      });
    return { ok: true, items };
  }

  buildRoom(facts: RoomFacts): ChangeRoomView {
    const focus = changeFocus(facts.change, facts.openRequests, Boolean(facts.plan));
    return {
      change_id: facts.change.id,
      display_key: facts.change.display_key,
      title: facts.change.title,
      lifecycle_state: facts.change.lifecycle_state,
      operating_status: facts.change.operating_status,
      focus: focus.focus,
      next_action: focus.next_action,
      ...(facts.contract ? { contract: facts.contract } : {}),
      ...(facts.plan ? { plan: facts.plan } : {}),
      open_request_ids: facts.openRequests.map((request) => request.id),
      decision_ids: facts.decisionIds,
      feedback_ids: facts.feedbackIds,
      timeline_event_ids: facts.timelineEventIds
    };
  }

  buildTimeline(events: EventEnvelope[], changeId: string): TimelineResult {
    const summaries: TimelineEventSummary[] = events
      .filter(
        (event) => event.aggregate.id === changeId || event.payload.change_id === changeId
      )
      .sort((left, right) => left.event_sequence - right.event_sequence)
      .map((event) => ({
        event_id: event.event_id,
        event_type: event.event_type,
        event_sequence: event.event_sequence,
        occurred_at: event.occurred_at,
        summary: eventSummary(event.event_type)
      }));
    return { ok: true, events: summaries };
  }
}
