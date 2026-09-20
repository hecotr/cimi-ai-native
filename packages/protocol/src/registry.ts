import { m1CommandSchemas } from "./m1/commands.js";
import { m1ProtocolSchemas } from "./m1/domain.js";
import { m1ResultSchemas } from "./m1/results.js";
import { m0ProtocolSchemas } from "./schemas.js";

export const protocolSchemas = {
  ...m0ProtocolSchemas,
  ...m1ProtocolSchemas,
  ...m1CommandSchemas,
  ...m1ResultSchemas
} as const;
