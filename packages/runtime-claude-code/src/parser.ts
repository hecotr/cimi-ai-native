export type ParsedRuntimeOutput = { kind: "process_finished" } | { kind: "invalid" };

export const parseRuntimeResultFile = (contents: string | undefined): ParsedRuntimeOutput => {
  if (contents === undefined) return { kind: "invalid" };
  try {
    const parsed: unknown = JSON.parse(contents);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "kind" in parsed &&
      parsed.kind === "process_finished"
    ) {
      return { kind: "process_finished" };
    }
    return { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
};

export const redactSecrets = (text: string, secrets: readonly string[]): string => {
  let redacted = text;
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
};
