import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Digest, ExportManifest } from "@cimiloop/protocol";

export const canonicalize = (value: unknown): unknown => {
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

export const sha256Hex = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

export const digestOf = (value: unknown, subject: string): Digest => ({
  algorithm: "sha256",
  value: sha256Hex(JSON.stringify(canonicalize(value))),
  subject
});

export type ExportContentInput = {
  facts: readonly {
    object_type: string;
    schema_version: string;
    id: string;
    domain_version?: number;
    payload: Record<string, unknown>;
  }[];
  events: readonly { event_id: string; event_sequence: number }[];
  outbox: readonly { id: string; status: string }[];
  objectDigests?: readonly string[];
};

export const contentDigest = (input: ExportContentInput): Digest =>
  digestOf(
    {
      facts: [...input.facts].sort((left, right) =>
        left.object_type === right.object_type ? left.id.localeCompare(right.id) : left.object_type.localeCompare(right.object_type)
      ),
      events: [...input.events].sort((left, right) => left.event_sequence - right.event_sequence),
      outbox: [...input.outbox].sort((left, right) => left.id.localeCompare(right.id)),
      objectDigests: [...(input.objectDigests ?? [])].sort()
    },
    "export_content"
  );

export const manifestDigest = (manifest: ExportManifest): Digest => {
  const { manifest_digest: _ignored, ...body } = manifest;
  return digestOf(body, "export_manifest");
};

export const hashFile = async (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });

export const hashFileSync = (bytes: Buffer | string): string => sha256Hex(bytes);
