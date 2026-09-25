import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createInitialState } from "./scenario";
import { reduce } from "./reducer";
import type { DemoCommand, DemoState, ReduceResult } from "./types";

interface DemoContextValue {
  state: DemoState;
  dispatch: (command: DemoCommand) => ReduceResult;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({
  children,
  initialState
}: {
  children: ReactNode;
  initialState?: DemoState;
}) {
  const [state, setState] = useState<DemoState>(() => initialState ?? createInitialState());

  const dispatch = useCallback((command: DemoCommand): ReduceResult => {
    let result: ReduceResult = { state, rejection: null, event: null };
    setState((current) => {
      result = reduce(current, command);
      return result.state;
    });
    return result;
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) {
    throw new Error("useDemo must be used within DemoProvider");
  }
  return value;
}
