import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export class ExportObjectMissingError extends Error {
  readonly code = "OBJECT_MISSING";

  constructor(digest: string) {
    super(`missing object ${digest}`);
    this.name = "ExportObjectMissingError";
  }
}

const sqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

export const createProjectStoreSnapshot = (sourcePath: string, destinationPath: string): void => {
  const source = new DatabaseSync(sourcePath);
  try {
    source.exec(`VACUUM INTO ${sqlLiteral(destinationPath)}`);
  } finally {
    source.close();
  }
};

export const assertManagedObjectsExist = (objectsDirectory: string, digests: readonly string[]): void => {
  for (const digest of digests) {
    if (!existsSync(join(objectsDirectory, digest))) {
      throw new ExportObjectMissingError(digest);
    }
  }
};
