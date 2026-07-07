import { useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { useCreatePoint } from "../lib/api";

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

export function AddStop({ tripId }: { tripId: string }) {
  const places = useMapsLibrary("places") as unknown as PlacesLib | null;
  const create = useCreatePoint(tripId);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const tokenRef = useRef<unknown>(null);

  async function onChange(input: string) {
    setQ(input);
    if (!places || !input) { setSuggestions([]); return; }
    if (!tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken(); // one session bundles the keystrokes
    const { suggestions: raw } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: tokenRef.current });
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
    return <button onClick={() => setOpen(true)} style={{ flex: 1, height: 32, background: "#fff", border: "1px solid rgba(87,103,107,.28)", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>🔍 Search a place</button>;
  }
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input role="textbox" autoFocus value={q} onChange={(e) => onChange(e.target.value)} placeholder="Search a place"
        style={{ width: "100%", height: 32, borderRadius: 7, border: "1px solid rgba(87,103,107,.28)", padding: "0 10px", fontSize: 12.5 }} />
      {suggestions.length > 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 36, zIndex: 10, background: "#fff", border: "1px solid rgba(87,103,107,.2)", borderRadius: 7, boxShadow: "0 8px 28px rgba(30,42,44,.16)", overflow: "hidden" }}>
          {suggestions.map((s) => (
            <button key={s.placeId} onClick={() => pick(s)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", border: "none", background: "#fff", fontSize: 12.5, cursor: "pointer" }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
