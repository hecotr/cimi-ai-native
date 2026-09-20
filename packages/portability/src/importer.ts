import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ExportManifest, InternalId } from "@cimiloop/protocol";
import { createImportReport } from "./report.js";
import { PortableImportError, resolveBundlePath } from "./validator.js";

export type ValidatedImportBundle = {
  path: string;
  bytes: Buffer;
  manifest: ExportManifest;
};

export const validateImportBundle = (input: {
  allowedRoot: string;
  bundleReference: string;
  bundleDigest: { value: string };
  maxBytes: number;
}): ValidatedImportBundle => {
  const path = resolveBundlePath(input.bundleReference, input.allowedRoot);
  const size = statSync(path).size;
  if (size > input.maxBytes) {
    throw new PortableImportError("BUNDLE_TOO_LARGE", `bundle exceeds size limit ${input.maxBytes}`);
  }
  const bytes = readFileSync(path);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== input.bundleDigest.value) {
    throw new PortableImportError("DIGEST_MISMATCH", "tampered bundle digest");
  }
  let parsed: { manifest?: ExportManifest };
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as { manifest?: ExportManifest };
  } catch {
    throw new PortableImportError("IMPORT_INVALID", "bundle is not valid JSON");
  }
  if (!parsed.manifest || parsed.manifest.portable_schema_version !== "portable-1.0.0") {
    throw new PortableImportError("IMPORT_INVALID", "bundle manifest is not a portable export");
  }
  const ids = parsed.manifest.ids;
  if (new Set(ids).size !== ids.length) {
    throw new PortableImportError("IMPORT_INVALID", "bundle contains duplicate ids");
  }
  return { path, bytes, manifest: parsed.manifest };
};

export const stageImportBundle = (input: {
  allowedRoot: string;
  bundleReference: string;
  bundleDigest: { value: string };
  maxBytes: number;
  reportId: InternalId;
  stagedAt: string;
}): { report: ReturnType<typeof createImportReport>; historyDigest: string; stagingPath: string } => {
  const validated = validateImportBundle(input);
  const stagingPath = join(input.allowedRoot, ".cimiloop", "staging", input.reportId, "bundle.json");
  mkdirSync(join(input.allowedRoot, ".cimiloop", "staging", input.reportId), { recursive: true });
  writeFileSync(stagingPath, validated.bytes);
  return {
    historyDigest: validated.manifest.content_digest.value,
    stagingPath,
    report: createImportReport({
      id: input.reportId,
      projectId: validated.manifest.project_id,
      stagedAt: input.stagedAt,
      status: "staged",
      summary: `Staged portable bundle ${validated.manifest.id} with dormant runtime ownership.`
    })
  };
};
