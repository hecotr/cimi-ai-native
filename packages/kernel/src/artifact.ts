import { createHash } from "node:crypto";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_VERSION, type AgentRunRecord, type Artifact, type Digest, type SourceSnapshot, type WorkItem } from "@cimiloop/protocol";
import type { PathIo } from "./io.js";

export const artifactDigestImmutable = (current: Digest, next: Digest): boolean =>
  current.algorithm === next.algorithm && current.value === next.value && current.subject === next.subject;

const isUncAbsolute = (value: string): boolean => {
  const normalized = value.replaceAll("/", "\\");
  return normalized.startsWith("\\\\") || /^[\\/]{2}[^\\/]/.test(value);
};

export const resolveAuthorizedFileReference = (
  reference: string,
  roots: readonly string[],
  io: PathIo
): { ok: true; storedReference: string; digest: string } | { ok: false } => {
  if (!reference.startsWith("file:")) {
    return { ok: true, storedReference: reference, digest: "" };
  }
  try {
    const url = new URL(reference);
    if (
      url.hostname &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1" &&
      !/^[a-zA-Z]$/.test(url.hostname)
    ) {
      return { ok: false };
    }
    const absolute = fileURLToPath(reference);
    if (isUncAbsolute(absolute)) return { ok: false };
    const real = io.realpath(absolute);
    if (isUncAbsolute(real)) return { ok: false };
    for (const root of roots) {
      let realRoot: string;
      try {
        realRoot = io.realpath(root);
      } catch {
        continue;
      }
      const cmpReal = process.platform === "win32" ? real.toLowerCase() : real;
      const cmpRoot = process.platform === "win32" ? realRoot.toLowerCase() : realRoot;
      const prefix = cmpRoot.endsWith(sep) ? cmpRoot : cmpRoot + sep;
      if (cmpReal !== cmpRoot && !cmpReal.startsWith(prefix)) continue;
      const relativePath = relative(realRoot, real).replaceAll("\\", "/");
      if (!relativePath || relativePath.startsWith("..") || relativePath.includes("/../")) return { ok: false };
      const bytes = io.readFile(real);
      return {
        ok: true,
        storedReference: `cimi-file://repository/${relativePath}`,
        digest: createHash("sha256").update(bytes).digest("hex")
      };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
};

export const localReferenceExists = (reference: string, roots: readonly string[], io: PathIo): boolean => {
  if (!reference.startsWith("file:")) return true;
  return resolveAuthorizedFileReference(reference, roots, io).ok;
};

export const localReferenceDigest = (reference: string, roots: readonly string[], io: PathIo): string | undefined => {
  if (!reference.startsWith("file:")) return undefined;
  const resolved = resolveAuthorizedFileReference(reference, roots, io);
  return resolved.ok ? resolved.digest : undefined;
};

export const createArtifact = (input: {
  id: Artifact["id"];
  run: AgentRunRecord;
  workItem: WorkItem;
  snapshot: SourceSnapshot;
  contextPackId: Artifact["context_pack_id"];
  bindingId: Artifact["binding_id"];
  digest: Digest;
  contentReference: string;
  summary: string;
  now: string;
}): Artifact => ({
  schema_version: SCHEMA_VERSION,
  id: input.id,
  project_id: input.run.project_id,
  change_id: input.run.change_id,
  work_item_id: input.run.work_item_id,
  run_id: input.run.id,
  context_pack_id: input.contextPackId,
  binding_id: input.bindingId,
  source_snapshot_id: input.snapshot.id,
  contract_id: input.workItem.contract_id,
  contract_version: input.workItem.contract_version,
  plan_id: input.workItem.plan_id as Artifact["plan_id"],
  plan_version: input.workItem.plan_version as Artifact["plan_version"],
  status: "candidate",
  summary: input.summary,
  digest: input.digest,
  content_reference: input.contentReference,
  created_at: input.now
});
