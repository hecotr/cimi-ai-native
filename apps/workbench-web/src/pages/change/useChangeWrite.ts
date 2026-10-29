import { useAction, useWrite } from "../../api/hooks";
import type { ActingRole, Change } from "../../api/types";

/** Commands aimed at one Change: target and expected revision are always the Change as last read. */
export function useChangeWrite(change: Change) {
  const write = useWrite();
  const act = useAction();
  return {
    busy: write.busy,
    blocked: !!write.pending,
    command: <T = any>(type: string, payload: unknown, role: ActingRole, label: string) =>
      act<T>(() => write.command(type, payload, { role, label, target: { object_type: "change", id: change.id }, revision: change.revision })),
    commandOn: <T = any>(type: string, payload: unknown, role: ActingRole, label: string, target: { object_type: string; id: string }, revision?: number) =>
      act<T>(() => write.command(type, payload, { role, label, target: target as never, ...(revision === undefined ? {} : { revision }) })),
    send: <T = any>(path: string, body: unknown, label: string) => act<T>(() => write.send(path, body, label))
  };
}
