import { sectionHead, dashedAction } from "../styles/ui";
import type { Point, PlaceInfo } from "../lib/types";

const CARD_BORDER = "1px solid rgba(30,42,44,.10)";

// Google Place Details card (server-cached 30 days). The caller owns the query —
// the editor asks the authenticated endpoint, the share page the token-scoped one.
// The Maps link is free — built from the stored place id, or plain coords for
// pin-dropped stops.
export function PlaceSection({ point: p, info }: { point: Point; info: PlaceInfo | undefined }) {
  const mapsUrl = p.googlePlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.googlePlaceId}`
    : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  const place = info?.status === "ok" ? info.place : undefined;
  return (
    <div>
      <div style={sectionHead}>PLACE</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {place && (
          <div style={{ padding: "11px 13px", background: "#fff", border: CARD_BORDER, borderRadius: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, boxShadow: "0 1px 2px rgba(22,33,31,.04)" }}>
            {place.rating != null && (
              <div style={{ fontWeight: 700 }}>
                ★ {place.rating.toFixed(1)}
                {place.userRatingCount != null && <span style={{ color: "var(--slate)", fontWeight: 400 }}> ({place.userRatingCount.toLocaleString()} reviews)</span>}
              </div>
            )}
            {place.formattedAddress && <div style={{ color: "var(--slate)" }}>{place.formattedAddress}</div>}
            {(place.websiteUri || place.phone) && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 1 }}>
                {place.websiteUri && <a href={place.websiteUri} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Website</a>}
                {place.phone && <a href={`tel:${place.phone}`} style={{ fontWeight: 600 }}>{place.phone}</a>}
              </div>
            )}
            {place.weekdayHours.length > 0 && (
              <details style={{ borderTop: "1px dashed rgba(30,42,44,.10)", marginTop: 4, paddingTop: 6 }}>
                <summary style={{ cursor: "pointer", color: "var(--slate)", fontWeight: 600, fontSize: 12 }}>Opening hours</summary>
                <div className="mono" style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2, color: "var(--slate)", fontSize: 10.5, textTransform: "uppercase" }}>
                  {place.weekdayHours.map((h, i) => <div key={i}>{h}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ ...dashedAction, alignSelf: "flex-start", color: "var(--slate)" }}>
          Open in Google Maps ↗
        </a>
      </div>
    </div>
  );
}
