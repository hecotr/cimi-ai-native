import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App } from "antd";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { uuid7 } from "../lib/ids";
import { api, ApiError } from "./client";
import type { ActingRole, ChangeDetail, Dashboard, DecisionsData, LocalCommand, RunResult, TypedReference, WorkbenchContext } from "./types";

export const keys = {
  context: ["context"] as const,
  dashboard: ["dashboard"] as const,
  decisions: ["decisions"] as const,
  change: (id: string) => ["change", id] as const,
  runResult: (id: string) => ["run-result", id] as const
};

export const useWorkbenchContext = () => useQuery({ queryKey: keys.context, queryFn: () => api<WorkbenchContext>("/api/context"), staleTime: 60_000 });
export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: () => api<Dashboard>("/api/dashboard") });
export const useDecisions = () => useQuery({ queryKey: keys.decisions, queryFn: () => api<DecisionsData>("/api/decisions") });
export const useChange = (id: string | undefined) => useQuery({
  queryKey: keys.change(id ?? ""), enabled: !!id, queryFn: () => api<ChangeDetail>(`/api/changes/${encodeURIComponent(id!)}`)
});
export const useRunResult = (id: string | undefined, enabled = true) => useQuery({
  queryKey: keys.runResult(id ?? ""), enabled: !!id && enabled, retry: false,
  queryFn: () => api<RunResult>(`/api/agent-runs/${encodeURIComponent(id!)}/result`)
});

/**
 * A write whose outcome is not yet known. It is kept (with its original id) until the server
 * answers, so a lost response is retried with the same request instead of a new one.
 */
interface PendingWrite { path: string; body: unknown; label: string }

interface WriteApi {
  pending: PendingWrite | null;
  busy: boolean;
  send<T = any>(path: string, body: unknown, label: string): Promise<T>;
  command<T = any>(type: string, payload: unknown, options: { role: ActingRole; target?: TypedReference; revision?: number; label: string }): Promise<T>;
  replay(): Promise<void>;
  discard(): void;
}

const WriteContext = createContext<WriteApi | null>(null);
const storageKey = (project: string) => `cimiloop.pending.${project}`;

export function WriteProvider({ project, children }: { project: string; children: ReactNode }) {
  const client = useQueryClient();
  const { message } = App.useApp();
  const [pending, setPending] = useState<PendingWrite | null>(() => {
    try { const saved = sessionStorage.getItem(storageKey(project)); return saved ? JSON.parse(saved) as PendingWrite : null; } catch { return null; }
  });
  const [busy, setBusy] = useState(false);

  const remember = useCallback((value: PendingWrite | null) => {
    setPending(value);
    try { value ? sessionStorage.setItem(storageKey(project), JSON.stringify(value)) : sessionStorage.removeItem(storageKey(project)); } catch { /* best effort */ }
  }, [project]);

  const dispatch = useCallback(async <T,>(write: PendingWrite): Promise<T> => {
    setBusy(true);
    try {
      const result = await api<T>(write.path, write.body);
      remember(null);
      message.success(`${write.label}：已完成`);
      await client.invalidateQueries();
      return result;
    } catch (error) {
      // A definite business refusal means nothing happened; anything else might have committed.
      if (error instanceof ApiError && error.rejected) remember(null);
      throw error;
    } finally { setBusy(false); }
  }, [client, message, remember]);

  const value = useMemo<WriteApi>(() => {
    const send = async <T,>(path: string, body: unknown, label: string): Promise<T> => {
      if (pending) throw new ApiError("上一个操作的结果还没有确认，请先在顶部重新确认", 409, "PENDING_WRITE", null, false);
      const write = { path, body, label };
      remember(write);
      return dispatch<T>(write);
    };
    return {
    pending, busy, send,
    async command<T>(type: string, payload: unknown, { role, target, revision, label }: { role: ActingRole; target?: TypedReference; revision?: number; label: string }): Promise<T> {
      const body: LocalCommand = { command_id: uuid7(), requested_at: new Date().toISOString(), acting_role: role, command_type: type,
        ...(target ? { target } : {}), ...(revision === undefined ? {} : { expected_revision: revision }), payload };
      return send<T>("/api/commands", body, label);
    },
    async replay() { if (pending) await dispatch(pending); },
    discard() { remember(null); }
    };
  }, [pending, busy, dispatch, remember]);

  return <WriteContext.Provider value={value}>{children}</WriteContext.Provider>;
}

export function useWrite() {
  const value = useContext(WriteContext);
  if (!value) throw new Error("WriteProvider missing");
  return value;
}

/** Run an action and surface its failure as a toast; returns undefined on failure. */
export function useAction() {
  const { message } = App.useApp();
  return useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    try { return await action(); }
    catch (error) { message.error(error instanceof Error ? error.message : String(error), 6); return undefined; }
  }, [message]);
}
