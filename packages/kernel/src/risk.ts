import { SCHEMA_VERSION, type InternalId, type RiskAssessment, type RiskProfile } from "@cimiloop/protocol";

export interface RiskDimensionsInput {
  data_exposure: string;
  security: string;
  reliability: string;
  reversibility: string;
}

const requireDimension = (name: keyof RiskDimensionsInput, value: string): string => {
  if (value.trim().length === 0) {
    throw new Error(`Risk dimension ${name} is incomplete`);
  }
  return value;
};

export const validateRiskDimensions = (input: RiskDimensionsInput): RiskDimensionsInput => ({
  data_exposure: requireDimension("data_exposure", input.data_exposure),
  security: requireDimension("security", input.security),
  reliability: requireDimension("reliability", input.reliability),
  reversibility: requireDimension("reversibility", input.reversibility)
});

export const createRiskProfile = (
  id: InternalId,
  projectId: InternalId,
  changeId: InternalId,
  dimensions: RiskDimensionsInput,
  now: string,
  revision = 1
): RiskProfile => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: projectId,
  change_id: changeId,
  revision,
  created_at: now,
  updated_at: now,
  dimensions: validateRiskDimensions(dimensions)
});

export const createRiskAssessment = (
  id: InternalId,
  profile: RiskProfile,
  now: string
): RiskAssessment => ({
  schema_version: SCHEMA_VERSION,
  id,
  project_id: profile.project_id,
  change_id: profile.change_id,
  risk_profile_id: profile.id,
  profile_revision: profile.revision,
  dimensions: profile.dimensions,
  created_at: now
});
