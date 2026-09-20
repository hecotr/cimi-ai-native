import type { PolicySnapshot, ProjectPolicy } from "@cimiloop/protocol";
import { requestDigest } from "./canonical.js";

export interface PolicyDigestInput {
  intent_required_role: ProjectPolicy["intent_required_role"];
  plan_required_role: ProjectPolicy["plan_required_role"];
  decisions_human_only: ProjectPolicy["decisions_human_only"];
  knowledge_tasks_required: ProjectPolicy["knowledge_tasks_required"];
}

export const SOLO_POLICY_RULES: PolicyDigestInput = {
  intent_required_role: "intent_owner",
  plan_required_role: "technical_owner",
  decisions_human_only: true,
  knowledge_tasks_required: true
};

export const computePolicySnapshotDigest = (input: PolicyDigestInput): string => requestDigest(input);

export const policyDigestInput = (policy: ProjectPolicy): PolicyDigestInput => ({
  intent_required_role: policy.intent_required_role,
  plan_required_role: policy.plan_required_role,
  decisions_human_only: policy.decisions_human_only,
  knowledge_tasks_required: policy.knowledge_tasks_required
});

export const snapshotDigestFromPolicy = (policy: ProjectPolicy): PolicySnapshot["digest"] => ({
  algorithm: "sha256",
  value: computePolicySnapshotDigest(policyDigestInput(policy)),
  subject: "project_policy"
});
