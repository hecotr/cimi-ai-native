import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { EvidenceStance, TestResultFormat } from "@cimiloop/protocol";

export type PromotionParseResult =
  | { kind: "parsed"; stance: Extract<EvidenceStance, "Supports" | "Refutes"> }
  | { kind: "invalid"; reason: "unparseable" | "missing" };

const parseJunit = (contents: string): PromotionParseResult => {
  const failures = contents.match(/failures\s*=\s*"(\d+)"/i);
  if (!failures || !contents.includes("<testsuite") && !contents.includes("<testsuites")) {
    return { kind: "invalid", reason: "unparseable" };
  }
  return { kind: "parsed", stance: Number(failures[1]) > 0 ? "Refutes" : "Supports" };
};

const parseTap = (contents: string): PromotionParseResult => {
  if (!/(?:^|\n)(?:not )?ok\s/m.test(contents)) {
    return { kind: "invalid", reason: "unparseable" };
  }
  return { kind: "parsed", stance: /(?:^|\n)not ok\s/m.test(contents) ? "Refutes" : "Supports" };
};

const parseCimiloop = (contents: string): PromotionParseResult => {
  try {
    const parsed = JSON.parse(contents) as { passed?: unknown };
    if (typeof parsed.passed !== "boolean") return { kind: "invalid", reason: "unparseable" };
    return { kind: "parsed", stance: parsed.passed ? "Supports" : "Refutes" };
  } catch {
    return { kind: "invalid", reason: "unparseable" };
  }
};

export const parseWhitelistedTestResult = (format: TestResultFormat, contents: string): PromotionParseResult => {
  switch (format) {
    case "junit":
      return parseJunit(contents);
    case "tap":
      return parseTap(contents);
    case "cimiloop_test_v1":
      return parseCimiloop(contents);
  }
};

export const readPromotableReference = (reference: string): { kind: "contents"; value: string } | { kind: "invalid" } => {
  if (!reference.startsWith("file:")) return { kind: "invalid" };
  try {
    return { kind: "contents", value: readFileSync(fileURLToPath(reference), "utf8") };
  } catch {
    return { kind: "invalid" };
  }
};
