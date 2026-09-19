import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isInternalId, type InternalId } from "@cimiloop/protocol";

export interface SoloInstance {
  schema_version: "1.0.0";
  instance_id: InternalId;
  project_id: InternalId;
  actor_id: InternalId;
  created_at: string;
}

export const writeInstance = (path: string, instance: SoloInstance): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(instance, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
};

export const readInstance = (path: string): SoloInstance => {
  const value = JSON.parse(readFileSync(path, "utf8")) as Partial<SoloInstance>;
  if (
    value.schema_version !== "1.0.0" ||
    !value.instance_id ||
    !value.project_id ||
    !value.actor_id ||
    !value.created_at ||
    !isInternalId(value.instance_id) ||
    !isInternalId(value.project_id) ||
    !isInternalId(value.actor_id)
  ) {
    throw new Error("instance.json 无效或版本不受支持");
  }
  return value as SoloInstance;
};
