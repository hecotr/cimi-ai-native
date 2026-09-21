import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export class PortableImportError extends Error {
  constructor(
    readonly code:
      | "PATH_TRAVERSAL"
      | "SYMLINK_ESCAPE"
      | "BUNDLE_TOO_LARGE"
      | "DIGEST_MISMATCH"
      | "OBJECT_MISSING"
      | "DIVERGENT_HISTORY"
      | "IMPORT_INVALID",
    message: string
  ) {
    super(message);
    this.name = "PortableImportError";
  }
}

export type ImportHistoryKind = "empty_target" | "identical" | "divergent";

export const classifyImportHistory = (input: {
  localProjectId?: string;
  localDigest?: string;
  incomingProjectId: string;
  incomingDigest: string;
}): ImportHistoryKind => {
  if (!input.localProjectId || !input.localDigest) return "empty_target";
  if (input.localProjectId === input.incomingProjectId && input.localDigest === input.incomingDigest) {
    return "identical";
  }
  return "divergent";
};

export const resolveBundlePath = (bundleReference: string, allowedRoot: string): string => {
  if (bundleReference.includes("..")) {
    throw new PortableImportError("PATH_TRAVERSAL", "path traversal");
  }
  const raw = bundleReference.startsWith("file://") ? decodeURIComponent(bundleReference.slice("file://".length)) : bundleReference;
  const absolute = resolve(raw);
  const allowed = realpathSync(resolve(allowedRoot));
  const link = lstatSync(absolute);
  if (link.isSymbolicLink()) {
    const real = realpathSync(absolute);
    const escaped = relative(allowed, real);
    if (escaped.startsWith("..") || isAbsolute(escaped)) {
      throw new PortableImportError("SYMLINK_ESCAPE", "symlink escape");
    }
  }
  const real = realpathSync(absolute);
  const inside = relative(allowed, real);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new PortableImportError("PATH_TRAVERSAL", "path traversal");
  }
  return real;
};
