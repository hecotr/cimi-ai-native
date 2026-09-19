import { v7 as uuidv7, validate as validateUuid, version as uuidVersion } from "uuid";
import type { InternalId } from "./schemas.js";

export const createInternalId = (): InternalId => uuidv7();

export const isInternalId = (value: string): value is InternalId =>
  validateUuid(value) && uuidVersion(value) === 7;
