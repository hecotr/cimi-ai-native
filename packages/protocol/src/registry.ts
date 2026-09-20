import { m1CommandSchemas } from "./m1/commands.js";
import { m1ProtocolSchemas } from "./m1/domain.js";
import { m1ResultSchemas } from "./m1/results.js";
import { m2CommandSchemas } from "./m2/commands.js";
import { m2ProtocolSchemas } from "./m2/domain.js";
import { m2ResultSchemas } from "./m2/results.js";
import { m3CommandSchemas } from "./m3/commands.js";
import { m3ProtocolSchemas } from "./m3/domain.js";
import { m3ResultSchemas } from "./m3/results.js";
import { m0ProtocolSchemas } from "./schemas.js";

export const protocolSchemas = {
  ...m0ProtocolSchemas,
  ...m1ProtocolSchemas,
  ...m1CommandSchemas,
  ...m1ResultSchemas,
  ...m2ProtocolSchemas,
  ...m2CommandSchemas,
  ...m2ResultSchemas,
  ...m3ProtocolSchemas,
  ...m3CommandSchemas,
  ...m3ResultSchemas
} as const;
