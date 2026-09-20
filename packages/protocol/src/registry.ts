import { m1ProtocolSchemas } from "./m1/domain.js";
import { m0ProtocolSchemas } from "./schemas.js";

export const protocolSchemas = {
  ...m0ProtocolSchemas,
  ...m1ProtocolSchemas
} as const;
