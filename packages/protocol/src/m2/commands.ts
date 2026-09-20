import { Type, type Static } from "typebox";
import {
  CreateChangeCommandSchema,
  InitializeProjectCommandSchema,
  InternalIdSchema,
  PauseChangeCommandSchema,
  ResumeChangeCommandSchema,
  mutatingCommandSchema
} from "../schemas.js";
import { DigestSchema } from "../m1/common.js";
import {
  BootstrapSoloGovernanceCommandSchema,
  RequestIntentDecisionCommandSchema,
  RequestPlanDecisionCommandSchema,
  SubmitContractAmendmentCommandSchema,
  SubmitContractCandidateCommandSchema,
  SubmitDecisionCommandSchema,
  SubmitPlanAmendmentCommandSchema,
  SubmitPlanCandidateCommandSchema
} from "../m1/commands.js";
import { ContentReferenceSchema, GitShaSchema, SnapshotKindSchema } from "./common.js";

export const CreatePlanningWorkItemCommandSchema = mutatingCommandSchema(
  "CreatePlanningWorkItem",
  Type.Object({ change_id: InternalIdSchema }, { additionalProperties: false })
);

export const CreateExecutionWorkItemsCommandSchema = mutatingCommandSchema(
  "CreateExecutionWorkItems",
  Type.Object({ change_id: InternalIdSchema }, { additionalProperties: false })
);

export const ClaimWorkItemCommandSchema = mutatingCommandSchema(
  "ClaimWorkItem",
  Type.Object({ work_item_id: InternalIdSchema }, { additionalProperties: false })
);

export const StartRunCommandSchema = mutatingCommandSchema(
  "StartRun",
  Type.Object(
    {
      work_item_id: InternalIdSchema,
      context_pack_id: InternalIdSchema,
      binding_id: InternalIdSchema
    },
    { additionalProperties: false }
  )
);

export const HeartbeatRunCommandSchema = mutatingCommandSchema(
  "HeartbeatRun",
  Type.Object({ run_id: InternalIdSchema }, { additionalProperties: false })
);

export const CompleteRunCommandSchema = mutatingCommandSchema(
  "CompleteRun",
  Type.Object(
    {
      run_id: InternalIdSchema,
      summary: Type.String({ minLength: 1, maxLength: 2000 }),
      log_reference: ContentReferenceSchema,
      log_digest: DigestSchema
    },
    { additionalProperties: false }
  )
);

export const FailRunCommandSchema = mutatingCommandSchema(
  "FailRun",
  Type.Object(
    {
      run_id: InternalIdSchema,
      summary: Type.String({ minLength: 1, maxLength: 2000 }),
      failure_code: Type.String({ pattern: "^[A-Z][A-Z0-9_]+$" }),
      log_reference: Type.Optional(ContentReferenceSchema),
      log_digest: Type.Optional(DigestSchema)
    },
    { additionalProperties: false }
  )
);

export const CancelRunCommandSchema = mutatingCommandSchema(
  "CancelRun",
  Type.Object(
    {
      run_id: InternalIdSchema,
      reason: Type.String({ minLength: 1, maxLength: 1000 })
    },
    { additionalProperties: false }
  )
);

export const RecordSourceSnapshotCommandSchema = mutatingCommandSchema(
  "RecordSourceSnapshot",
  Type.Object(
    {
      run_id: InternalIdSchema,
      snapshot_kind: SnapshotKindSchema,
      dirty: Type.Boolean(),
      commit_sha: Type.Optional(GitShaSchema),
      tree_sha: Type.Optional(GitShaSchema),
      digest: DigestSchema,
      content_reference: ContentReferenceSchema
    },
    { additionalProperties: false }
  )
);

export const RecordArtifactCommandSchema = mutatingCommandSchema(
  "RecordArtifact",
  Type.Object(
    {
      run_id: InternalIdSchema,
      source_snapshot_id: InternalIdSchema,
      context_pack_id: InternalIdSchema,
      binding_id: InternalIdSchema,
      digest: DigestSchema,
      content_reference: ContentReferenceSchema,
      summary: Type.String({ minLength: 1, maxLength: 2000 })
    },
    { additionalProperties: false }
  )
);

export const ReclaimExpiredLeaseCommandSchema = mutatingCommandSchema(
  "ReclaimExpiredLease",
  Type.Object({ lease_id: InternalIdSchema }, { additionalProperties: false })
);

export const AnyCommandSchema = Type.Union([
  InitializeProjectCommandSchema,
  CreateChangeCommandSchema,
  PauseChangeCommandSchema,
  ResumeChangeCommandSchema,
  BootstrapSoloGovernanceCommandSchema,
  SubmitContractCandidateCommandSchema,
  RequestIntentDecisionCommandSchema,
  SubmitDecisionCommandSchema,
  SubmitContractAmendmentCommandSchema,
  SubmitPlanCandidateCommandSchema,
  RequestPlanDecisionCommandSchema,
  SubmitPlanAmendmentCommandSchema,
  CreatePlanningWorkItemCommandSchema,
  CreateExecutionWorkItemsCommandSchema,
  ClaimWorkItemCommandSchema,
  StartRunCommandSchema,
  HeartbeatRunCommandSchema,
  CompleteRunCommandSchema,
  FailRunCommandSchema,
  CancelRunCommandSchema,
  RecordSourceSnapshotCommandSchema,
  RecordArtifactCommandSchema,
  ReclaimExpiredLeaseCommandSchema
]);

export const m2CommandSchemas = {
  CreatePlanningWorkItemCommand: CreatePlanningWorkItemCommandSchema,
  CreateExecutionWorkItemsCommand: CreateExecutionWorkItemsCommandSchema,
  ClaimWorkItemCommand: ClaimWorkItemCommandSchema,
  StartRunCommand: StartRunCommandSchema,
  HeartbeatRunCommand: HeartbeatRunCommandSchema,
  CompleteRunCommand: CompleteRunCommandSchema,
  FailRunCommand: FailRunCommandSchema,
  CancelRunCommand: CancelRunCommandSchema,
  RecordSourceSnapshotCommand: RecordSourceSnapshotCommandSchema,
  RecordArtifactCommand: RecordArtifactCommandSchema,
  ReclaimExpiredLeaseCommand: ReclaimExpiredLeaseCommandSchema,
  AnyCommand: AnyCommandSchema
} as const;

export type CreatePlanningWorkItemCommand = Static<typeof CreatePlanningWorkItemCommandSchema>;
export type CreateExecutionWorkItemsCommand = Static<typeof CreateExecutionWorkItemsCommandSchema>;
export type ClaimWorkItemCommand = Static<typeof ClaimWorkItemCommandSchema>;
export type StartRunCommand = Static<typeof StartRunCommandSchema>;
export type HeartbeatRunCommand = Static<typeof HeartbeatRunCommandSchema>;
export type CompleteRunCommand = Static<typeof CompleteRunCommandSchema>;
export type FailRunCommand = Static<typeof FailRunCommandSchema>;
export type CancelRunCommand = Static<typeof CancelRunCommandSchema>;
export type RecordSourceSnapshotCommand = Static<typeof RecordSourceSnapshotCommandSchema>;
export type RecordArtifactCommand = Static<typeof RecordArtifactCommandSchema>;
export type ReclaimExpiredLeaseCommand = Static<typeof ReclaimExpiredLeaseCommandSchema>;
export type AnyCommand = Static<typeof AnyCommandSchema>;
