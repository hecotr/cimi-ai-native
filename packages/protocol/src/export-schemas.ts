import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { protocolSchemas } from "./schemas.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(currentDirectory, "..", "schemas");
mkdirSync(outputDirectory, { recursive: true });

for (const [name, schema] of Object.entries(protocolSchemas)) {
  const document = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...schema
  };
  writeFileSync(join(outputDirectory, `${name}.schema.json`), `${JSON.stringify(document, null, 2)}\n`, "utf8");
}
