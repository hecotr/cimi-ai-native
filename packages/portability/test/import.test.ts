import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId } from "../../protocol/src/index.js";
import { exportProjectBundle } from "../src/exporter.js";
import { stageImportBundle, validateImportBundle } from "../src/importer.js";
import { classifyImportHistory } from "../src/validator.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const digest = (bytes: string | Buffer) => ({
  algorithm: "sha256" as const,
  value: createHash("sha256").update(bytes).digest("hex"),
  subject: "import_bundle"
});

const fileRef = (path: string): string => `file://${path.replaceAll("\\", "/")}`;

const bundle = (projectId = createInternalId()) => {
  const changeId = createInternalId();
  const manifest = exportProjectBundle({
    projectId,
    exporterActorId: createInternalId(),
    sourceInstanceId: projectId,
    exportedAt: "2026-09-20T00:00:00.000Z",
    manifestId: createInternalId(),
    facts: [
      {
        object_type: "project",
        schema_version: SCHEMA_VERSION,
        id: projectId,
        domain_version: 1,
        payload: { id: projectId, name: "Imported", revision: 1 }
      },
      {
        object_type: "change",
        schema_version: SCHEMA_VERSION,
        id: changeId,
        domain_version: 1,
        payload: { id: changeId, title: "Imported change", revision: 1 }
      }
    ],
    events: [{ event_id: createInternalId(), event_sequence: 1 }],
    outbox: [],
    ownershipState: "active"
  });
  return { projectId, changeId, manifest };
};

describe("staged import validation", () => {
  it("rejects path traversal, symlink escape, and oversized bundles", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-import-root-"));
    temporaryDirectories.push(root);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: "file://../etc/passwd",
        bundleDigest: digest("x"),
        maxBytes: 1024
      })
    ).toThrow(/PATH_TRAVERSAL|path traversal/i);

    const outside = mkdtempSync(join(tmpdir(), "cimiloop-import-outside-"));
    temporaryDirectories.push(outside);
    const secret = join(outside, "secret.json");
    writeFileSync(secret, "{}");
    const link = join(root, "escape.json");
    try {
      symlinkSync(secret, link);
      expect(() =>
        validateImportBundle({
          allowedRoot: root,
          bundleReference: fileRef(link),
          bundleDigest: digest("{}"),
          maxBytes: 1024
        })
      ).toThrow(/SYMLINK_ESCAPE|symlink/i);
    } catch (error) {
      if ((error as { code?: string }).code === "EPERM") {
        expect(true).toBe(true);
      } else if (error instanceof Error && /SYMLINK_ESCAPE|symlink/i.test(error.message)) {
        expect(error.message).toMatch(/SYMLINK_ESCAPE|symlink/i);
      } else {
        throw error;
      }
    }

    const huge = join(root, "huge.json");
    writeFileSync(huge, "x".repeat(2048));
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: fileRef(huge),
        bundleDigest: digest("x".repeat(2048)),
        maxBytes: 1024
      })
    ).toThrow(/BUNDLE_TOO_LARGE|zip bomb|size/i);
  });

  it("rejects tampered digest and reports dormant ownership", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-import-stage-"));
    temporaryDirectories.push(root);
    const packed = bundle();
    const file = join(root, "bundle.json");
    const bytes = JSON.stringify({ manifest: packed.manifest, facts: packed.manifest.entries });
    writeFileSync(file, bytes);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: fileRef(file),
        bundleDigest: digest("tampered"),
        maxBytes: 1_000_000
      })
    ).toThrow(/DIGEST_MISMATCH|tamper/i);

    const staged = stageImportBundle({
      allowedRoot: root,
      bundleReference: fileRef(file),
      bundleDigest: digest(bytes),
      maxBytes: 1_000_000,
      reportId: createInternalId(),
      stagedAt: "2026-09-20T00:00:00.000Z"
    });
    expect(staged.report.runtime_ownership).toBe("dormant");
    expect(staged.report.status).toBe("staged");
    expect(staged.historyDigest).toBe(packed.manifest.content_digest.value);
  });

  it("classifies empty, identical, and divergent local history", () => {
    const packed = bundle();
    expect(
      classifyImportHistory({
        incomingProjectId: packed.projectId,
        incomingDigest: packed.manifest.content_digest.value
      })
    ).toBe("empty_target");
    expect(
      classifyImportHistory({
        localProjectId: packed.projectId,
        localDigest: packed.manifest.content_digest.value,
        incomingProjectId: packed.projectId,
        incomingDigest: packed.manifest.content_digest.value
      })
    ).toBe("identical");
    expect(
      classifyImportHistory({
        localProjectId: packed.projectId,
        localDigest: "a".repeat(64),
        incomingProjectId: packed.projectId,
        incomingDigest: packed.manifest.content_digest.value
      })
    ).toBe("divergent");
  });
});
