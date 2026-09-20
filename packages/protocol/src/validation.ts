import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import type { TSchema } from "typebox";
import {
  AnyCommandSchema,
  ChangeListResultSchema,
  ChangeShowResultSchema,
  CommandResultSchema,
  DoctorResultSchema,
  ErrorResultSchema,
  type AnyCommand,
  type ChangeListResult,
  type ChangeShowResult,
  type CommandResult,
  type DoctorResult,
  type ErrorResult
} from "./schemas.js";

export class ProtocolValidationError extends Error {
  readonly errors: ErrorObject[];

  constructor(errors: ErrorObject[]) {
    super("Protocol validation failed");
    this.name = "ProtocolValidationError";
    this.errors = errors;
  }
}

export const compileValidator = <T>(schema: TSchema): ((value: unknown) => T) => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: false
  });
  const validate = ajv.compile(schema as object) as ValidateFunction<T>;
  return (value: unknown): T => {
    if (!validate(value)) {
      throw new ProtocolValidationError(validate.errors ? [...validate.errors] : []);
    }
    return value as T;
  };
};

export const parseCommand = compileValidator<AnyCommand>(AnyCommandSchema);
export const parseCommandResult = compileValidator<CommandResult>(CommandResultSchema);
export const parseChangeListResult = compileValidator<ChangeListResult>(ChangeListResultSchema);
export const parseChangeShowResult = compileValidator<ChangeShowResult>(ChangeShowResultSchema);
export const parseDoctorResult = compileValidator<DoctorResult>(DoctorResultSchema);
export const parseErrorResult = compileValidator<ErrorResult>(ErrorResultSchema);

export const formatValidationErrors = (errors: readonly ErrorObject[]): string[] =>
  errors.map((error) => `${error.instancePath || "/"} ${error.message ?? "校验失败"}`);
