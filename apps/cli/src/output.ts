import {
  createInternalId,
  parseErrorResult,
  type ChangeRoomResult,
  type DecisionInboxResult,
  type DomainError
} from "@cimiloop/protocol";

export const isDomainError = (value: unknown): value is DomainError =>
  typeof value === "object" && value !== null && "code" in value && "category" in value;

export const outputJson = <T>(value: unknown, validate: (value: unknown) => T): void => {
  const validated = validate(value);
  process.stdout.write(`${JSON.stringify(validated, null, 2)}\n`);
};

export const outputError = (error: DomainError, jsonMode: boolean): void => {
  if (jsonMode) {
    outputJson({ ok: false, error }, parseErrorResult);
  } else {
    process.stderr.write(`错误 [${error.code}]：${error.message}\n`);
    if (Object.keys(error.details).length > 0) {
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    }
  }
  process.exitCode = error.category === "validation" ? 2 : error.category === "not_found" ? 3 : 1;
};

export const inputError = (
  code: DomainError["code"],
  message: string,
  details: Record<string, unknown> = {}
): DomainError => ({
  code,
  message,
  category: "validation",
  retryable: false,
  details,
  correlation_id: createInternalId()
});

export const formatDecisionInbox = (inbox: DecisionInboxResult): string => {
  if (inbox.items.length === 0) return "Decision Inbox 为空。\n";
  return inbox.items
    .map(
      (item) =>
        `${item.display_key}\t${item.request_type}\t角色 ${item.required_role_key}\n  ${item.summary}\n`
    )
    .join("");
};

export const formatChangeRoom = (result: ChangeRoomResult, revision: number): string => {
  const room = result.room;
  return [
    `${room.display_key} ${room.title}`,
    `生命周期：${room.lifecycle_state}  运行状态：${room.operating_status}  Revision ${revision}`,
    `焦点：${room.focus}`,
    `下一动作：${room.next_action}`,
    ""
  ].join("\n");
};
