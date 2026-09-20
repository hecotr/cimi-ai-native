import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export interface DevOpsProcessExit {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  stdout: string;
}

export const runDevOpsProcess = async (input: {
  executable: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
  timeoutMs: number;
  redact: (chunk: string) => string;
}): Promise<DevOpsProcessExit> => {
  const child = spawn(input.executable, [...input.args], {
    cwd: input.cwd,
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: false
  });
  if (child.pid === undefined) {
    throw new Error("DEVOPS_SPAWN_FAILED");
  }

  const log = createWriteStream(input.logPath, { encoding: "utf8" });
  const logClosed = new Promise<void>((resolve) => {
    log.on("finish", () => resolve());
  });
  let stdout = "";
  const append = (chunk: Buffer | string): void => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    stdout += text;
    log.write(input.redact(text));
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 200).unref();
  }, input.timeoutMs);

  const exit = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve) => {
    child.on("close", (code, signal) => {
      resolve({ exitCode: code, signal });
    });
    child.on("error", () => {
      resolve({ exitCode: 1, signal: null });
    });
  });
  clearTimeout(timer);
  log.end();
  await logClosed;
  return { ...exit, timedOut, stdout };
};
