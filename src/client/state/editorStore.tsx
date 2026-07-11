import { createContext, useContext, useMemo, useReducer } from "react";

type State = { selectedDayId: string | null; expandedDayIds: ReadonlySet<string>; selectedPointId: string | null; droppingPin: boolean; chatOpen: boolean; chatPrefill: string | null; aiBusy: boolean };
type Action =
  | { t: "selectDay"; id: string | null }
  | { t: "toggleDayExpanded"; id: string }
  | { t: "expandDay"; id: string }
  | { t: "selectPoint"; id: string | null }
  | { t: "startDropPin" }
  | { t: "cancelDropPin" }
  | { t: "openChat"; prefill?: string }
  | { t: "closeChat" }
  | { t: "consumeChatPrefill" }
  | { t: "setAiBusy"; busy: boolean };

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
    case "openChat": return { ...s, chatOpen: true, chatPrefill: a.prefill ?? s.chatPrefill };
    case "closeChat": return { ...s, chatOpen: false };
    case "consumeChatPrefill": return s.chatPrefill == null ? s : { ...s, chatPrefill: null };
    case "setAiBusy": return s.aiBusy === a.busy ? s : { ...s, aiBusy: a.busy };
  }
}

type Store = State & {
  selectDay: (id: string | null) => void;
  toggleDayExpanded: (id: string) => void;
  expandDay: (id: string) => void;
  selectPoint: (id: string | null) => void;
  startDropPin: () => void;
  cancelDropPin: () => void;
  openChat: (prefill?: string) => void;
  closeChat: () => void;
  consumeChatPrefill: () => void;
  setAiBusy: (busy: boolean) => void;
};
const Ctx = createContext<Store | null>(null);

export function EditorStoreProvider({ children, initialChatOpen = true }: { children: React.ReactNode; initialChatOpen?: boolean }) {
  const [state, dispatch] = useReducer(reducer, { selectedDayId: null, expandedDayIds: new Set<string>(), selectedPointId: null, droppingPin: false, chatOpen: initialChatOpen, chatPrefill: null, aiBusy: false });
  const value = useMemo<Store>(() => ({
    ...state,
    selectDay: (id) => dispatch({ t: "selectDay", id }),
    toggleDayExpanded: (id) => dispatch({ t: "toggleDayExpanded", id }),
    expandDay: (id) => dispatch({ t: "expandDay", id }),
    selectPoint: (id) => dispatch({ t: "selectPoint", id }),
    startDropPin: () => dispatch({ t: "startDropPin" }),
    cancelDropPin: () => dispatch({ t: "cancelDropPin" }),
    openChat: (prefill) => dispatch({ t: "openChat", prefill }),
    closeChat: () => dispatch({ t: "closeChat" }),
    consumeChatPrefill: () => dispatch({ t: "consumeChatPrefill" }),
    setAiBusy: (busy) => dispatch({ t: "setAiBusy", busy }),
  }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEditorStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useEditorStore outside provider");
  return v;
}
