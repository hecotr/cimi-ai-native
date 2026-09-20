import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { projectStoreContract } from "../../../tests/contracts/project-store.contract.js";
import { SqliteProjectStore } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

projectStoreContract("SQLite", () => {
  const directory = mkdtempSync(join(tmpdir(), "cimiloop-store-contract-"));
  temporaryDirectories.push(directory);
  const databasePath = join(directory, "project.db");
  return {
    create: () => new SqliteProjectStore(databasePath),
    reopen: () => new SqliteProjectStore(databasePath)
  };
});
