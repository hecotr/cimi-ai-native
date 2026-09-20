import { Type, type Static, type TSchema } from "typebox";

export const SCHEMA_VERSION = "1.0.0" as const;

export const InternalIdSchema = Type.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
});

export const UtcTimestampSchema = Type.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$"
});

export const ObjectTypeSchema = Type.Union([
  Type.Literal("project"),
  Type.Literal("actor"),
  Type.Literal("role"),
  Type.Literal("assignment"),
  Type.Literal("change"),
  Type.Literal("transition_record"),
  Type.Literal("event"),
  Type.Literal("outbox_message"),
  Type.Literal("change_profile"),
  Type.Literal("project_policy"),
  Type.Literal("policy_snapshot"),
  Type.Literal("contract_candidate"),
  Type.Literal("contract_version"),
  Type.Literal("contract_amendment"),
  Type.Literal("risk_profile"),
  Type.Literal("risk_assessment"),
  Type.Literal("knowledge_impact_assessment"),
  Type.Literal("plan_candidate"),
  Type.Literal("plan_version"),
  Type.Literal("plan_amendment"),
  Type.Literal("task"),
  Type.Literal("decision_request"),
  Type.Literal("decision"),
  Type.Literal("feedback"),
  Type.Literal("gate_evaluation")
]);

export const TypedReferenceSchema = Type.Object(
  {
    object_type: ObjectTypeSchema,
    id: InternalIdSchema,
    domain_version: Type.Optional(Type.Integer({ minimum: 1 }))
  },
  { additionalProperties: false }
);

export const SourceDescriptorSchema = Type.Object(
  {
    origin: Type.Union([Type.Literal("human_cli"), Type.Literal("agent"), Type.Literal("system")]),
    producer: Type.String({ minLength: 1 }),
    repository_path: Type.Optional(Type.String({ minLength: 1 }))
  },
  { additionalProperties: false }
);

const CommonMetadata = {
  schema_version: Type.Literal(SCHEMA_VERSION),
  created_at: UtcTimestampSchema,
  revision: Type.Integer({ minimum: 1 })
};

export const ProjectSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    name: Type.String({ minLength: 1, maxLength: 200 }),
    repository_kind: Type.Union([Type.Literal("git"), Type.Literal("directory")]),
    repository_path: Type.String({ minLength: 1 }),
    instance_id: InternalIdSchema
  },
  { additionalProperties: false }
);

export const ActorSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    actor_type: Type.Union([Type.Literal("human"), Type.Literal("agent")]),
    display_name: Type.String({ minLength: 1, maxLength: 200 }),
    email: Type.Optional(Type.String({ minLength: 3, maxLength: 320 })),
    identity_source: Type.Union([Type.Literal("git_config"), Type.Literal("local_agent")])
  },
  { additionalProperties: false }
);

export const RoleSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    role_key: Type.Union([
      Type.Literal("project_owner"),
      Type.Literal("change_owner"),
      Type.Literal("intent_owner"),
      Type.Literal("technical_owner")
    ]),
    display_name: Type.String({ minLength: 1, maxLength: 200 })
  },
  { additionalProperties: false }
);

export const AssignmentSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    actor_id: InternalIdSchema,
    role_id: InternalIdSchema,
    scope_type: Type.Union([Type.Literal("project"), Type.Literal("change")]),
    scope_id: InternalIdSchema,
    effective_at: UtcTimestampSchema
  },
  { additionalProperties: false }
);

export const ChangeSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    display_key: Type.String({ pattern: "^CHG-\\d{4,}$" }),
    title: Type.String({ minLength: 1, maxLength: 300 }),
    lifecycle_state: Type.Union([
      Type.Literal("Draft"),
      Type.Literal("IntentReady"),
      Type.Literal("Planned")
    ]),
    operating_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
    owner_actor_id: InternalIdSchema,
    source: SourceDescriptorSchema,
    pause_reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    updated_at: UtcTimestampSchema
  },
  { additionalProperties: false }
);

const TransitionRecordBase = {
  schema_version: Type.Literal(SCHEMA_VERSION),
  id: InternalIdSchema,
  project_id: InternalIdSchema,
  change_id: InternalIdSchema,
  command_id: InternalIdSchema,
  reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
  actor_id: InternalIdSchema,
  occurred_at: UtcTimestampSchema
};

export const TransitionRecordSchema = Type.Union([
  Type.Object(
    {
      ...TransitionRecordBase,
      transition_type: Type.Union([Type.Literal("change_paused"), Type.Literal("change_resumed")]),
      from_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
      to_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")])
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      ...TransitionRecordBase,
      transition_type: Type.Literal("lifecycle_changed"),
      from_lifecycle: Type.Union([
        Type.Literal("Draft"),
        Type.Literal("IntentReady"),
        Type.Literal("Planned")
      ]),
      to_lifecycle: Type.Union([
        Type.Literal("Draft"),
        Type.Literal("IntentReady"),
        Type.Literal("Planned")
      ]),
      from_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
      to_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
      gate_evaluation_id: Type.Optional(InternalIdSchema),
      decision_id: Type.Optional(InternalIdSchema)
    },
    { additionalProperties: false }
  )
]);

export const EventEnvelopeSchema = Type.Object(
  {
    schema_version: Type.Literal(SCHEMA_VERSION),
    event_id: InternalIdSchema,
    event_type: Type.String({ minLength: 1 }),
    project_id: InternalIdSchema,
    aggregate: TypedReferenceSchema,
    aggregate_revision: Type.Integer({ minimum: 1 }),
    event_sequence: Type.Integer({ minimum: 1 }),
    occurred_at: UtcTimestampSchema,
    actor_id: InternalIdSchema,
    command_id: InternalIdSchema,
    correlation_id: InternalIdSchema,
    payload: Type.Record(Type.String(), Type.Unknown())
  },
  { additionalProperties: false }
);

export const DomainErrorSchema = Type.Object(
  {
    code: Type.String({ pattern: "^[A-Z][A-Z0-9_]+$" }),
    message: Type.String({ minLength: 1 }),
    category: Type.Union([
      Type.Literal("validation"),
      Type.Literal("not_found"),
      Type.Literal("conflict"),
      Type.Literal("forbidden"),
      Type.Literal("storage"),
      Type.Literal("internal")
    ]),
    retryable: Type.Boolean(),
    details: Type.Record(Type.String(), Type.Unknown()),
    correlation_id: InternalIdSchema
  },
  { additionalProperties: false }
);

export const CommandEnvelopeBaseSchema = Type.Object(
  {
    schema_version: Type.Literal(SCHEMA_VERSION),
    command_id: InternalIdSchema,
    correlation_id: InternalIdSchema,
    command_type: Type.String({ minLength: 1 }),
    requested_at: UtcTimestampSchema,
    actor_id: Type.Optional(InternalIdSchema),
    project_id: Type.Optional(InternalIdSchema),
    target: Type.Optional(TypedReferenceSchema),
    expected_revision: Type.Optional(Type.Integer({ minimum: 1 })),
    source: SourceDescriptorSchema,
    payload: Type.Record(Type.String(), Type.Unknown())
  },
  { additionalProperties: false }
);

export const commandSchema = <const TCommandType extends string, T extends TSchema>(
  commandType: TCommandType,
  payload: T
) =>
  Type.Object(
    {
      schema_version: Type.Literal(SCHEMA_VERSION),
      command_id: InternalIdSchema,
      correlation_id: InternalIdSchema,
      command_type: Type.Literal(commandType),
      requested_at: UtcTimestampSchema,
      actor_id: Type.Optional(InternalIdSchema),
      project_id: Type.Optional(InternalIdSchema),
      target: Type.Optional(TypedReferenceSchema),
      expected_revision: Type.Optional(Type.Integer({ minimum: 1 })),
      source: SourceDescriptorSchema,
      payload
    },
    { additionalProperties: false }
  );

export const mutatingCommandSchema = <const TCommandType extends string, T extends TSchema>(
  commandType: TCommandType,
  payload: T
) =>
  Type.Object(
    {
      schema_version: Type.Literal(SCHEMA_VERSION),
      command_id: InternalIdSchema,
      correlation_id: InternalIdSchema,
      command_type: Type.Literal(commandType),
      requested_at: UtcTimestampSchema,
      actor_id: InternalIdSchema,
      project_id: InternalIdSchema,
      target: Type.Optional(TypedReferenceSchema),
      expected_revision: Type.Integer({ minimum: 1 }),
      source: SourceDescriptorSchema,
      payload
    },
    { additionalProperties: false }
  );

export const InitializeProjectCommandSchema = commandSchema(
  "InitializeProject",
  Type.Object(
    {
      name: Type.String({ minLength: 1, maxLength: 200 }),
      repository_kind: Type.Union([Type.Literal("git"), Type.Literal("directory")]),
      repository_path: Type.String({ minLength: 1 }),
      owner_name: Type.String({ minLength: 1, maxLength: 200 }),
      owner_email: Type.Optional(Type.String({ minLength: 3, maxLength: 320 }))
    },
    { additionalProperties: false }
  )
);

export const CreateChangeCommandSchema = commandSchema(
  "CreateChange",
  Type.Object({ title: Type.String({ minLength: 1, maxLength: 300 }) }, { additionalProperties: false })
);

export const PauseChangeCommandSchema = commandSchema(
  "PauseChange",
  Type.Object({ reason: Type.String({ minLength: 1, maxLength: 1000 }) }, { additionalProperties: false })
);

export const ResumeChangeCommandSchema = commandSchema(
  "ResumeChange",
  Type.Object({}, { additionalProperties: false })
);

export const M0AnyCommandSchema = Type.Union([
  InitializeProjectCommandSchema,
  CreateChangeCommandSchema,
  PauseChangeCommandSchema,
  ResumeChangeCommandSchema
]);

export const M0CommandSuccessDataSchema = Type.Union([
  Type.Object(
    {
      project: ProjectSchema,
      actor: ActorSchema,
      assignment: AssignmentSchema
    },
    { additionalProperties: false }
  ),
  Type.Object({ change: ChangeSchema }, { additionalProperties: false })
]);

export const ChangeListResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    changes: Type.Array(ChangeSchema)
  },
  { additionalProperties: false }
);

export const ChangeShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    change: ChangeSchema
  },
  { additionalProperties: false }
);

export const DoctorResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    project_id: InternalIdSchema,
    repository_path: Type.String({ minLength: 1 }),
    database_path: Type.String({ minLength: 1 }),
    changes: Type.Integer({ minimum: 0 }),
    events: Type.Integer({ minimum: 0 }),
    pending_outbox: Type.Integer({ minimum: 0 })
  },
  { additionalProperties: false }
);

export const ErrorResultSchema = Type.Object(
  {
    ok: Type.Literal(false),
    error: DomainErrorSchema
  },
  { additionalProperties: false }
);

export type InternalId = Static<typeof InternalIdSchema>;
export type TypedReference = Static<typeof TypedReferenceSchema>;
export type SourceDescriptor = Static<typeof SourceDescriptorSchema>;
export type Project = Static<typeof ProjectSchema>;
export type Actor = Static<typeof ActorSchema>;
export type Role = Static<typeof RoleSchema>;
export type Assignment = Static<typeof AssignmentSchema>;
export type Change = Static<typeof ChangeSchema>;
export type TransitionRecord = Static<typeof TransitionRecordSchema>;
export type EventEnvelope = Static<typeof EventEnvelopeSchema>;
export type DomainError = Static<typeof DomainErrorSchema>;
export type InitializeProjectCommand = Static<typeof InitializeProjectCommandSchema>;
export type CreateChangeCommand = Static<typeof CreateChangeCommandSchema>;
export type PauseChangeCommand = Static<typeof PauseChangeCommandSchema>;
export type ResumeChangeCommand = Static<typeof ResumeChangeCommandSchema>;
export type M0Command = Static<typeof M0AnyCommandSchema>;
export type ChangeListResult = Static<typeof ChangeListResultSchema>;
export type ChangeShowResult = Static<typeof ChangeShowResultSchema>;
export type DoctorResult = Static<typeof DoctorResultSchema>;
export type ErrorResult = Static<typeof ErrorResultSchema>;

export const m0ProtocolSchemas = {
  Project: ProjectSchema,
  Actor: ActorSchema,
  Role: RoleSchema,
  Assignment: AssignmentSchema,
  Change: ChangeSchema,
  TransitionRecord: TransitionRecordSchema,
  EventEnvelope: EventEnvelopeSchema,
  DomainError: DomainErrorSchema,
  InitializeProjectCommand: InitializeProjectCommandSchema,
  CreateChangeCommand: CreateChangeCommandSchema,
  PauseChangeCommand: PauseChangeCommandSchema,
  ResumeChangeCommand: ResumeChangeCommandSchema,
  ChangeListResult: ChangeListResultSchema,
  ChangeShowResult: ChangeShowResultSchema,
  DoctorResult: DoctorResultSchema,
  ErrorResult: ErrorResultSchema
} as const;
