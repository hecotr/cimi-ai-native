import { describe, expect, it } from "vitest";
import { redactDiagnostic, sanitizeOrchestratorError } from "../src/errors.js";

describe("orchestrator error sanitization", () => {
  it("redacts absolute paths, token-like secrets, and provider bodies from diagnostics", () => {
    const raw =
      'spawn C:\\Users\\hector\\.cimiloop\\bin failed token=ghp_secret123 PATH=C:\\secret Provider body {"api_key":"abc"}';
    const redacted = redactDiagnostic(raw);
    expect(redacted).not.toContain("C:\\Users\\hector");
    expect(redacted).not.toContain("ghp_secret123");
    expect(redacted).not.toContain("api_key");
    expect(redacted).toContain("[REDACTED]");
    const logs: string[] = [];
    const result = sanitizeOrchestratorError(new Error(raw), {
      error(_message, diagnostic) {
        logs.push(diagnostic);
      }
    });
    expect(result).toEqual({ kind: "failed", error: "ORCHESTRATOR_FAILURE" });
    expect(JSON.stringify(result)).not.toMatch(/Users|ghp_secret123|api_key/);
    expect(logs[0]).not.toMatch(/ghp_secret123|api_key/);
  });
});
