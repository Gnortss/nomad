import { Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./lib/auth";
import { Login } from "./screens/Login";
import { TripListScreen } from "./screens/TripList";
import { TripEditorScreen } from "./screens/TripEditor";
import { ShareView } from "./share/ShareView";

function Gated({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <div className="mono" style={{ height: "100%", display: "grid", placeItems: "center" }}>Loading…</div>;
  return data?.user ? <>{children}</> : <Login />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/trips" replace />} />
      <Route path="/trips" element={<Gated><TripListScreen /></Gated>} />
      <Route path="/trips/:id" element={<Gated><TripEditorScreen /></Gated>} />
      <Route path="/s/:token" element={<ShareView />} />
    </Routes>
  );
}
