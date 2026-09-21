import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { AdapterResolutionError, createProductAdapterResolver } from "../src/adapter-resolver.js";

const temporary: string[] = [];
afterEach(() => {
  while (temporary.length > 0) {
    const directory = temporary.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("AdapterRegistry", () => {
  it("resolves file://examples/acceptance-target to CommandDevOpsAdapter", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-adapter-res-"));
    temporary.push(directory);
    const resolver = createProductAdapterResolver({
      projectRepositoryPath: directory,
      workingDirectory: directory,
      allowedRoots: [repoRoot]
    });
    const resolved = resolver.resolve({
      adapter_ref: "file://examples/acceptance-target",
      kind: "production"
    });
    expect(resolved.kind).toBe("command");
    expect(resolved.scriptPath?.replaceAll("\\", "/")).toMatch(/examples\/acceptance-target\/adapter\.mjs$/);
  });

  it("rejects test-only deterministic adapters on production", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-adapter-det-"));
    temporary.push(directory);
    const resolver = createProductAdapterResolver({
      projectRepositoryPath: directory,
      workingDirectory: directory,
      allowTestDeterministic: true
    });
    expect(() =>
      resolver.resolve({ adapter_ref: "cimi-adapter://deterministic", kind: "production" })
    ).toThrow(AdapterResolutionError);
    const testResolved = resolver.resolve({
      adapter_ref: "cimi-adapter://test-deterministic",
      kind: "test"
    });
    expect(testResolved.kind).toBe("deterministic");
  });

  it("does not follow unknown refs or escaped scripts", () => {
    const directory = mkdtempSync(join(tmpdir(), "cimiloop-adapter-bad-"));
    temporary.push(directory);
    mkdirSync(join(directory, "safe"), { recursive: true });
    writeFileSync(join(directory, "safe", "adapter.mjs"), "export default 1\n");
    const resolver = createProductAdapterResolver({
      projectRepositoryPath: directory,
      workingDirectory: directory,
      allowedRoots: [directory]
    });
    expect(() => resolver.resolve({ adapter_ref: "cimi-adapter://cloud", kind: "test" })).toThrow(
      /ADAPTER_REF_UNKNOWN|unsupported/
    );
    expect(() =>
      resolver.resolve({ adapter_ref: "file://C:/Windows/System32/cmd.exe", kind: "test" })
    ).toThrow(AdapterResolutionError);
  });
});
