import type { Digest, EvidenceValidity, ImpactAssessment } from "@cimiloop/protocol";

type ImpactTrigger = ImpactAssessment["trigger"];

export interface ImpactBinding {
  subject_type: string;
  subject_id: string;
  subject_digest: Digest;
  environment_ref?: string;
  context_pack_id?: string;
}

export interface ImpactChange {
  subject_type: string;
  subject_id: string;
  old_digest: Digest;
  new_digest: Digest;
  replacement?: boolean;
  integrity_broken?: boolean;
  subject_mismatch?: boolean;
  source_unverified?: boolean;
}

export const classifyImpact = (input: {
  trigger: ImpactTrigger;
  binding: ImpactBinding;
  change: ImpactChange;
}): { applies: boolean; new_validity: EvidenceValidity; rule: string } => {
  if (input.change.subject_mismatch || input.change.integrity_broken || input.change.source_unverified) {
    return {
      applies: true,
      new_validity: "Invalid",
      rule: input.change.subject_mismatch
        ? "evidence_subject_mismatch"
        : input.change.source_unverified
          ? "evidence_source_unverified"
          : "evidence_integrity_broken"
    };
  }
  if (!binds(input.trigger, input.binding, input.change)) {
    return { applies: false, new_validity: "Valid", rule: "unbound_subject" };
  }
  if (input.change.old_digest.value !== input.change.new_digest.value) {
    if (input.change.replacement) {
      return { applies: true, new_validity: "Superseded", rule: `${input.trigger}_digest_superseded` };
    }
    return { applies: true, new_validity: "Stale", rule: `${input.trigger}_digest_changed` };
  }
  return { applies: true, new_validity: "Valid", rule: `${input.trigger}_unchanged` };
};

export const projectValidity = (impacts: readonly { new_validity: EvidenceValidity }[]): EvidenceValidity =>
  impacts.at(-1)?.new_validity ?? "Valid";

const binds = (trigger: ImpactTrigger, binding: ImpactBinding, change: ImpactChange): boolean => {
  if (trigger === "environment") {
    return Boolean(binding.environment_ref) && binding.subject_type === "environment"
      ? binding.subject_id === change.subject_id
      : Boolean(binding.environment_ref);
  }
  if (trigger === "context") {
    return Boolean(binding.context_pack_id);
  }
  return binding.subject_type === change.subject_type && binding.subject_id === change.subject_id;
};
