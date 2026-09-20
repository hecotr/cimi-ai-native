import { SCHEMA_VERSION, type SourceSnapshot, type AgentRunRecord } from "@cimiloop/protocol";
import type { RecordSourceSnapshotCommand } from "@cimiloop/protocol";

export const snapshotKindValid = (command: RecordSourceSnapshotCommand): boolean => {
  if (command.payload.snapshot_kind === "git_commit") {
    return command.payload.dirty === false && Boolean(command.payload.commit_sha) && Boolean(command.payload.tree_sha);
  }
  return command.payload.dirty === true;
};

export const createSourceSnapshot = (input: {
  id: SourceSnapshot["id"];
  run: AgentRunRecord;
  command: RecordSourceSnapshotCommand;
  now: string;
}): SourceSnapshot => {
  const shared = {
    schema_version: SCHEMA_VERSION,
    id: input.id,
    project_id: input.run.project_id,
    change_id: input.run.change_id,
    work_item_id: input.run.work_item_id,
    run_id: input.run.id,
    digest: input.command.payload.digest,
    content_reference: input.command.payload.content_reference,
    created_at: input.now
  };
  if (input.command.payload.snapshot_kind === "git_commit") {
    return {
      ...shared,
      snapshot_kind: "git_commit",
      dirty: false,
      commit_sha: input.command.payload.commit_sha as string,
      tree_sha: input.command.payload.tree_sha as string
    };
  }
  return {
    ...shared,
    snapshot_kind: "explicit_dirty_manifest",
    dirty: true,
    ...(input.command.payload.commit_sha ? { commit_sha: input.command.payload.commit_sha } : {}),
    ...(input.command.payload.tree_sha ? { tree_sha: input.command.payload.tree_sha } : {})
  };
};
