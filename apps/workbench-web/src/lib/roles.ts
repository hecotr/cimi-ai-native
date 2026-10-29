import type { Assignment, Dashboard } from "../api/types";

/** Project-wide roles one person needs to drive a Change alone (Solo mode). */
export const SOLO_PROJECT_ROLES = ["flow_owner", "technical_owner", "quality_owner"] as const;

const effective = (item: Assignment, now = new Date().toISOString()) => !item.ended_at && item.effective_at <= now && (!item.expires_at || item.expires_at > now);

export const activeAssignments = (dashboard: Dashboard | undefined, actorId: string) =>
  (dashboard?.governance.assignments ?? []).filter(item => item.actor_id === actorId && effective(item));

export const holdsProjectRole = (dashboard: Dashboard | undefined, actorId: string, role: string) =>
  activeAssignments(dashboard, actorId).some(item => item.role_key === role && item.scope.kind === "project");

export const projectOwnerAssignment = (dashboard: Dashboard | undefined, actorId: string) =>
  activeAssignments(dashboard, actorId).find(item => item.role_key === "project_owner" && item.scope.kind === "project");
