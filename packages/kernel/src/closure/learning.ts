import { SCHEMA_VERSION, type InternalId, type LearningCandidate, type LearningSourceKind } from "@cimiloop/protocol";
import { requestDigest } from "../canonical.js";

export const createProposedLearningCandidate = (input: {
  id: InternalId;
  projectId: InternalId;
  changeId: InternalId;
  sourceKind: LearningSourceKind;
  sourceId: InternalId;
  summary: string;
  now: string;
}): LearningCandidate => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.projectId,
  change_id: input.changeId,
  source_kind: input.sourceKind,
  source_id: input.sourceId,
  summary: input.summary,
  status: "proposed",
  promoted: false,
  digest: {
    algorithm: "sha256",
    value: requestDigest({
      change_id: input.changeId,
      source_kind: input.sourceKind,
      source_id: input.sourceId,
      summary: input.summary
    }),
    subject: "learning_candidate"
  },
  created_at: input.now
});

export const learningIsPromotedKnowledge = (candidate: LearningCandidate): boolean =>
  candidate.status === "accepted" && candidate.promoted === true && "decision_id" in candidate;
