import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";

export interface ManagedProcessExit {
  exitCode: number | null;
  signal: string | null;
}

export interface ManagedProcess {
  pid: number;
  processReference: string;
  heartbeat(): { running: boolean; pid: number };
  cancel(): Promise<void>;
  signal(name: NodeJS.Signals): Promise<void>;
  wait(): Promise<ManagedProcessExit>;
}

export const startManagedProcess = (input: {
  executable: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
  redact: (chunk: string) => string;
}): ManagedProcess => {
  const child = spawn(process.execPath, [input.executable], {
    cwd: input.cwd,
    env: input.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("RUNTIME_SPAWN_FAILED");
  }

  const log = createWriteStream(input.logPath, { encoding: "utf8" });
  const logClosed = new Promise<void>((resolve) => {
    log.on("finish", () => resolve());
  });
  const append = (chunk: Buffer | string): void => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    log.write(input.redact(text));
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  let closed = false;
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  const waiters: Array<(exit: ManagedProcessExit) => void> = [];
  const finish = (code: number | null, signal: string | null): void => {
    if (closed) return;
    closed = true;
    exitCode = code;
    exitSignal = signal;
    log.end();
    const exit = { exitCode, signal: exitSignal };
    for (const waiter of waiters) waiter(exit);
  };
  child.on("close", (code, signal) => {
    finish(code, signal);
  });
  child.on("error", () => {
    finish(1, null);
  });

  return {
    pid,
    processReference: `pid://${pid}`,
    heartbeat: () => ({ running: !closed, pid }),
    cancel: async () => {
      if (!closed) child.kill("SIGTERM");
    },
    signal: async (name) => {
      if (!closed) child.kill(name);
    },
    wait: async () => {
      const exit = closed
        ? { exitCode, signal: exitSignal }
        : await new Promise<ManagedProcessExit>((resolve) => {
            waiters.push(resolve);
          });
      await logClosed;
      return exit;
    }
  };
};
