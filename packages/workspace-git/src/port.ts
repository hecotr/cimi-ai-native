import type { InternalId, SourceSnapshot } from "@cimiloop/protocol";

export interface WorkspaceLocation {
  worktreePath: string;
  changeId: InternalId;
}

export interface SnapshotCaptureInput {
  projectId: InternalId;
  changeId: InternalId;
  workItemId: InternalId;
  runId: InternalId;
  worktreePath: string;
}

export interface ChangeWorkspace {
  ensureWorktree(changeId: string, baseRevision?: string): WorkspaceLocation;
  captureSnapshot(input: SnapshotCaptureInput): SourceSnapshot;
  cleanup(worktreePath: string): void;
}

export class WorkspaceError extends Error {
  constructor(
    readonly code:
      | "WORKTREE_PATH_INVALID"
      | "WORKTREE_UNVERIFIED"
      | "CHANGE_ID_INVALID"
      | "DIRTY_MANIFEST_LIMIT"
      | "DIRTY_SYMLINK_ESCAPE",
    message: string
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}
