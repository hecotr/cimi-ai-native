import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExportManifest, InternalId } from "@cimiloop/protocol";
import { stageImportBundle, validateImportBundle, type ValidatedImportBundle } from "@cimiloop/portability";

export type StagedImport = {
  report: ReturnType<typeof stageImportBundle>["report"];
  historyDigest: string;
  bundleDigest: string;
  stagingPath: string;
};

export type PathIo = {
  exists(path: string): boolean;
  readFile(path: string): Buffer;
  realpath(path: string): string;
};

export type KernelIo = PathIo & {
  stageImport(input: {
    allowedRoot: string;
    bundleReference: string;
    bundleDigest: { value: string };
    maxBytes: number;
    reportId: InternalId;
    stagedAt: string;
  }): StagedImport;
  readStagedBundle(stagingPath: string, claimedDigest: { value: string }, allowedRoot: string): ValidatedImportBundle;
  abandon(stagingPath: string): void;
  listOrphanStaging(allowedRoot: string, livePaths: readonly string[]): string[];
};

export const nodePathIo: PathIo = {
  exists: (path) => existsSync(path),
  readFile: (path) => readFileSync(path),
  realpath: (path) => realpathSync(path)
};

export const createNodeKernelIo = (): KernelIo => ({
  ...nodePathIo,
  stageImport: (input) => stageImportBundle(input),
  readStagedBundle: (stagingPath, claimedDigest, allowedRoot) =>
    validateImportBundle({
      allowedRoot,
      bundleReference: `file://${stagingPath.replaceAll("\\", "/")}`,
      bundleDigest: claimedDigest,
      maxBytes: 5_000_000
    }),
  abandon: (stagingPath) => {
    rmSync(dirname(stagingPath), { recursive: true, force: true });
  },
  listOrphanStaging: (allowedRoot, livePaths) => {
    const root = join(allowedRoot, ".cimiloop", "staging");
    if (!existsSync(root)) return [];
    const live = new Set(livePaths.map((path) => path.replaceAll("\\", "/").toLowerCase()));
    return readdirSync(root).flatMap((name) => {
      const stagingPath = join(root, name, "bundle.json");
      const key = stagingPath.replaceAll("\\", "/").toLowerCase();
      return existsSync(stagingPath) && !live.has(key) ? [stagingPath] : [];
    });
  }
});

