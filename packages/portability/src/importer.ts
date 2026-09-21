import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { ExportManifest, InternalId } from "@cimiloop/protocol";
import { validatePortableManifest } from "./integrity.js";
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
  let parsed: { manifest?: unknown };
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as { manifest?: unknown };
  } catch {
    throw new PortableImportError("IMPORT_INVALID", "bundle is not valid JSON");
  }
  if (!parsed.manifest || typeof parsed.manifest !== "object") {
    throw new PortableImportError("IMPORT_INVALID", "bundle manifest is not a portable export");
  }
  const raw = parsed.manifest as { entries?: Array<{ payload?: unknown; id?: string }>; ids?: string[] };
  if (Array.isArray(raw.ids)) {
    for (const id of raw.ids) {
      if (!raw.entries?.some((entry) => entry.id === id)) {
        throw new PortableImportError("OBJECT_MISSING", `missing object ${id}`);
      }
    }
  }
  if (Array.isArray(raw.entries) && raw.entries.some((entry) => entry.payload === undefined || entry.payload === null)) {
    throw new PortableImportError("OBJECT_MISSING", "missing object payload");
  }
  const manifest = validatePortableManifest(parsed.manifest);
  return { path, bytes, manifest };
};

export const stageImportBundle = (input: {
  allowedRoot: string;
  bundleReference: string;
  bundleDigest: { value: string };
  maxBytes: number;
  reportId: InternalId;
  stagedAt: string;
}): { report: ReturnType<typeof createImportReport>; historyDigest: string; bundleDigest: string; stagingPath: string } => {
  const validated = validateImportBundle(input);
  const stagingPath = join(input.allowedRoot, ".cimiloop", "staging", input.reportId, "bundle.json");
  mkdirSync(join(input.allowedRoot, ".cimiloop", "staging", input.reportId), { recursive: true });
  writeFileSync(stagingPath, validated.bytes);
  return {
    historyDigest: validated.manifest.content_digest.value,
    bundleDigest: createHash("sha256").update(validated.bytes).digest("hex"),
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
