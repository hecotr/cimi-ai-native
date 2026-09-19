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
  Type.Literal("outbox_message")
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
  { $id: "Project.v1", additionalProperties: false }
);

export const ActorSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    actor_type: Type.Literal("human"),
    display_name: Type.String({ minLength: 1, maxLength: 200 }),
    email: Type.Optional(Type.String({ minLength: 3, maxLength: 320 })),
    identity_source: Type.Literal("git_config")
  },
  { $id: "Actor.v1", additionalProperties: false }
);

export const RoleSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    role_key: Type.Literal("project_owner"),
    display_name: Type.Literal("项目负责人")
  },
  { $id: "Role.v1", additionalProperties: false }
);

export const AssignmentSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    actor_id: InternalIdSchema,
    role_id: InternalIdSchema,
    scope_type: Type.Literal("project"),
    scope_id: InternalIdSchema,
    effective_at: UtcTimestampSchema
  },
  { $id: "Assignment.v1", additionalProperties: false }
);

export const ChangeSchema = Type.Object(
  {
    ...CommonMetadata,
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    display_key: Type.String({ pattern: "^CHG-\\d{4,}$" }),
    title: Type.String({ minLength: 1, maxLength: 300 }),
    lifecycle_state: Type.Literal("Draft"),
    operating_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
    owner_actor_id: InternalIdSchema,
    source: SourceDescriptorSchema,
    pause_reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    updated_at: UtcTimestampSchema
  },
  { $id: "Change.v1", additionalProperties: false }
);

export const TransitionRecordSchema = Type.Object(
  {
    schema_version: Type.Literal(SCHEMA_VERSION),
    id: InternalIdSchema,
    project_id: InternalIdSchema,
    change_id: InternalIdSchema,
    command_id: InternalIdSchema,
    transition_type: Type.Union([Type.Literal("change_paused"), Type.Literal("change_resumed")]),
    from_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
    to_status: Type.Union([Type.Literal("Active"), Type.Literal("Paused")]),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
    actor_id: InternalIdSchema,
    occurred_at: UtcTimestampSchema
  },
  { $id: "TransitionRecord.v1", additionalProperties: false }
);

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
  { $id: "EventEnvelope.v1", additionalProperties: false }
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
  { $id: "DomainError.v1", additionalProperties: false }
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
  { $id: "CommandEnvelopeBase.v1", additionalProperties: false }
);

const commandSchema = <const TCommandType extends string, T extends TSchema>(commandType: TCommandType, payload: T) =>
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

export const AnyCommandSchema = Type.Union([
  InitializeProjectCommandSchema,
  CreateChangeCommandSchema,
  PauseChangeCommandSchema,
  ResumeChangeCommandSchema
]);

export const CommandSuccessSchema = Type.Object(
  {
    ok: Type.Literal(true),
    command_id: InternalIdSchema,
    correlation_id: InternalIdSchema,
    aggregate: TypedReferenceSchema,
    revision: Type.Integer({ minimum: 1 }),
    events: Type.Array(EventEnvelopeSchema),
    data: Type.Record(Type.String(), Type.Unknown())
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
export type AnyCommand = Static<typeof AnyCommandSchema>;
export type CommandSuccess = Static<typeof CommandSuccessSchema>;

export const protocolSchemas = {
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
  CommandSuccess: CommandSuccessSchema
} as const;
