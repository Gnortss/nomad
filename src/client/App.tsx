import { useSession } from "./lib/auth";
import { Login } from "./screens/Login";
import { AppShell } from "./screens/AppShell";

export function App() {
  const { data, isPending } = useSession();
  if (isPending) {
    return <div className="mono" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading…</div>;
  }
  return data?.user ? <AppShell /> : <Login />;
}
