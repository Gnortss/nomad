import { createContext, useContext, useMemo, useReducer } from "react";

type State = { focusedDayId: string | null; selectedPointId: string | null };
type Action =
  | { t: "focusDay"; id: string | null }
  | { t: "selectPoint"; id: string | null }
  | { t: "clearFocus" };

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "focusDay": return { ...s, focusedDayId: s.focusedDayId === a.id ? null : a.id };
    case "selectPoint": return { ...s, selectedPointId: a.id };
    case "clearFocus": return { ...s, focusedDayId: null };
  }
}

type Store = State & {
  focusDay: (id: string | null) => void;
  selectPoint: (id: string | null) => void;
  clearFocus: () => void;
};
const Ctx = createContext<Store | null>(null);

export function EditorStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { focusedDayId: null, selectedPointId: null });
  const value = useMemo<Store>(() => ({
    ...state,
    focusDay: (id) => dispatch({ t: "focusDay", id }),
    selectPoint: (id) => dispatch({ t: "selectPoint", id }),
    clearFocus: () => dispatch({ t: "clearFocus" }),
  }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEditorStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditorStore outside provider");
  return v;
}
