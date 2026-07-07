import { createContext, useContext, useMemo, useReducer } from "react";

type State = { focusedDayId: string | null; selectedPointId: string | null; droppingPin: boolean };
type Action =
  | { t: "focusDay"; id: string | null }
  | { t: "selectPoint"; id: string | null }
  | { t: "clearFocus" }
  | { t: "startDropPin" }
  | { t: "cancelDropPin" };

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "focusDay": return { ...s, focusedDayId: s.focusedDayId === a.id ? null : a.id };
    case "selectPoint": return { ...s, selectedPointId: a.id };
    case "clearFocus": return { ...s, focusedDayId: null };
    case "startDropPin": return { ...s, droppingPin: true };
    case "cancelDropPin": return { ...s, droppingPin: false };
  }
}

type Store = State & {
  focusDay: (id: string | null) => void;
  selectPoint: (id: string | null) => void;
  clearFocus: () => void;
  startDropPin: () => void;
  cancelDropPin: () => void;
};
const Ctx = createContext<Store | null>(null);

export function EditorStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { focusedDayId: null, selectedPointId: null, droppingPin: false });
  const value = useMemo<Store>(() => ({
    ...state,
    focusDay: (id) => dispatch({ t: "focusDay", id }),
    selectPoint: (id) => dispatch({ t: "selectPoint", id }),
    clearFocus: () => dispatch({ t: "clearFocus" }),
    startDropPin: () => dispatch({ t: "startDropPin" }),
    cancelDropPin: () => dispatch({ t: "cancelDropPin" }),
  }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEditorStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditorStore outside provider");
  return v;
}
