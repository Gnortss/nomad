import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { APIProvider } from "@vis.gl/react-google-maps";
import { getShare } from "../lib/api";
import { formatDistance, formatDuration, endpointLabel } from "../lib/format";
import { MapCanvas } from "../map/MapCanvas";
import { shareDays, type SharePayload } from "./shareModel";

const STATUS_TAG: Record<string, string> = { booked: "Booked", to_book: "To book", idea: "Idea" };

export function ShareView() {
  const { token } = useParams();
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { getShare(token!).then((p) => setPayload(p as SharePayload)).catch(() => setError(true)); }, [token]);

  if (error) return <div style={{ padding: 24 }}>This link is no longer available.</div>;
  if (!payload) return <div className="mono" style={{ padding: 24 }}>Loading…</div>;
  const days = shareDays(payload);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "14px 18px", borderBottom: "1px solid rgba(87,103,107,.18)" }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{payload.trip.name}</div>
        <div className="mono" style={{ fontSize: 12, color: "var(--slate)" }}>
          {payload.trip.startDate ?? ""} · {days.length} days · {formatDistance(payload.stats.totalDistanceM)}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 2 }}>Shared itinerary · view only</div>
      </header>
      <div style={{ height: "40vh", position: "relative", flex: "none" }}>
        <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY}><MapCanvas /></APIProvider>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {days.map((d) => (
          <div key={d.id} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>Day {d.position + 1}{d.title ? ` · ${d.title}` : ""}</div>
            {d.distanceM != null && <div className="mono" style={{ fontSize: 11.5, color: "var(--slate)" }}>{formatDistance(d.distanceM)} · {formatDuration(d.durationS!)}</div>}
            {d.stops.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
                <span style={{ flex: 1 }}>{i + 1}. {s.name}</span>
                {endpointLabel(i, d.stops.length) && <span className="ovp" style={{ fontSize: 8.5, color: "var(--slate)" }}>{endpointLabel(i, d.stops.length)}</span>}
                <span style={{ fontSize: 11, color: "var(--slate)" }}>{STATUS_TAG[s.bookingStatus]}</span>
              </div>
            ))}
            {d.attached.length > 0 && (
              <>
                <div className="ovp" style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "var(--slate)", borderTop: "1px solid rgba(87,103,107,.16)", marginTop: 4, padding: "6px 0 0" }}>ALSO THIS DAY</div>
                {d.attached.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, color: "var(--slate)" }}>
                    <span style={{ flex: 1 }}>{s.name}</span>
                    <span style={{ fontSize: 11 }}>{STATUS_TAG[s.bookingStatus]}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
