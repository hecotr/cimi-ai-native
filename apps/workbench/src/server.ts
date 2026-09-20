import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { InternalId } from "@cimiloop/protocol";
import {
  renderChangeRoom,
  renderError,
  renderHome,
  submitDecisionForm,
  type WorkbenchContext,
  type WorkbenchKernel
} from "./routes.js";

export interface WorkbenchOptions {
  kernel: WorkbenchKernel;
  actorId: InternalId;
  projectId: InternalId;
  host?: string;
  port?: number;
  token?: string;
  databasePath?: string;
  now?: () => string;
}

export interface WorkbenchHandle {
  url: string;
  close: () => Promise<void>;
  databasePath: string;
}

export const isLoopbackAddress = (address: string | undefined): boolean => {
  if (!address) return false;
  return address === "127.0.0.1" || address === "::1" || address === ":ffff:127.0.0.1" || address === "::ffff:127.0.0.1";
};

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const send = (response: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void => {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
  response.end(body);
};

export const startWorkbench = async (options: WorkbenchOptions): Promise<WorkbenchHandle> => {
  const host = options.host ?? "127.0.0.1";
  if (!isLoopbackAddress(host)) {
    throw new Error("Workbench 只能监听 loopback 地址");
  }
  const context: WorkbenchContext = {
    kernel: options.kernel,
    actorId: options.actorId,
    projectId: options.projectId,
    token: options.token ?? randomBytes(16).toString("hex"),
    now: options.now ?? (() => new Date().toISOString())
  };

  const server = createServer(async (request, response) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) {
      send(response, 403, renderError(403, "只接受本机访问"));
      return;
    }
    const url = new URL(request.url ?? "/", `http://${host}`);
    try {
      if (request.method === "GET" && url.pathname === "/") {
        send(response, 200, renderHome(context));
        return;
      }
      const changeMatch = /^\/changes\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && changeMatch?.[1]) {
        const html = renderChangeRoom(context, decodeURIComponent(changeMatch[1]));
        if (!html) {
          send(response, 404, renderError(404, "未找到指定 Change"));
          return;
        }
        send(response, 200, html);
        return;
      }
      const decisionMatch = /^\/decisions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "POST" && decisionMatch?.[1]) {
        const body = new URLSearchParams(await readBody(request));
        const result = submitDecisionForm(context, decodeURIComponent(decisionMatch[1]), {
          token: body.get("token") ?? "",
          expected_revision: body.get("expected_revision") ?? "",
          acting_role_id: body.get("acting_role_id") ?? "",
          outcome: body.get("outcome") ?? "",
          reason: body.get("reason") ?? "",
          feedback: body.get("feedback") ?? ""
        });
        if (result.location) {
          response.writeHead(result.status, { location: result.location });
          response.end();
          return;
        }
        send(response, result.status, result.body ?? renderError(result.status, "请求失败"));
        return;
      }
      send(response, 404, renderError(404, "未找到指定页面"));
    } catch {
      send(response, 500, renderError(500, "Workbench 处理失败"));
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 8787, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Workbench 未能绑定本地端口");
  }
  return {
    url: `http://${host}:${address.port}`,
    databasePath: options.databasePath ?? "",
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
};
