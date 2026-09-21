import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { nodePathIo } from "../src/io.js";
import { resolveAuthorizedFileReference } from "../src/artifact.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("authorized file references", () => {
  it("accepts files inside the repository root and stores a relative reference", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-file-root-"));
    temporaryDirectories.push(root);
    const file = join(root, "artifact.bin");
    writeFileSync(file, "inside");
    const resolved = resolveAuthorizedFileReference(pathToFileURL(file).href, [root], nodePathIo);
    expect(resolved).toMatchObject({
      ok: true,
      storedReference: "cimi-file://repository/artifact.bin"
    });
    if (resolved.ok) expect(resolved.digest).toHaveLength(64);
  });

  it("rejects traversal, UNC and files outside the root with the same failure", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-file-jail-"));
    temporaryDirectories.push(root);
    const outsideDir = mkdtempSync(join(tmpdir(), "cimiloop-file-outside-"));
    temporaryDirectories.push(outsideDir);
    writeFileSync(join(outsideDir, "secret.bin"), "secret");
    const escaped = pathToFileURL(join(root, "..", "not-inside.bin")).href;
    const unc = "file://fileserver/share/secret.bin";
    const absolute = pathToFileURL(join(outsideDir, "secret.bin")).href;
    const mixedCase = pathToFileURL(join(root, "MISSING.bin")).href;
    expect(resolveAuthorizedFileReference(escaped, [root], nodePathIo)).toEqual({ ok: false });
    expect(resolveAuthorizedFileReference(unc, [root], nodePathIo)).toEqual({ ok: false });
    expect(resolveAuthorizedFileReference(absolute, [root], nodePathIo)).toEqual({ ok: false });
    expect(resolveAuthorizedFileReference(mixedCase, [root], nodePathIo)).toEqual({ ok: false });
  });

  it("rejects symlink or junction escape when the platform allows creating one", () => {
    const root = mkdtempSync(join(tmpdir(), "cimiloop-file-link-"));
    temporaryDirectories.push(root);
    const outside = mkdtempSync(join(tmpdir(), "cimiloop-file-link-out-"));
    temporaryDirectories.push(outside);
    writeFileSync(join(outside, "secret.bin"), "secret");
    const link = join(root, "escape");
    try {
      symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch {
      expect(true).toBe(true);
      return;
    }
    const href = pathToFileURL(join(link, "secret.bin")).href;
    expect(resolveAuthorizedFileReference(href, [root], nodePathIo)).toEqual({ ok: false });
  });
});
