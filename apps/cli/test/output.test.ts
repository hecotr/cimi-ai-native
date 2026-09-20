import { describe, expect, it } from "vitest";
import { parseDoctorResult } from "@cimiloop/protocol";
import { outputJson } from "../src/output.js";

describe("CLI JSON output", () => {
  it("rejects output that does not conform to the selected Protocol Schema", () => {
    expect(() => outputJson({ ok: true, changes: "not-a-number" }, parseDoctorResult)).toThrow(
      "Protocol validation failed"
    );
  });
});
