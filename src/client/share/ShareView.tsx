import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { getShare } from "../lib/api";
import { formatDistance, formatDuration, endpointLabel } from "../lib/format";
import { MapCanvas } from "../map/MapCanvas";
import { contour } from "../styles/ui";
import { shareDays, type SharePayload } from "./shareModel";

// Status becomes mono words — color-coded, readable without a legend.
const STATUS_TAG: Record<string, { word: string; color: string }> = {
  booked: { word: "BOOKED", color: "#2F7A55" },
  to_book: { word: "TO BOOK", color: "#B07708" },
  idea: { word: "IDEA", color: "#8FA3A0" },
};

function StatusWord({ status }: { status: string }) {
  const s = STATUS_TAG[status];
  if (!s) return null;
  return <span className="mono" style={{ fontSize: 9, color: s.color }}>{s.word}</span>;
}

export function ShareView() {
  const { token } = useParams();
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { getShare(token!).then((p) => setPayload(p as SharePayload)).catch(() => setError(true)); }, [token]);

  if (error) return <div style={{ padding: 24 }}>This link is no longer available.</div>;
  if (!payload) return <div className="mono" style={{ padding: 24 }}>Loading…</div>;
  const days = shareDays(payload);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--glacier)" }}>
      <header style={{ padding: "16px 16px 12px", background: "var(--basalt)", color: "#ECF0F0", ...contour("90% -60%", 36) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ width: 8, height: 8, background: "var(--lupine)", borderRadius: 2.5 }} />
          <span className="ovp" style={{ fontWeight: 800, letterSpacing: ".12em", fontSize: 11 }}>NOMAD</span>
          <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 12, background: "rgba(236,240,240,.14)", color: "#B9C6C3" }}>VIEW ONLY</span>
        </div>
        <div className="ovp" style={{ fontWeight: 800, fontSize: 18, marginTop: 9 }}>{payload.trip.name}</div>
        <div className="mono" style={{ fontSize: 10.5, color: "#8FA3A0", marginTop: 3, textTransform: "uppercase" }}>
          {payload.trip.startDate ? `${payload.trip.startDate} · ` : ""}{days.length} days · {formatDistance(payload.stats.totalDistanceM)}
        </div>
      </header>
      <div style={{ height: "40vh", position: "relative", flex: "none" }}>
        <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}><MapCanvas /></APIProvider>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {days.map((d) => (
          <div key={d.id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="ovp" style={{ width: 24, height: 22, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--basalt)", color: "#fff", borderRadius: 7, fontWeight: 800, fontSize: 11 }}>{d.position + 1}</span>
              <span className="ovp" style={{ flex: 1, fontWeight: 800, fontSize: 13.5 }}>{d.title ?? `Day ${d.position + 1}`}</span>
              {d.distanceM != null && <span className="mono" style={{ fontSize: 9.5, color: "var(--slate)", textTransform: "uppercase" }}>{formatDistance(d.distanceM)} · {formatDuration(d.durationS!)}</span>}
            </div>
            <div style={{ margin: "8px 0 0 33px", display: "flex", flexDirection: "column", gap: 1 }}>
              {d.stops.map((s, i) => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 12.5 }}>
                  <span className="mono" style={{ fontSize: 10, color: "#8FA3A0", width: 14, flex: "none" }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{s.name}</span>
                  {endpointLabel(i, d.stops.length) && <span className="ovp" style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--slate)", background: "rgba(87,103,107,.12)", padding: "2px 5px", borderRadius: 4 }}>{endpointLabel(i, d.stops.length)}</span>}
                  <StatusWord status={s.bookingStatus} />
                </div>
              ))}
              {d.attached.length > 0 && (
                <>
                  <div className="ovp" style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".08em", color: "#8FA3A0", borderTop: "1px solid rgba(30,42,44,.10)", marginTop: 5, padding: "7px 0 2px" }}>ALSO THIS DAY</div>
                  {d.attached.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12.5, color: "var(--slate)" }}>
                      <span style={{ flex: 1 }}>{s.name}</span>
                      <StatusWord status={s.bookingStatus} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
