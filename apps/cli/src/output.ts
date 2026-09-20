import { parseErrorResult, type DomainError } from "@cimiloop/protocol";

export const isDomainError = (value: unknown): value is DomainError =>
  typeof value === "object" && value !== null && "code" in value && "category" in value;

export const outputJson = <T>(value: unknown, validate: (value: unknown) => T): void => {
  const validated = validate(value);
  process.stdout.write(`${JSON.stringify(validated, null, 2)}\n`);
};

export const outputError = (error: DomainError, jsonMode: boolean): void => {
  if (jsonMode) {
    outputJson({ ok: false, error }, parseErrorResult);
  } else {
    process.stderr.write(`错误 [${error.code}]：${error.message}\n`);
    if (Object.keys(error.details).length > 0) {
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    }
  }
  process.exitCode = error.category === "validation" ? 2 : error.category === "not_found" ? 3 : 1;
};
