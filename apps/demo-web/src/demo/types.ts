export type DemoScene =
  | "workbench"
  | "create_change"
  | "draft_clarify"
  | "contract_decision"
  | "agent_running"
  | "evaluation_failed"
  | "repair_verified"
  | "release_decision"
  | "delivery_closed";

export type DemoCommand =
  | { type: "START_CREATE" }
  | { type: "OPEN_CHANGE" }
  | { type: "START_CLARIFICATION" }
  | { type: "APPROVE_CONTRACT" }
  | { type: "COMPLETE_AGENT_RUN" }
  | { type: "START_REPAIR" }
  | { type: "COMPLETE_REPAIR" }
  | { type: "SUBMIT_RELEASE" }
  | { type: "APPROVE_RELEASE"; artifactDigest?: string; artifactId?: string; environment?: string }
  | { type: "COMPLETE_DEPLOYMENT" }
  | { type: "REQUEST_CONTRACT_CHANGES" }
  | { type: "REJECT_CONTRACT" }
  | { type: "REQUEST_RELEASE_CHANGES" }
  | { type: "REJECT_RELEASE" }
  | { type: "CREATE_DRAFT_CHANGE"; input: DraftChangeInput }
  | { type: "RESET_DEMO" }
  | { type: "JUMP_TO_SCENE"; scene: DemoScene };

export type LifecycleState =
  | "Draft"
  | "IntentReady"
  | "Planned"
  | "Executing"
  | "Evaluating"
  | "TestDeploying"
  | "TestValidating"
  | "ReleaseReady"
  | "ProductionDeploying"
  | "ReleaseVerified"
  | "DeliveryClosed";

export type FlowCondition =
  | "Active"
  | "AwaitingDecision"
  | "Paused"
  | "Blocked"
  | "Failed"
  | "Completed";

export type DeliveryStatus =
  | "NotStarted"
  | "Implemented"
  | "TestVerified"
  | "ProductionVerified"
  | "Closed";

export type OutcomeStatus = "Unknown" | "Observed" | "Verified";

export type ClaimStatus = "Pending" | "Satisfied" | "Refuted" | "Insufficient" | "Conflicted";

export type EvidencePolarity = "Supports" | "Refutes" | "Inconclusive";

export type AttentionKind = "create" | "decision" | "blocker" | "run" | "other";

export type ChangeRoomTab =
  | "overview"
  | "contract"
  | "plan"
  | "evidence"
  | "delivery"
  | "activity";

export type ActingRole = "Technical Owner" | "Release Owner";

export type GateVerdict = "ALLOW" | "NEED_MORE_EVIDENCE" | "REQUIRE_HUMAN" | "DENY" | "PENDING";

export interface DraftChangeInput {
  title: string;
  request: string;
  source: string;
  owner: string;
  profile: string;
  urgency: string;
  impact: string;
}

export interface DraftChange extends DraftChangeInput {
  id: string;
  displayKey: string;
  createdAt: string;
}

export interface ProjectInfo {
  name: string;
  mode: string;
  currentUser: string;
  actingRoles: ActingRole[];
  environments: string[];
}

export interface ChangeRoles {
  changeOwner: string;
  intentOwner: string;
  technicalOwner: string;
  releaseOwner: string;
}

export interface ChangeSummary {
  id: string;
  displayKey: string;
  title: string;
  profile: string;
  owner: string;
  risk: string;
  riskDetail: string;
  lifecycleState: LifecycleState;
  flowCondition: FlowCondition;
  nextAction: string;
  environment?: string;
}

export interface ContractSummary {
  id: string;
  version: string;
  goal: string;
  scope: string[];
  nonGoals: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  status: "None" | "Candidate" | "Approved";
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
}

export interface PlanTask {
  id: string;
  title: string;
  status: "Pending" | "Ready" | "Running" | "Done" | "Blocked";
  dependsOn: string[];
}

export interface PlanSummary {
  id: string;
  version: string;
  status: "None" | "Candidate" | "Approved";
  tasks: PlanTask[];
}

export interface EvidenceRecord {
  id: string;
  title: string;
  polarity: EvidencePolarity;
  claimId: string;
  contractVersion: string;
  artifactId?: string;
  artifactDigest?: string;
  environment?: string;
  observedAt: string;
}

export interface ClaimRecord {
  id: string;
  title: string;
  acceptanceCriterionId: string;
  status: ClaimStatus;
  required: boolean;
  gap?: string;
  consequence?: string;
  evidenceIds: string[];
}

export interface WorkItemRecord {
  id: string;
  title: string;
  kind: "Implementation" | "Repair";
  goal: string;
  authorization: string;
  contextPack: string;
  capabilityBinding: string;
  status: "Ready" | "Running" | "Succeeded" | "Blocked";
}

export interface AgentRunRecord {
  id: string;
  workItemId: string;
  status: "Queued" | "Running" | "Succeeded" | "Failed";
  duration: string;
  budget: string;
  retries: number;
  logSummary: string[];
  commands: string[];
  tools: string[];
  contextPack: string;
  error?: string;
}

export interface ArtifactRecord {
  id: string;
  digest: string;
  source: string;
  buildStatus: string;
  evaluationStatus: string;
}

export interface ReleaseRecord {
  id: string;
  artifactId: string;
  artifactDigest: string;
  environment: string;
  scope: string;
  window: string;
  recoveryStrategy: string[];
  approvalStatus: "NotRequested" | "Pending" | "Approved" | "Rejected";
}

export interface DeploymentRecord {
  id: string;
  environment: string;
  externalStatus: string;
  digestMatched: boolean;
  healthCheckPassed: boolean;
  corePathPassed: boolean;
  completed: boolean;
}

export interface DecisionRequest {
  id: string;
  changeId: string;
  changeDisplayKey: string;
  title: string;
  question: string;
  actingRole: ActingRole;
  objectType: "Contract" | "Release";
  objectVersion: string;
  artifactId?: string;
  artifactDigest?: string;
  environment?: string;
  recommendation: string;
  recommendationLabel: "建议";
  supporting: string[];
  opposing: string[];
  gaps: string[];
  risk: string;
  policy: string;
  residualIssues: string[];
  recoveryStrategy: string[];
  expiresAt: string;
  expired: boolean;
  consequences: {
    approve: string;
    requestChanges: string;
    reject: string;
  };
}

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  changeId: string;
  displayKey: string;
  title: string;
  reason: string;
  role: string;
  nextAction: string;
  priority: number;
}

export interface TimelineEvent {
  id: string;
  at: string;
  title: string;
  detail: string;
  category:
    | "change"
    | "contract"
    | "plan"
    | "run"
    | "evaluation"
    | "repair"
    | "evidence"
    | "release"
    | "deployment"
    | "closure";
  runId?: string;
}

export interface CurrentFocus {
  happening: string;
  whyHere: string;
  satisfiedGates: string[];
  missing: string[];
  nextState: string;
  primaryAction: string;
  primaryCommand:
    | "START_CREATE"
    | "CREATE_DRAFT_CHANGE"
    | "START_CLARIFICATION"
    | "OPEN_CHANGE"
    | "APPROVE_CONTRACT"
    | "COMPLETE_AGENT_RUN"
    | "START_REPAIR"
    | "COMPLETE_REPAIR"
    | "SUBMIT_RELEASE"
    | "APPROVE_RELEASE"
    | "COMPLETE_DEPLOYMENT"
    | "VIEW_TIMELINE"
    | null;
}

export interface StructuredEvent {
  headline: string;
  lines: string[];
}

export interface ActiveEnvironment {
  id: string;
  purpose: string;
  occupancy: string;
  status: string;
}

export interface DemoState {
  scene: DemoScene;
  revision: number;
  lastUpdatedAt: string;
  actingRole: ActingRole;
  project: ProjectInfo;
  mainChange: ChangeSummary;
  roles: ChangeRoles;
  contract: ContractSummary;
  plan: PlanSummary;
  claims: ClaimRecord[];
  evidence: EvidenceRecord[];
  workItems: WorkItemRecord[];
  runs: AgentRunRecord[];
  artifact: ArtifactRecord | null;
  release: ReleaseRecord;
  deployment: DeploymentRecord | null;
  decisionRequest: DecisionRequest | null;
  inbox: DecisionRequest[];
  attention: AttentionItem[];
  changes: ChangeSummary[];
  timeline: TimelineEvent[];
  currentFocus: CurrentFocus;
  gateVerdict: GateVerdict;
  lifecycleStage: number;
  preferredTab: ChangeRoomTab;
  openDecision: boolean;
  repairStarted: boolean;
  releaseApproved: boolean;
  lastEvent: StructuredEvent | null;
  lastRejection: string | null;
  draftChange: DraftChange | null;
}

export interface ReduceResult {
  state: DemoState;
  rejection: string | null;
  event: StructuredEvent | null;
}

export interface SceneMeta {
  id: DemoScene;
  index: number;
  name: string;
  nameZh: string;
  path: string;
  tab: ChangeRoomTab;
  openDecision: boolean;
  narration: string;
}
