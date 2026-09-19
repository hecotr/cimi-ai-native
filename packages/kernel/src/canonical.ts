import { createHash } from "node:crypto";
import type { AnyCommand } from "@cimiloop/protocol";

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
};

export const requestDigest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

export const commandDigest = (command: AnyCommand): string => {
  const { correlation_id: _correlationId, requested_at: _requestedAt, ...semanticCommand } = command;
  return requestDigest(semanticCommand);
};
