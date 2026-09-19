import {
  SCHEMA_VERSION,
  type Change,
  type InternalId,
  type SourceDescriptor,
  type TransitionRecord
} from "@cimiloop/protocol";

export interface DomainContext {
  now: string;
  actorId: InternalId;
  commandId: InternalId;
  id: () => InternalId;
}

export const createDraftChange = (input: {
  id: InternalId;
  projectId: InternalId;
  displayKey: string;
  title: string;
  ownerActorId: InternalId;
  source: SourceDescriptor;
  now: string;
}): Change => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.projectId,
  display_key: input.displayKey,
  title: input.title,
  lifecycle_state: "Draft",
  operating_status: "Active",
  owner_actor_id: input.ownerActorId,
  source: input.source,
  created_at: input.now,
  updated_at: input.now,
  revision: 1
});

export const pauseDraftChange = (
  change: Change,
  reason: string,
  context: DomainContext
): { change: Change; transition: TransitionRecord } => {
  const next: Change = {
    ...change,
    operating_status: "Paused",
    pause_reason: reason,
    updated_at: context.now,
    revision: change.revision + 1
  };
  return {
    change: next,
    transition: {
      schema_version: SCHEMA_VERSION,
      id: context.id(),
      project_id: change.project_id,
      change_id: change.id,
      command_id: context.commandId,
      transition_type: "change_paused",
      from_status: "Active",
      to_status: "Paused",
      reason,
      actor_id: context.actorId,
      occurred_at: context.now
    }
  };
};

export const resumeDraftChange = (
  change: Change,
  context: DomainContext
): { change: Change; transition: TransitionRecord } => {
  const { pause_reason: _removed, ...withoutPauseReason } = change;
  const next: Change = {
    ...withoutPauseReason,
    operating_status: "Active",
    updated_at: context.now,
    revision: change.revision + 1
  };
  return {
    change: next,
    transition: {
      schema_version: SCHEMA_VERSION,
      id: context.id(),
      project_id: change.project_id,
      change_id: change.id,
      command_id: context.commandId,
      transition_type: "change_resumed",
      from_status: "Paused",
      to_status: "Active",
      actor_id: context.actorId,
      occurred_at: context.now
    }
  };
};
