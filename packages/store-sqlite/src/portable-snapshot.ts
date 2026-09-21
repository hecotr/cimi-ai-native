import { SCHEMA_VERSION, type EventEnvelope, type InternalId } from "@cimiloop/protocol";
import type { OutboxMessage, PortableFact, StoreTransaction } from "@cimiloop/store";
import type { DatabaseSync } from "node:sqlite";

type SqlRow = Record<string, unknown>;

const PAYLOAD_TABLES: ReadonlyArray<{ table: string; objectType: string }> = [
  { table: "projects", objectType: "project" },
  { table: "actors", objectType: "actor" },
  { table: "roles", objectType: "role" },
  { table: "assignments", objectType: "assignment" },
  { table: "changes", objectType: "change" },
  { table: "transition_records", objectType: "transition" },
  { table: "change_profiles", objectType: "change_profile" },
  { table: "project_policies", objectType: "project_policy" },
  { table: "policy_snapshots", objectType: "policy_snapshot" },
  { table: "contract_candidates", objectType: "contract_candidate" },
  { table: "contract_versions", objectType: "contract_version" },
  { table: "contract_amendments", objectType: "contract_amendment" },
  { table: "risk_profiles", objectType: "risk_profile" },
  { table: "risk_assessments", objectType: "risk_assessment" },
  { table: "knowledge_impact_assessments", objectType: "knowledge_impact" },
  { table: "plan_candidates", objectType: "plan_candidate" },
  { table: "plan_versions", objectType: "plan_version" },
  { table: "plan_amendments", objectType: "plan_amendment" },
  { table: "tasks", objectType: "task" },
  { table: "decision_requests", objectType: "decision_request" },
  { table: "decisions", objectType: "decision" },
  { table: "feedback", objectType: "feedback" },
  { table: "gate_evaluations", objectType: "gate_evaluation" },
  { table: "work_items", objectType: "work_item" },
  { table: "leases", objectType: "lease" },
  { table: "resource_locks", objectType: "resource_lock" },
  { table: "provider_descriptors", objectType: "provider" },
  { table: "context_pack_manifests", objectType: "context_pack" },
  { table: "capability_bindings", objectType: "capability_binding" },
  { table: "agent_runs", objectType: "agent_run" },
  { table: "source_snapshots", objectType: "source_snapshot" },
  { table: "artifacts", objectType: "artifact" },
  { table: "artifact_lineage", objectType: "artifact_lineage" },
  { table: "blockers", objectType: "blocker" },
  { table: "claims", objectType: "claim" },
  { table: "external_references", objectType: "external_reference" },
  { table: "evidence", objectType: "evidence" },
  { table: "gate_requirement_sets", objectType: "requirement_set" },
  { table: "independent_evaluations", objectType: "independent_evaluation" },
  { table: "claim_assessments", objectType: "claim_assessment" },
  { table: "evidence_package_manifests", objectType: "evidence_package" },
  { table: "impact_assessments", objectType: "impact_assessment" },
  { table: "repair_work_item_links", objectType: "repair_link" },
  { table: "environments", objectType: "environment" },
  { table: "releases", objectType: "release" },
  { table: "recovery_strategies", objectType: "recovery_strategy" },
  { table: "release_packages", objectType: "release_package" },
  { table: "deployments", objectType: "deployment" },
  { table: "deployment_attempts", objectType: "deployment_attempt" },
  { table: "verification_results", objectType: "verification_result" },
  { table: "recovery_executions", objectType: "recovery_execution" },
  { table: "external_operations", objectType: "external_operation" },
  { table: "reconciliations", objectType: "reconciliation" },
  { table: "learning_candidates", objectType: "learning_candidate" },
  { table: "knowledge_update_evidence", objectType: "knowledge_update" },
  { table: "closure_evaluations", objectType: "closure_evaluation" },
  { table: "archive_records", objectType: "archive_record" },
  { table: "cancellation_records", objectType: "cancellation_record" },
  { table: "supersession_records", objectType: "supersession_record" }
];

const IMPORT_ORDER = PAYLOAD_TABLES.map((item) => item.objectType);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("portable payload must be an object");
  }
  return value as Record<string, unknown>;
};

const domainVersionOf = (payload: Record<string, unknown>, fallback?: number): number | undefined => {
  if (typeof payload.revision === "number") return payload.revision;
  if (typeof payload.domain_version === "number") return payload.domain_version;
  if (typeof payload.event_sequence === "number") return payload.event_sequence;
  return fallback;
};

export const listPortableFacts = (database: DatabaseSync): PortableFact[] => {
  const facts: PortableFact[] = [];
  for (const { table, objectType } of PAYLOAD_TABLES) {
    const exists = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) as SqlRow | undefined;
    if (!exists) continue;
    const rows = database.prepare(`SELECT payload_json FROM ${table}`).all() as SqlRow[];
    for (const row of rows) {
      const payload = asRecord(JSON.parse(String(row.payload_json)));
      const id = String(payload.id ?? "");
      if (!id) continue;
      const version = domainVersionOf(payload);
      facts.push({
        object_type: objectType,
        schema_version: String(payload.schema_version ?? SCHEMA_VERSION),
        id,
        ...(version ? { domain_version: version } : {}),
        payload
      });
    }
  }
  const events = database.prepare("SELECT envelope_json FROM event_ledger ORDER BY event_sequence").all() as SqlRow[];
  for (const row of events) {
    const payload = asRecord(JSON.parse(String(row.envelope_json)));
    facts.push({
      object_type: "event",
      schema_version: String(payload.schema_version ?? SCHEMA_VERSION),
      id: String(payload.event_id),
      domain_version: Number(payload.event_sequence),
      payload
    });
  }
  const outbox = database.prepare("SELECT * FROM outbox_messages ORDER BY created_at").all() as SqlRow[];
  for (const row of outbox) {
    const payload = {
      id: String(row.id),
      project_id: String(row.project_id),
      event_id: String(row.event_id),
      status: String(row.status),
      attempt_count: Number(row.attempt_count),
      available_at: String(row.available_at),
      ...(row.lease_until ? { lease_until: String(row.lease_until) } : {}),
      created_at: String(row.created_at),
      ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
    };
    facts.push({
      object_type: "outbox_message",
      schema_version: SCHEMA_VERSION,
      id: payload.id,
      payload
    });
  }
  return facts;
};

export const listOutboxRows = (database: DatabaseSync): OutboxMessage[] => {
  const rows = database.prepare("SELECT * FROM outbox_messages ORDER BY created_at").all() as SqlRow[];
  return rows.map((row) => ({
    id: String(row.id) as InternalId,
    project_id: String(row.project_id) as InternalId,
    event_id: String(row.event_id) as InternalId,
    status: String(row.status) as OutboxMessage["status"],
    attempt_count: Number(row.attempt_count),
    available_at: String(row.available_at),
    ...(row.lease_until ? { lease_until: String(row.lease_until) } : {}),
    created_at: String(row.created_at),
    ...(row.delivered_at ? { delivered_at: String(row.delivered_at) } : {})
  }));
};

const insertByType = (transaction: StoreTransaction, fact: PortableFact): void => {
  const payload = fact.payload;
  switch (fact.object_type) {
    case "project":
      transaction.insertProject(payload as never);
      return;
    case "actor":
      transaction.insertActor(payload as never);
      return;
    case "role":
      transaction.insertRole(payload as never);
      return;
    case "assignment":
      transaction.insertAssignment(payload as never);
      return;
    case "change":
      transaction.insertChange(payload as never);
      return;
    case "transition":
      transaction.insertTransition(payload as never);
      return;
    case "change_profile":
      transaction.insertChangeProfile(payload as never);
      return;
    case "project_policy":
      transaction.insertProjectPolicy(payload as never);
      return;
    case "policy_snapshot":
      transaction.insertPolicySnapshot(payload as never);
      return;
    case "contract_candidate":
      transaction.insertContractCandidate(payload as never);
      return;
    case "contract_version":
      transaction.insertContractVersion(payload as never);
      return;
    case "contract_amendment":
      transaction.insertContractAmendment(payload as never);
      return;
    case "risk_profile":
      transaction.insertRiskProfile(payload as never);
      return;
    case "risk_assessment":
      transaction.insertRiskAssessment(payload as never);
      return;
    case "knowledge_impact":
      transaction.insertKnowledgeImpactAssessment(payload as never);
      return;
    case "plan_candidate":
      transaction.insertPlanCandidate(payload as never);
      return;
    case "plan_version":
      transaction.insertPlanVersion(payload as never);
      return;
    case "plan_amendment":
      transaction.insertPlanAmendment(payload as never);
      return;
    case "task":
      transaction.insertTask(payload as never);
      return;
    case "decision_request":
      transaction.insertDecisionRequest(payload as never);
      return;
    case "decision":
      transaction.insertDecision(payload as never);
      return;
    case "feedback":
      transaction.insertFeedback(payload as never);
      return;
    case "gate_evaluation":
      transaction.insertGateEvaluation(payload as never);
      return;
    case "work_item":
      transaction.insertWorkItem(payload as never);
      return;
    case "lease":
      transaction.insertLease(payload as never);
      return;
    case "resource_lock":
      transaction.insertResourceLock(payload as never);
      return;
    case "provider":
      transaction.insertProviderDescriptor(payload as never);
      return;
    case "context_pack":
      transaction.insertContextPackManifest(payload as never);
      return;
    case "capability_binding":
      transaction.insertCapabilityBinding(payload as never);
      return;
    case "agent_run":
      transaction.insertAgentRun(payload as never);
      return;
    case "source_snapshot":
      transaction.insertSourceSnapshot(payload as never);
      return;
    case "artifact":
      transaction.insertArtifact(payload as never);
      return;
    case "artifact_lineage":
      transaction.insertArtifactLineage(payload as never);
      return;
    case "blocker":
      transaction.insertBlocker(payload as never);
      return;
    case "claim":
      transaction.insertClaim(payload as never);
      return;
    case "external_reference":
      transaction.insertExternalReference(payload as never);
      return;
    case "evidence":
      transaction.insertEvidence(payload as never);
      return;
    case "requirement_set":
      transaction.insertGateRequirementSet(payload as never);
      return;
    case "independent_evaluation":
      transaction.insertIndependentEvaluation(payload as never);
      return;
    case "claim_assessment":
      transaction.insertClaimAssessment(payload as never);
      return;
    case "evidence_package":
      transaction.insertEvidencePackageManifest(payload as never);
      return;
    case "impact_assessment":
      transaction.insertImpactAssessment(payload as never);
      return;
    case "repair_link":
      transaction.insertRepairWorkItemLink(payload as never);
      return;
    case "environment":
      transaction.insertEnvironment(payload as never);
      return;
    case "release":
      transaction.insertRelease(payload as never);
      return;
    case "recovery_strategy":
      transaction.insertRecoveryStrategy(payload as never);
      return;
    case "release_package":
      transaction.insertReleasePackage(payload as never);
      return;
    case "deployment":
      transaction.insertDeployment(payload as never);
      return;
    case "deployment_attempt":
      transaction.insertDeploymentAttempt(payload as never);
      return;
    case "verification_result":
      transaction.insertVerificationResult(payload as never);
      return;
    case "recovery_execution":
      transaction.insertRecoveryExecution(payload as never);
      return;
    case "external_operation":
      transaction.insertExternalOperation(payload as never);
      return;
    case "reconciliation":
      transaction.insertReconciliation(payload as never);
      return;
    case "learning_candidate":
      transaction.insertLearningCandidate(payload as never);
      return;
    case "knowledge_update":
      transaction.insertKnowledgeUpdateEvidence(payload as never);
      return;
    case "closure_evaluation":
      transaction.insertClosureEvaluation(payload as never);
      return;
    case "archive_record":
      transaction.insertArchiveRecord(payload as never);
      return;
    case "cancellation_record":
      transaction.insertCancellationRecord(payload as never);
      return;
    case "supersession_record":
      transaction.insertSupersessionRecord(payload as never);
      return;
    case "event":
      transaction.insertImportedEvent(payload as EventEnvelope);
      return;
    case "outbox_message":
      transaction.enqueueOutbox(payload as unknown as OutboxMessage);
      return;
    default:
      throw new Error(`unsupported portable object_type ${fact.object_type}`);
  }
};

export const importPortableSnapshot = (transaction: StoreTransaction, facts: readonly PortableFact[]): void => {
  const ranked = [...facts].sort((left, right) => {
    const leftRank = left.object_type === "event" ? 1_000 : left.object_type === "outbox_message" ? 1_001 : IMPORT_ORDER.indexOf(left.object_type);
    const rightRank = right.object_type === "event" ? 1_000 : right.object_type === "outbox_message" ? 1_001 : IMPORT_ORDER.indexOf(right.object_type);
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.object_type === "event") {
      return Number(left.payload.event_sequence ?? 0) - Number(right.payload.event_sequence ?? 0);
    }
    return left.id.localeCompare(right.id);
  });
  for (const fact of ranked) {
    insertByType(transaction, fact);
  }
  const project = ranked.find((item) => item.object_type === "project");
  if (project) {
    const changes = ranked.filter((item) => item.object_type === "change");
    const events = ranked.filter((item) => item.object_type === "event");
    const changeNumber = Math.max(
      0,
      ...changes.map((item) => Number(String(item.payload.display_key ?? "CHG-0").replace(/^CHG-/, "")) || 0)
    );
    const eventSequence = Math.max(0, ...events.map((item) => Number(item.payload.event_sequence ?? 0)));
    transaction.setProjectCounters(project.id as InternalId, {
      change_number: changeNumber,
      event_sequence: eventSequence
    });
  }
};
