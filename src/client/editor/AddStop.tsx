import { useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapPin, Search } from "lucide-react";
import { useCreatePoint } from "../lib/api";
import { btnSecondary, E3, BORDER } from "../styles/ui";

// Frozen to the Essentials Place Details SKU (spec §5.2). Adding ratings/photos/hours
// silently escalates to Pro/Enterprise pricing — do NOT extend without a cost review.
export const PLACE_DETAILS_FIELDS = ["id", "displayName", "location", "formattedAddress"] as const;

// Minimal shapes for the New Places API surface we use (typings vary by @types version).
type PlaceLike = { fetchFields: (r: { fields: string[] }) => Promise<unknown>; displayName?: string; id?: string; location?: { lat: () => number; lng: () => number } };
type Prediction = { text: { text: string }; placeId: string; toPlace: () => PlaceLike };
type PlacesLib = {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (req: { input: string; sessionToken: unknown }) => Promise<{ suggestions: Array<{ placePrediction: Prediction | null }> }>;
  };
};

type Suggestion = { label: string; placeId: string; toPlace: () => PlaceLike };

// Fixed-position (anchored to the input) so the panel isn't clipped by the pool's
// overflow-y:auto scroll container; flips above the input and scrolls internally
// when the viewport bottom is too close (the pool sits at the bottom of the screen).
function panelStyle(r: DOMRect): React.CSSProperties {
  const below = window.innerHeight - r.bottom - 12;
  const place = below >= 180 ? { top: r.bottom + 4, maxHeight: below } : { bottom: window.innerHeight - r.top + 4, maxHeight: r.top - 12 };
  return { position: "fixed", left: r.left, width: Math.max(r.width, 250), zIndex: 30, overflowY: "auto", background: "#fff", border: BORDER, borderRadius: 11, boxShadow: E3, ...place };
}

// The typed match is bolded inside each suggestion label (first occurrence).
function BoldMatch({ label, query }: { label: string; query: string }) {
  const i = query ? label.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, i)}<b>{label.slice(i, i + query.length)}</b>{label.slice(i + query.length)}
    </>
  );
}

export function AddStop({ tripId }: { tripId: string }) {
  const places = useMapsLibrary("places") as unknown as PlacesLib | null;
  const create = useCreatePoint(tripId);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const tokenRef = useRef<unknown>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(input: string) {
    setQ(input);
    if (!places || !input) { setSuggestions([]); return; }
    if (!tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken(); // one session bundles the keystrokes
    const { suggestions: raw } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: tokenRef.current });
    if (inputRef.current) setAnchor(inputRef.current.getBoundingClientRect());
    setSuggestions(
      raw
        .filter((s): s is { placePrediction: Prediction } => !!s.placePrediction)
        .map((s) => ({ label: s.placePrediction.text.text, placeId: s.placePrediction.placeId, toPlace: () => s.placePrediction.toPlace() })),
    );
  }

  async function pick(s: Suggestion) {
    const place = s.toPlace();
    await place.fetchFields({ fields: [...PLACE_DETAILS_FIELDS] }); // terminating Place Details call ends the session
    await create.mutateAsync({
      name: place.displayName ?? s.label,
      lat: place.location!.lat(),
      lng: place.location!.lng(),
      coordSource: "google",
      googlePlaceId: place.id,
    });
    tokenRef.current = null;
    setOpen(false); setQ(""); setSuggestions([]);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...btnSecondary(30), flex: 1, padding: "0 10px", fontSize: 11.5, borderRadius: 8 }}>
        <Search size={12} aria-hidden /> Search a place
      </button>
    );
  }
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input ref={inputRef} role="textbox" autoFocus value={q} onChange={(e) => onChange(e.target.value)} placeholder="Search a place"
        onKeyDown={(e) => { if (e.key === "Enter" && suggestions.length > 0) { e.preventDefault(); void pick(suggestions[0]); } if (e.key === "Escape") { setOpen(false); setQ(""); setSuggestions([]); } }}
        style={{ width: "100%", height: 30, borderRadius: 8, border: "1px solid rgba(30,42,44,.16)", padding: "0 10px", fontSize: 12.5, fontFamily: "inherit", background: "#fff", boxShadow: "inset 0 1px 2px rgba(22,33,31,.04)" }} />
      {suggestions.length > 0 && anchor && (
        <div style={panelStyle(anchor)}>
          {suggestions.map((s, i) => (
            <button key={s.placeId} onClick={() => pick(s)}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", fontFamily: "inherit", background: i === 0 ? "var(--lupine-tint)" : "#fff", fontSize: 12.5, color: i === 0 ? "var(--ink)" : "var(--slate)", cursor: "pointer" }}>
              <MapPin size={13} aria-hidden style={{ flex: "none", color: i === 0 ? "var(--lupine)" : "#8FA3A0" }} />
              <span style={{ flex: 1, minWidth: 0 }}><BoldMatch label={s.label} query={q} /></span>
              {i === 0 && <span className="mono" aria-hidden style={{ flex: "none", fontSize: 9, color: "#8FA3A0" }}>↵</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
