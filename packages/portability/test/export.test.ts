import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createInternalId, PORTABLE_SCHEMA_VERSION } from "../../protocol/src/index.js";
import { exportProjectBundle } from "../src/exporter.js";
import { manifestDigest } from "../src/digest.js";

const temporaryDirectories: string[] = [];
const now = "2026-09-20T00:00:00.000Z";

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const fact = (objectType: string, id = createInternalId(), payload: Record<string, unknown> = {}) => ({
  object_type: objectType,
  schema_version: SCHEMA_VERSION,
  id,
  domain_version: 1,
  payload: { id, title: objectType, ...payload }
});

const input = (
  facts = [fact("project"), fact("change")],
  extras: Record<string, unknown> = {}
) => ({
  projectId: createInternalId(),
  exporterActorId: createInternalId(),
  sourceInstanceId: createInternalId(),
  exportedAt: now,
  manifestId: createInternalId(),
  facts,
  events: [
    { event_id: createInternalId(), event_sequence: 1 },
    { event_id: createInternalId(), event_sequence: 2 }
  ],
  outbox: [{ id: createInternalId(), status: "pending" as const }],
  ownershipState: "active" as const,
  ...extras
});

describe("portable export digests", () => {
  it("produces the same content digest for the same facts regardless of input order or export timestamp", () => {
    const firstFact = fact("project");
    const secondFact = fact("change");
    const events = [
      { event_id: createInternalId(), event_sequence: 1 },
      { event_id: createInternalId(), event_sequence: 2 }
    ];
    const outbox = [{ id: createInternalId(), status: "pending" as const }];
    const left = exportProjectBundle(
      input([firstFact, secondFact], { events, outbox, exportedAt: "2026-09-20T00:00:00.000Z" })
    );
    const right = exportProjectBundle(
      input([secondFact, firstFact], {
        events,
        outbox,
        exportedAt: "2026-09-21T00:00:00.000Z",
        manifestId: createInternalId()
      })
    );
    expect(left.portable_schema_version).toBe(PORTABLE_SCHEMA_VERSION);
    expect(left.content_digest.value).toBe(right.content_digest.value);
    expect(left.manifest_digest.value).toBe(manifestDigest(left).value);
    expect(left.ids).toEqual([...left.ids].sort());
    expect(new Set(left.ids).size).toBe(left.ids.length);
  });

  it("records ownership and excludes secrets, caches, and raw transcripts", () => {
    const completed = exportProjectBundle(
      input([fact("project"), fact("change"), fact("closure_evaluation")], { ownershipState: "active" })
    );
    const inProgress = exportProjectBundle(input([fact("project"), fact("change")], { ownershipState: "active" }));
    expect(completed.ownership_state).toBe("active");
    expect(inProgress.ownership_state).toBe("active");
    expect(completed.excluded).toEqual(
      expect.arrayContaining([
        { kind: "secret", reason: "credentials are never exported" },
        { kind: "cache", reason: "derived caches are rebuilt on import" },
        { kind: "runtime_transcript", reason: "raw runtime transcripts are not exported" }
      ])
    );
    expect(JSON.stringify(completed)).not.toMatch(/token|password|secret_value/i);
  });

  it("fails when a managed object is missing or tampered", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-export-objects-"));
    temporaryDirectories.push(directory);
    const digest = createHash("sha256").update("portable-bytes").digest("hex");
    writeFileSync(join(directory, digest), "portable-bytes");
    const ok = exportProjectBundle(input(undefined, { objectsDirectory: directory, objectDigests: [digest] }));
    expect(ok.entries.length).toBeGreaterThan(0);

    expect(() =>
      exportProjectBundle(input(undefined, { objectsDirectory: directory, objectDigests: [digest, "e".repeat(64)] }))
    ).toThrow(/OBJECT_MISSING|missing object/i);

    const tampered = createHash("sha256").update("expected-bytes").digest("hex");
    writeFileSync(join(directory, tampered), "not-the-expected-bytes");
    expect(() =>
      exportProjectBundle(input(undefined, { objectsDirectory: directory, objectDigests: [tampered] }))
    ).toThrow(/DIGEST_MISMATCH|tamper/i);
  });
});
