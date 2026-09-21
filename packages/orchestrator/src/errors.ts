const SECRET_PATTERN = /(token|secret|password|api[_-]?key|authorization|bearer)[=:"'\s]+\S+/gi;
const PATH_PATTERN = /(?:[A-Za-z]:\\|\\\\|\/(?:Users|home|tmp|var|etc|opt)\/)[^\s"'`]+/g;
const ENV_PATTERN = /(?:[A-Z][A-Z0-9_]{2,}=)\S+/g;
const JSON_SECRET_PATTERN = /"(?:token|secret|password|api[_-]?key|authorization)"\s*:\s*"[^"]*"/gi;

export const redactDiagnostic = (text: string): string =>
  text
    .replace(JSON_SECRET_PATTERN, '"[REDACTED]":"[REDACTED]"')
    .replace(SECRET_PATTERN, "[REDACTED]")
    .replace(PATH_PATTERN, "[REDACTED_PATH]")
    .replace(ENV_PATTERN, "[REDACTED_ENV]")
    .replace(/api[_-]?key/gi, "[REDACTED_KEY]");

const SUMMARY_BY_CODE: Record<string, string> = {
  NO_READY_WORK_ITEM: "没有可执行的 Work Item",
  WORK_ITEM_NOT_FOUND: "未找到指定 Work Item",
  WORK_ITEM_CHANGE_MISMATCH: "Work Item 不属于指定 Change",
  WORK_ITEM_NOT_EXECUTABLE: "指定 Work Item 当前不可执行",
  CLAIM_FAILED: "领取 Work Item 失败",
  START_RUN_FAILED: "启动 Run 失败",
  COMPLETE_RUN_FAILED: "完成 Run 失败",
  FAIL_RUN_FAILED: "记录 Run 失败",
  BINDING_NOT_FOUND: "未找到能力绑定",
  EVALUATOR_WRITE_DENIED: "Evaluator 不得写入工作区",
  WORKTREE_REQUIRED: "执行前必须创建已验证的 Git worktree",
  WORKTREE_UNVERIFIED: "Worktree 未通过 Git 隔离校验",
  WORKTREE_PATH_INVALID: "Worktree 路径越出授权根目录",
  CHANGE_ID_INVALID: "Worktree 名称必须是 Change Internal ID",
  SNAPSHOT_RECORD_FAILED: "记录 Source Snapshot 失败",
  ORCHESTRATOR_FAILURE: "编排失败"
};

export const orchestratorFailure = (code: string): { kind: "failed"; error: string } => ({
  kind: "failed",
  error: SUMMARY_BY_CODE[code] ? code : "ORCHESTRATOR_FAILURE"
});

export const sanitizeOrchestratorError = (
  error: unknown,
  logger?: { error(message: string, diagnostic: string): void }
): { kind: "failed"; error: string } => {
  const raw = error instanceof Error ? error.message : String(error);
  const diagnostic = redactDiagnostic(raw);
  logger?.error("orchestrator failure", diagnostic);
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return orchestratorFailure(error.code);
  }
  return orchestratorFailure("ORCHESTRATOR_FAILURE");
};

export const safeFailureMessage = (code: string): string => SUMMARY_BY_CODE[code] ?? "编排失败";
