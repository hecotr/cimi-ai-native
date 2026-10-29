// Thin transport over the workbench server: one loopback session, CSRF on writes, no query strings.
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly body: unknown,
    /** A business refusal from the Kernel: the command definitely did not take effect. */
    readonly rejected: boolean) { super(message); }
}

let csrf = "";
export const setCsrf = (value: string) => { csrf = value; };

const describe = (body: any): { code: string; message: string; rejected: boolean } => {
  const rejected = body?.command_result ?? body ?? {};
  const code = String(rejected.code ?? "UNKNOWN");
  const diagnostic = rejected.details?.diagnostic;
  const missing: string[] = diagnostic?.missing_conditions ?? [];
  const message = (rejected.message ?? MESSAGES[code] ?? code) + (missing.length ? `（缺少：${missing.join("、")}）` : "");
  return { code, message, rejected: typeof rejected.category === "string" && rejected.retryable !== true && !["storage", "internal"].includes(rejected.category) };
};

const MESSAGES: Record<string, string> = {
  SESSION_REQUIRED: "本地会话已失效，请从终端重新打开工作台",
  CSRF_REJECTED: "会话校验失败，请刷新页面",
  BOOTSTRAP_REJECTED: "登录链接已使用或失效，请从终端重新打开工作台",
  ROUTE_NOT_FOUND: "后端尚未提供这个接口",
  WORKBENCH_CLOSING: "工作台正在关闭",
  MODEL_NOT_CONFIGURED: "尚未配置模型连接",
  WORKBENCH_FAILURE: "工作台内部错误"
};

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...(body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json", "X-CimiLoop-CSRF": csrf }, body: JSON.stringify(body) }) });
  } catch {
    throw new ApiError("无法连接本地工作台服务", 0, "NETWORK", null, false);
  }
  let result: any = null;
  try { result = await response.json(); } catch { /* non-JSON failure */ }
  if (!response.ok || result?.ok === false && result?.code) {
    const { code, message, rejected } = describe(result);
    throw new ApiError(message, response.status, code, result, rejected && response.status < 500);
  }
  return result as T;
}

/** Exchange the one-use fragment for a session cookie, then drop it from the address bar. */
export async function bootstrapSession() {
  const fragment = location.hash.slice(1);
  if (/^[A-Za-z0-9_-]{43}$/.test(fragment)) {
    history.replaceState(null, "", location.pathname);
    const session = await api<{ csrf: string }>("/api/session", { bootstrap: fragment });
    setCsrf(session.csrf);
  }
}
