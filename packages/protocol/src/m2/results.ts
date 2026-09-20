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

export const m2ResultSchemas = {} as const;

export type M2CommandSuccessData = Static<typeof M2CommandSuccessDataSchema>;
