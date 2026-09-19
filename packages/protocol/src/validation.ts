import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { TSchema } from "typebox";
import { AnyCommandSchema, type AnyCommand } from "./schemas.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  allowUnionTypes: false
});

export class ProtocolValidationError extends Error {
  readonly errors: ErrorObject[];

  constructor(errors: ErrorObject[]) {
    super("Protocol validation failed");
    this.name = "ProtocolValidationError";
    this.errors = errors;
  }
}

export const compileValidator = <T>(schema: TSchema): ((value: unknown) => T) => {
  const validate = ajv.compile(schema as object) as ValidateFunction<T>;
  return (value: unknown): T => {
    if (!validate(value)) {
      throw new ProtocolValidationError(validate.errors ? [...validate.errors] : []);
    }
    return value as T;
  };
};

export const parseCommand = compileValidator<AnyCommand>(AnyCommandSchema);

export const formatValidationErrors = (errors: readonly ErrorObject[]): string[] =>
  errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "校验失败"}`);
