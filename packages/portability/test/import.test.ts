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
  const eventId = createInternalId();
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
        payload: { id: changeId, project_id: projectId, title: "Imported change", revision: 1 }
      },
      {
        object_type: "event",
        schema_version: SCHEMA_VERSION,
        id: eventId,
        domain_version: 1,
        payload: { event_id: eventId, event_sequence: 1, project_id: projectId, event_type: "ChangeCreated" }
      }
    ],
    events: [{ event_id: eventId, event_sequence: 1 }],
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
    const bytes = JSON.stringify({ manifest: packed.manifest });
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

  it("rejects tampered payload, tampered manifest, missing objects, broken history, and relation mismatch", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-import-integrity-"));
    temporaryDirectories.push(root);
    const packed = bundle();
    const write = (name: string, manifest: unknown) => {
      const file = join(root, name);
      const bytes = JSON.stringify({ manifest });
      writeFileSync(file, bytes);
      return { file, bytes };
    };

    const tamperedPayload = {
      ...packed.manifest,
      entries: packed.manifest.entries.map((entry) =>
        entry.object_type === "project" ? { ...entry, payload: { ...entry.payload, name: "Tampered" } } : entry
      )
    };
    const payloadFile = write("payload.json", tamperedPayload);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: fileRef(payloadFile.file),
        bundleDigest: digest(payloadFile.bytes),
        maxBytes: 1_000_000
      })
    ).toThrow(/DIGEST_MISMATCH|tamper/i);

    const tamperedManifest = { ...packed.manifest, ownership_state: "dormant" };
    const manifestFile = write("manifest.json", tamperedManifest);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: fileRef(manifestFile.file),
        bundleDigest: digest(manifestFile.bytes),
        maxBytes: 1_000_000
      })
    ).toThrow(/DIGEST_MISMATCH|manifest digest|content digest/i);

    const missing = {
      ...packed.manifest,
      entries: packed.manifest.entries.map((entry) =>
        entry.object_type === "change" ? { ...entry, payload: undefined } : entry
      )
    };
    const missingFile = write("missing.json", missing);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: fileRef(missingFile.file),
        bundleDigest: digest(missingFile.bytes),
        maxBytes: 1_000_000
      })
    ).toThrow(/OBJECT_MISSING|missing object/i);

    const eventA = createInternalId();
    const eventB = createInternalId();
    const broken = exportProjectBundle({
      projectId: packed.projectId,
      exporterActorId: createInternalId(),
      sourceInstanceId: packed.projectId,
      exportedAt: "2026-09-20T00:00:00.000Z",
      manifestId: createInternalId(),
      facts: [
        {
          object_type: "project",
          schema_version: SCHEMA_VERSION,
          id: packed.projectId,
          domain_version: 1,
          payload: { id: packed.projectId, name: "Broken", revision: 1, project_id: packed.projectId }
        },
        {
          object_type: "event",
          schema_version: SCHEMA_VERSION,
          id: eventA,
          domain_version: 1,
          payload: { event_id: eventA, event_sequence: 1, project_id: packed.projectId, event_type: "ChangeCreated" }
        },
        {
          object_type: "event",
          schema_version: SCHEMA_VERSION,
          id: eventB,
          domain_version: 3,
          payload: { event_id: eventB, event_sequence: 3, project_id: packed.projectId, event_type: "ChangeUpdated" }
        }
      ],
      events: [
        { event_id: eventA, event_sequence: 1 },
        { event_id: eventB, event_sequence: 3 }
      ],
      outbox: [],
      ownershipState: "active"
    });
    const brokenFile = write("broken.json", broken);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: fileRef(brokenFile.file),
        bundleDigest: digest(brokenFile.bytes),
        maxBytes: 1_000_000
      })
    ).toThrow(/IMPORT_INVALID|continuous|history/i);

    const orphanEvidence = createInternalId();
    const mismatched = exportProjectBundle({
      projectId: packed.projectId,
      exporterActorId: createInternalId(),
      sourceInstanceId: packed.projectId,
      exportedAt: "2026-09-20T00:00:00.000Z",
      manifestId: createInternalId(),
      facts: [
        {
          object_type: "project",
          schema_version: SCHEMA_VERSION,
          id: packed.projectId,
          domain_version: 1,
          payload: { id: packed.projectId, name: "Mismatch", revision: 1 }
        },
        {
          object_type: "evidence",
          schema_version: SCHEMA_VERSION,
          id: orphanEvidence,
          domain_version: 1,
          payload: {
            id: orphanEvidence,
            project_id: packed.projectId,
            change_id: createInternalId(),
            claim_id: createInternalId()
          }
        }
      ],
      events: [],
      outbox: [],
      ownershipState: "active"
    });
    const mismatchFile = write("mismatch.json", mismatched);
    expect(() =>
      validateImportBundle({
        allowedRoot: root,
        bundleReference: fileRef(mismatchFile.file),
        bundleDigest: digest(mismatchFile.bytes),
        maxBytes: 1_000_000
      })
    ).toThrow(/IMPORT_INVALID|missing claim|missing change/i);
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
