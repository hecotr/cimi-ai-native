import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExportManifest, InternalId, OwnershipState } from "@cimiloop/protocol";
import { hashFileSync, type ExportContentInput } from "./digest.js";
import { assembleExportManifest } from "./manifest.js";

export class PortableExportError extends Error {
  constructor(
    readonly code: "OBJECT_MISSING" | "DIGEST_MISMATCH",
    message: string
  ) {
    super(message);
    this.name = "PortableExportError";
  }
}

export type ExportFact = ExportContentInput["facts"][number];

export type ExportProjectInput = {
  projectId: InternalId;
  exporterActorId: InternalId;
  sourceInstanceId: InternalId;
  exportedAt: string;
  manifestId: InternalId;
  facts: readonly ExportFact[];
  events: ExportContentInput["events"];
  outbox: ExportContentInput["outbox"];
  ownershipState: OwnershipState;
  latestRevision?: number;
  objectsDirectory?: string;
  objectDigests?: readonly string[];
};

const assertObjects = (directory: string | undefined, digests: readonly string[]): void => {
  if (digests.length === 0) return;
  if (!directory) {
    throw new PortableExportError("OBJECT_MISSING", "missing object directory");
  }
  for (const digest of digests) {
    const path = join(directory, digest);
    if (!existsSync(path)) {
      throw new PortableExportError("OBJECT_MISSING", `missing object ${digest}`);
    }
    const actual = hashFileSync(readFileSync(path));
    if (actual !== digest) {
      throw new PortableExportError("DIGEST_MISMATCH", `tampered object ${digest}`);
    }
  }
};

export const exportProjectBundle = (input: ExportProjectInput): ExportManifest => {
  assertObjects(input.objectsDirectory, input.objectDigests ?? []);
  const revisions = input.facts
    .map((fact) => fact.payload.revision)
    .filter((value): value is number => typeof value === "number");
  return assembleExportManifest({
    facts: input.facts,
    events: input.events,
    outbox: input.outbox,
    ...(input.objectDigests ? { objectDigests: input.objectDigests } : {}),
    id: input.manifestId,
    projectId: input.projectId,
    exportedAt: input.exportedAt,
    exporterActorId: input.exporterActorId,
    sourceInstanceId: input.sourceInstanceId,
    ownershipState: input.ownershipState,
    latestRevision: input.latestRevision ?? Math.max(1, ...revisions)
  });
};
