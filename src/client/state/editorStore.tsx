import { createContext, useContext, useMemo, useReducer } from "react";

type State = { selectedDayId: string | null; expandedDayIds: ReadonlySet<string>; selectedPointId: string | null; droppingPin: boolean };
type Action =
  | { t: "selectDay"; id: string | null }
  | { t: "toggleDayExpanded"; id: string }
  | { t: "expandDay"; id: string }
  | { t: "selectPoint"; id: string | null }
  | { t: "startDropPin" }
  | { t: "cancelDropPin" };

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "selectDay": return s.selectedDayId === a.id ? s : { ...s, selectedDayId: a.id };
    case "toggleDayExpanded": {
      const next = new Set(s.expandedDayIds);
      if (!next.delete(a.id)) next.add(a.id);
      return { ...s, expandedDayIds: next };
    }
    case "expandDay": return s.expandedDayIds.has(a.id) ? s : { ...s, expandedDayIds: new Set(s.expandedDayIds).add(a.id) };
    case "selectPoint": return { ...s, selectedPointId: a.id };
    case "startDropPin": return { ...s, droppingPin: true };
    case "cancelDropPin": return { ...s, droppingPin: false };
  }
}

type Store = State & {
  selectDay: (id: string | null) => void;
  toggleDayExpanded: (id: string) => void;
  expandDay: (id: string) => void;
  selectPoint: (id: string | null) => void;
  startDropPin: () => void;
  cancelDropPin: () => void;
};
const Ctx = createContext<Store | null>(null);

export function EditorStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { selectedDayId: null, expandedDayIds: new Set<string>(), selectedPointId: null, droppingPin: false });
  const value = useMemo<Store>(() => ({
    ...state,
    selectDay: (id) => dispatch({ t: "selectDay", id }),
    toggleDayExpanded: (id) => dispatch({ t: "toggleDayExpanded", id }),
    expandDay: (id) => dispatch({ t: "expandDay", id }),
    selectPoint: (id) => dispatch({ t: "selectPoint", id }),
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
