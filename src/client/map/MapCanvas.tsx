import { Map, type MapMouseEvent } from "@vis.gl/react-google-maps";

const ICELAND = { lat: 64.9631, lng: -19.0208 };

// Renders the single persistent map. Must be mounted inside an <APIProvider> (the
// editor and share screens provide it) so sibling components can also use the SDK.
export function MapCanvas({ children, onMapClick }: { children?: React.ReactNode; onMapClick?: (latLng: { lat: number; lng: number }) => void }) {
  return (
    <Map
      mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID}
      defaultCenter={ICELAND}
      defaultZoom={6}
      gestureHandling="greedy"
      disableDefaultUI
      style={{ width: "100%", height: "100%" }}
      onClick={(e: MapMouseEvent) => { const ll = e.detail.latLng; if (ll && onMapClick) onMapClick(ll); }}
    >
      {children}
    </Map>
  );
}
