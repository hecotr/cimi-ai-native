import { Type, type Static } from "typebox";
import { ChangeSchema } from "../schemas.js";
import {
  AgentRunRecordSchema,
  ArtifactSchema,
  BlockerSchema,
  LeaseSchema,
  SourceSnapshotSchema,
  WorkItemSchema
} from "./domain.js";

export const M2CommandSuccessDataSchema = Type.Union([
  Type.Object(
    {
      work_item: WorkItemSchema,
      lease: Type.Optional(LeaseSchema)
    },
    { additionalProperties: false }
  ),
  Type.Object(
    {
      work_items: Type.Array(WorkItemSchema),
      change: Type.Optional(ChangeSchema)
    },
    { additionalProperties: false }
  ),
  Type.Object({ run: AgentRunRecordSchema }, { additionalProperties: false }),
  Type.Object(
    {
      artifact: ArtifactSchema,
      snapshot: Type.Optional(SourceSnapshotSchema)
    },
    { additionalProperties: false }
  ),
  Type.Object({ snapshot: SourceSnapshotSchema }, { additionalProperties: false }),
  Type.Object({ lease: LeaseSchema }, { additionalProperties: false }),
  Type.Object({ blocker: BlockerSchema }, { additionalProperties: false })
]);

export const WorkItemListResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    work_items: Type.Array(WorkItemSchema)
  },
  { additionalProperties: false }
);

export const WorkItemShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    work_item: WorkItemSchema,
    lease: Type.Optional(LeaseSchema)
  },
  { additionalProperties: false }
);

export const RunListResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    runs: Type.Array(AgentRunRecordSchema)
  },
  { additionalProperties: false }
);

export const RunShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    run: AgentRunRecordSchema
  },
  { additionalProperties: false }
);

export const ArtifactShowResultSchema = Type.Object(
  {
    ok: Type.Literal(true),
    artifact: ArtifactSchema
  },
  { additionalProperties: false }
);

export const m2ResultSchemas = {
  WorkItemListResult: WorkItemListResultSchema,
  WorkItemShowResult: WorkItemShowResultSchema,
  RunListResult: RunListResultSchema,
  RunShowResult: RunShowResultSchema,
  ArtifactShowResult: ArtifactShowResultSchema
} as const;

export type M2CommandSuccessData = Static<typeof M2CommandSuccessDataSchema>;
export type WorkItemListResult = Static<typeof WorkItemListResultSchema>;
export type WorkItemShowResult = Static<typeof WorkItemShowResultSchema>;
export type RunListResult = Static<typeof RunListResultSchema>;
export type RunShowResult = Static<typeof RunShowResultSchema>;
export type ArtifactShowResult = Static<typeof ArtifactShowResultSchema>;
