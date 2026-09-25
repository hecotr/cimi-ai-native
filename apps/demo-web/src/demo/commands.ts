import type { DemoCommand, DemoScene, DraftChangeInput } from "./types";

export function startCreate(): DemoCommand {
  return { type: "START_CREATE" };
}

export function openChange(): DemoCommand {
  return { type: "OPEN_CHANGE" };
}

export function startClarification(): DemoCommand {
  return { type: "START_CLARIFICATION" };
}

export function approveContract(): DemoCommand {
  return { type: "APPROVE_CONTRACT" };
}

export function completeAgentRun(): DemoCommand {
  return { type: "COMPLETE_AGENT_RUN" };
}

export function startRepair(): DemoCommand {
  return { type: "START_REPAIR" };
}

export function completeRepair(): DemoCommand {
  return { type: "COMPLETE_REPAIR" };
}

export function submitRelease(): DemoCommand {
  return { type: "SUBMIT_RELEASE" };
}

export function approveRelease(binding?: {
  artifactDigest?: string;
  artifactId?: string;
  environment?: string;
}): DemoCommand {
  return { type: "APPROVE_RELEASE", ...binding };
}

export function completeDeployment(): DemoCommand {
  return { type: "COMPLETE_DEPLOYMENT" };
}

export function resetDemo(): DemoCommand {
  return { type: "RESET_DEMO" };
}

export function jumpToScene(scene: DemoScene): DemoCommand {
  return { type: "JUMP_TO_SCENE", scene };
}

export function createDraftChange(input: DraftChangeInput): DemoCommand {
  return { type: "CREATE_DRAFT_CHANGE", input };
}
